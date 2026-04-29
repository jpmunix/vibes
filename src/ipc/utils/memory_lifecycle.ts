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
