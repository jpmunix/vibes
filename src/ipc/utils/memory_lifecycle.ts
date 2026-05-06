/**
 * Memory Lifecycle — Decay, Issue Transitions, Compaction
 *
 * Manages the lifecycle of agent memories:
 * - Decay: auto-extracted memories lose importance over time if not confirmed
 * - Issue lifecycle: state machine for bug tracking memories
 * - Compaction: merge related memories (on demand, via LLM)
 */

import log from "electron-log";
import { getRemoteDb } from "../../db/remote";
import * as remoteSchema from "../../db/remote-schema";
import { eq, and, asc, sql } from "drizzle-orm";

const logger = log.scope("memory_lifecycle");

// =============================================================================
// Legacy Type Migration (v1 → v2)
// =============================================================================


/**
 * Migrate legacy memory types to "session".
 * Idempotent — safe to call on every startup.
 * Converts fact, episode, decision → session in a single UPDATE.
 *
 * @returns number of memories migrated
 */
export async function migrateLegacyTypesToSession(userId: string): Promise<number> {
    try {
        const db = getRemoteDb();

        // Count first for logging
        const [countResult] = await db
            .select({ count: sql<number>`COUNT(*)` })
            .from(remoteSchema.memories)
            .where(
                and(
                    eq(remoteSchema.memories.userId, userId),
                    sql`${remoteSchema.memories.type} IN ('fact', 'episode', 'decision')`,
                ),
            );

        const legacyCount = countResult?.count ?? 0;
        if (legacyCount === 0) return 0;

        // Migrate all in one UPDATE
        await db
            .update(remoteSchema.memories)
            .set({ type: "session", updatedAt: new Date() })
            .where(
                and(
                    eq(remoteSchema.memories.userId, userId),
                    sql`${remoteSchema.memories.type} IN ('fact', 'episode', 'decision')`,
                ),
            );

        logger.info(`[Migration] Migrated ${legacyCount} memories from legacy types (fact/episode/decision) → session for user ${userId.slice(0, 8)}...`);
        return legacyCount;

    } catch (error: any) {
        logger.warn(`[Migration] Legacy type migration failed: ${error.message}`);
        return 0;
    }
}

// =============================================================================
// Verdugo + Hard Limit (replaces arithmetic decay)
// =============================================================================

/** Days of disuse before a zombie memory is disabled */
const ZOMBIE_THRESHOLD_DAYS = 90;

/** Importance threshold for zombie detection */
const ZOMBIE_IMPORTANCE_THRESHOLD = 30;

/** Maximum active memories per app before pruning */
const HARD_LIMIT = 500;

/** Number of memories to prune when hard limit is exceeded */
const PRUNE_COUNT = 50;

/**
 * Memory maintenance — replaces the old arithmetic decay.
 *
 * With the lastUsed feedback loop from the Router, memories that are
 * useful naturally stay near the top. Arithmetic decay is no longer needed.
 *
 * Two rules:
 * 1. Verdugo: auto memories with lastUsed > 90 days + importance < 30 → disabled
 * 2. Hard Limit: if >500 active memories per app, prune the 50 worst
 *
 * source="manual" memories NEVER get disabled by the Verdugo.
 *
 * @returns number of memories disabled
 */
export async function decayMemories(
    appId: number,
    userId: string,
): Promise<number> {
    try {
        const db = getRemoteDb();
        let disabledCount = 0;

        // ── Rule 1: Verdugo (zombies by disuse) ────────────────────────────
        const cutoffDate = new Date(Date.now() - ZOMBIE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);

        const zombieResult = await db
            .update(remoteSchema.memories)
            .set({ enabled: 0 })
            .where(
                and(
                    eq(remoteSchema.memories.userId, userId),
                    eq(remoteSchema.memories.appId, appId),
                    eq(remoteSchema.memories.enabled, 1),
                    eq(remoteSchema.memories.source, "auto"),
                    sql`${remoteSchema.memories.importance} < ${ZOMBIE_IMPORTANCE_THRESHOLD}`,
                    sql`COALESCE(${remoteSchema.memories.lastUsed}, ${remoteSchema.memories.createdAt}) < ${Math.floor(cutoffDate.getTime() / 1000)}`,
                ),
            );

        const zombieCount = (zombieResult as any)?.changes ?? 0;
        if (zombieCount > 0) {
            logger.info(`[Verdugo] Disabled ${zombieCount} zombie memories (lastUsed > ${ZOMBIE_THRESHOLD_DAYS}d, importance < ${ZOMBIE_IMPORTANCE_THRESHOLD}) for appId=${appId}`);
            disabledCount += zombieCount;
        }

        // ── Rule 2: Hard Limit (prune by volume) ───────────────────────────
        const [countResult] = await db
            .select({ count: sql<number>`COUNT(*)` })
            .from(remoteSchema.memories)
            .where(
                and(
                    eq(remoteSchema.memories.userId, userId),
                    eq(remoteSchema.memories.appId, appId),
                    eq(remoteSchema.memories.enabled, 1),
                ),
            );

        const activeCount = countResult?.count ?? 0;
        if (activeCount > HARD_LIMIT) {
            // Find the 50 worst by importance + lastUsed
            const worst = await db
                .select({ id: remoteSchema.memories.id })
                .from(remoteSchema.memories)
                .where(
                    and(
                        eq(remoteSchema.memories.userId, userId),
                        eq(remoteSchema.memories.appId, appId),
                        eq(remoteSchema.memories.enabled, 1),
                    ),
                )
                .orderBy(
                    asc(remoteSchema.memories.importance),
                    asc(remoteSchema.memories.lastUsed),
                )
                .limit(PRUNE_COUNT);

            if (worst.length > 0) {
                const worstIds = worst.map(r => r.id);
                await db
                    .update(remoteSchema.memories)
                    .set({ enabled: 0 })
                    .where(
                        and(
                            eq(remoteSchema.memories.userId, userId),
                            sql`${remoteSchema.memories.id} IN (${worstIds.join(",")})`,
                        ),
                    );

                logger.info(`[HardLimit] Pruned ${worst.length} memories (active count was ${activeCount}, limit ${HARD_LIMIT}) for appId=${appId}`);
                disabledCount += worst.length;
            }
        }

        return disabledCount;

    } catch (error: any) {
        logger.warn(`[Lifecycle] Maintenance failed: ${error.message}`);
        return 0;
    }
}

// =============================================================================
// Issue Lifecycle
// =============================================================================

/**
 * Issue status transitions:
 *
 *   active → fix_attempted        (when agent applies a related fix)
 *   fix_attempted → suspected_resolved  (after 3 sessions without re-mention)
 *   suspected_resolved → resolved       (after 7 sessions without re-mention)
 *   resolved → deprecated               (after 30 days)
 *   ANY → active                        (if issue reappears — regression)
 *
 * These transitions are called from the write pipeline when an issue is
 * re-detected or from external triggers.
 */

export type IssueTransition =
    | "fix_attempted"
    | "suspected_resolved"
    | "resolved"
    | "deprecated"
    | "reactivate";

/**
 * Transition an issue memory to a new status.
 */
export async function transitionIssue(
    memoryId: number,
    userId: string,
    transition: IssueTransition,
): Promise<boolean> {
    try {
        const db = getRemoteDb();

        const [mem] = await db
            .select()
            .from(remoteSchema.memories)
            .where(
                and(
                    eq(remoteSchema.memories.id, memoryId),
                    eq(remoteSchema.memories.userId, userId),
                    eq(remoteSchema.memories.type, "issue"),
                ),
            );

        if (!mem) {
            logger.warn(`[Issue] Memory id=${memoryId} not found or not an issue`);
            return false;
        }

        const currentStatus = mem.status || "active";
        let newStatus: string;

        switch (transition) {
            case "fix_attempted":
                if (currentStatus !== "active") return false;
                newStatus = "fix_attempted";
                break;
            case "suspected_resolved":
                if (currentStatus !== "fix_attempted") return false;
                newStatus = "suspected_resolved";
                break;
            case "resolved":
                if (currentStatus !== "suspected_resolved") return false;
                newStatus = "resolved";
                break;
            case "deprecated":
                if (currentStatus !== "resolved") return false;
                newStatus = "deprecated";
                break;
            case "reactivate":
                // Regression — any status can go back to active
                newStatus = "active";
                break;
            default:
                return false;
        }

        await db
            .update(remoteSchema.memories)
            .set({
                status: newStatus,
                updatedAt: new Date(),
            })
            .where(eq(remoteSchema.memories.id, memoryId));

        logger.info(`[Issue] Transitioned id=${memoryId}: ${currentStatus} → ${newStatus}`);
        return true;

    } catch (error: any) {
        logger.warn(`[Issue] Transition failed for id=${memoryId}: ${error.message}`);
        return false;
    }
}

// =============================================================================
// Confirm (reset decay)
// =============================================================================

/**
 * Confirm a memory — resets its decay by marking it as manual source
 * and restoring importance. Used when a user explicitly confirms
 * an auto-extracted memory is correct.
 */
export async function confirmMemory(
    memoryId: number,
    userId: string,
): Promise<boolean> {
    try {
        const db = getRemoteDb();

        await db
            .update(remoteSchema.memories)
            .set({
                source: "manual",
                importance: 80, // Restore to high importance
                enabled: 1,
                updatedAt: new Date(),
            })
            .where(
                and(
                    eq(remoteSchema.memories.id, memoryId),
                    eq(remoteSchema.memories.userId, userId),
                ),
            );

        logger.info(`[Confirm] Memory id=${memoryId} confirmed — source=manual, importance=80`);
        return true;

    } catch (error: any) {
        logger.warn(`[Confirm] Failed for id=${memoryId}: ${error.message}`);
        return false;
    }
}

// =============================================================================
// Compaction — Merge old session memories
// =============================================================================

/** Minimum active sessions before compaction triggers */
const COMPACTION_THRESHOLD = 20;

/** Minimum old sessions to justify a compaction LLM call */
const MIN_OLD_SESSIONS = 5;

/** Days after which sessions are eligible for compaction */
const COMPACTION_AGE_DAYS = 30;

/**
 * Compact old session memories into a single dense summary.
 *
 * Flow:
 * 1. Count active session memories for this app
 * 2. If < COMPACTION_THRESHOLD, skip (pool is small enough)
 * 3. Find sessions older than COMPACTION_AGE_DAYS
 * 4. If < MIN_OLD_SESSIONS old sessions, skip (not worth the LLM call)
 * 5. Send old sessions to LLM to merge into 1 dense summary
 * 6. Insert the merged memory, disable the originals
 *
 * Idempotent — safe to call after every batch synthesis.
 *
 * @returns number of memories compacted (0 if skipped)
 */
export async function compactOldSessions(
    appId: number,
    userId: string,
): Promise<number> {
    try {
        const db = getRemoteDb();

        // 1. Count active session memories
        const [countResult] = await db
            .select({ count: sql<number>`COUNT(*)` })
            .from(remoteSchema.memories)
            .where(
                and(
                    eq(remoteSchema.memories.userId, userId),
                    eq(remoteSchema.memories.appId, appId),
                    eq(remoteSchema.memories.enabled, 1),
                    eq(remoteSchema.memories.type, "session"),
                ),
            );

        const activeCount = countResult?.count ?? 0;
        if (activeCount < COMPACTION_THRESHOLD) return 0;

        // 2. Find old sessions
        const cutoff = new Date(Date.now() - COMPACTION_AGE_DAYS * 24 * 60 * 60 * 1000);
        const oldSessions = await db
            .select()
            .from(remoteSchema.memories)
            .where(
                and(
                    eq(remoteSchema.memories.userId, userId),
                    eq(remoteSchema.memories.appId, appId),
                    eq(remoteSchema.memories.enabled, 1),
                    eq(remoteSchema.memories.type, "session"),
                    sql`${remoteSchema.memories.updatedAt} < ${Math.floor(cutoff.getTime() / 1000)}`,
                ),
            )
            .orderBy(asc(remoteSchema.memories.updatedAt));

        if (oldSessions.length < MIN_OLD_SESSIONS) return 0;

        // 3. Build compaction prompt
        const sessionTexts = oldSessions.map((m, i) =>
            `[#${m.id}] key:${m.key || "—"} | imp:${m.importance}\n${m.content}`
        ).join("\n---\n");

        const compactionPrompt = [
            "Eres un sistema de compactación de memoria para un agente de programación.",
            "Se te dan varias memorias tipo 'session' antiguas de un mismo proyecto.",
            "",
            "Tu objetivo: fusionarlas en UN SOLO párrafo denso (100-300 palabras) que preserve:",
            "- Decisiones arquitecturales clave",
            "- Patrones establecidos y convenciones",
            "- Gotchas descubiertos que siguen siendo relevantes",
            "- Ficheros clave si son referenciados por múltiples memorias",
            "",
            "ELIMINA:",
            "- Detalles de implementación puntual (cambios de texto, colores, refactors menores)",
            "- Información contradictoria (quédate con la más reciente)",
            "- Redundancias (menciona cada concepto UNA sola vez)",
            "",
            "FORMATO DE SALIDA:",
            "Devuelve ÚNICAMENTE un objeto JSON:",
            '{"content": "Párrafo denso en español...", "key": "compacted_sessions_YYYYMMDD", "importance": 0.85}',
            "",
            "El primer carácter DEBE ser `{` y el último `}`.",
        ].join("\n");

        const userMessage = [
            `## ${oldSessions.length} memorias session a compactar:`,
            "",
            sessionTexts,
        ].join("\n");

        // 4. LLM call
        const { readSettings } = await import("../../main/settings");
        const { openRouterCompletion, hasOpenRouterApiKey } = await import("./openrouter");
        const { DEFAULT_STANDARD_MODEL } = await import("../../lib/schemas");

        if (!hasOpenRouterApiKey()) return 0;

        const settings = readSettings();
        const baseModel = (settings as any).memoriesSynthesisModelV2
            || (settings as any).standardModeModel
            || DEFAULT_STANDARD_MODEL;
        const model = baseModel.includes(":") ? baseModel : baseModel + ":nitro";

        const t0 = Date.now();
        const data = await openRouterCompletion({
            model,
            messages: [
                { role: "system", content: compactionPrompt },
                { role: "user", content: userMessage },
            ],
            temperature: 0.2,
            max_tokens: 600,
            response_format: { type: "json_object" },
            title: "Vibes - Memory Compaction",
        });
        const durationMs = Date.now() - t0;

        const rawContent = data.choices?.[0]?.message?.content?.trim();
        if (!rawContent) {
            logger.warn(`[Compaction] LLM returned empty response (${durationMs}ms)`);
            return 0;
        }

        // 5. Parse response
        let parsed: { content: string; key: string; importance: number };
        try {
            const { extractJsonFromLLM } = await import("./memory_json_extractor");
            parsed = extractJsonFromLLM(rawContent);
            if (!parsed?.content || typeof parsed.content !== "string") {
                logger.warn("[Compaction] Invalid JSON structure from LLM");
                return 0;
            }
        } catch {
            logger.warn("[Compaction] Failed to parse LLM response as JSON");
            return 0;
        }

        // 6. Insert compacted memory
        const now = new Date();
        const compactedKey = parsed.key || `compacted_sessions_${now.toISOString().slice(0, 10).replace(/-/g, "")}`;

        await db.insert(remoteSchema.memories).values({
            userId,
            appId,
            type: "session",
            key: compactedKey,
            content: parsed.content,
            importance: parsed.importance ?? 0.85,
            source: "auto",
            enabled: 1,
            createdAt: now,
            updatedAt: now,
            lastUsed: now,
        });

        // 7. Disable originals
        const oldIds = oldSessions.map(m => m.id);
        for (const id of oldIds) {
            await db
                .update(remoteSchema.memories)
                .set({ enabled: 0, updatedAt: now })
                .where(eq(remoteSchema.memories.id, id));
        }

        logger.info(`[Compaction] Merged ${oldSessions.length} old sessions → 1 compacted memory (key: ${compactedKey}, ${durationMs}ms) for appId=${appId}`);
        return oldSessions.length;

    } catch (error: any) {
        logger.warn(`[Compaction] Failed: ${error.message}`);
        return 0;
    }
}
