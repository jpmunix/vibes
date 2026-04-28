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
import { eq, and, or, lt } from "drizzle-orm";

const logger = log.scope("memory_lifecycle");

// =============================================================================
// Decay
// =============================================================================

/**
 * Decay importance of stale auto-extracted memories.
 * Only affects source="auto" memories that haven't been manually confirmed.
 *
 * Rules:
 * - Decays by 5 importance points per day since last update
 * - Memories below importance 15 (0.15) are auto-disabled
 * - source="manual" memories NEVER decay
 *
 * @returns number of memories that were decayed or disabled
 */
export async function decayMemories(
    appId: number,
    userId: string,
): Promise<number> {
    try {
        const db = getRemoteDb();

        // Load auto-extracted, enabled memories for this app + global
        const candidates = await db
            .select()
            .from(remoteSchema.memories)
            .where(
                and(
                    eq(remoteSchema.memories.userId, userId),
                    or(
                        eq(remoteSchema.memories.appId, appId),
                        eq(remoteSchema.memories.appId, 0),
                    ),
                    eq(remoteSchema.memories.enabled, 1),
                    eq(remoteSchema.memories.source, "auto"),
                ),
            );

        if (candidates.length === 0) return 0;

        const now = Date.now();
        let decayedCount = 0;

        for (const mem of candidates) {
            const updatedMs = mem.updatedAt instanceof Date
                ? mem.updatedAt.getTime()
                : (mem.updatedAt as number) * 1000; // Unix timestamp seconds → ms

            const daysSinceUpdate = (now - updatedMs) / (1000 * 60 * 60 * 24);

            // Only decay if at least 1 day old
            if (daysSinceUpdate < 1) continue;

            const decayPoints = Math.floor(daysSinceUpdate) * 5; // 5 points per day
            const currentImportance = mem.importance ?? 50;
            const newImportance = Math.max(0, currentImportance - decayPoints);

            if (newImportance === currentImportance) continue;

            if (newImportance < 15) {
                // Disable the memory — too stale to be useful
                await db
                    .update(remoteSchema.memories)
                    .set({
                        importance: newImportance,
                        enabled: 0,
                        updatedAt: new Date(),
                    })
                    .where(eq(remoteSchema.memories.id, mem.id));

                logger.info(`[Decay] Disabled memory id=${mem.id} (importance ${currentImportance} → ${newImportance})`);
            } else {
                // Just reduce importance
                await db
                    .update(remoteSchema.memories)
                    .set({
                        importance: newImportance,
                        // Note: do NOT update updatedAt here — that would reset the decay clock
                    })
                    .where(eq(remoteSchema.memories.id, mem.id));

                logger.info(`[Decay] Decayed memory id=${mem.id} (importance ${currentImportance} → ${newImportance})`);
            }

            decayedCount++;
        }

        if (decayedCount > 0) {
            logger.info(`[Decay] Total: ${decayedCount} memories decayed for appId=${appId}`);
        }

        return decayedCount;

    } catch (error: any) {
        logger.warn(`[Decay] Failed: ${error.message}`);
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
