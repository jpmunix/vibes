/**
 * Memory Lifecycle — Decay, Issue Transitions, Compaction
 *
 * decayMemories and compactOldSessions are disabled (no-op stubs).
 * migrateLegacyTypesToSession, transitionIssue, and confirmMemory
 * are kept functional for backward compatibility.
 */

import log from "electron-log";
import { getRemoteDb } from "../../db/remote";
import * as remoteSchema from "../../db/remote-schema";
import { eq, and, asc, sql, inArray } from "drizzle-orm";

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
// Decay — DISABLED (no-op stub)
// =============================================================================

/**
 * Memory maintenance — DISABLED.
 * @returns 0 (no memories disabled)
 */
export async function decayMemories(
    _appId: number,
    _userId: string,
): Promise<number> {
    return 0;
}

// =============================================================================
// Issue Lifecycle
// =============================================================================

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
 * and restoring importance.
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
                importance: 80,
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
// Compaction — DISABLED (no-op stub)
// =============================================================================

/**
 * Compact old session memories — DISABLED.
 * @returns 0 (no memories compacted)
 */
export async function compactOldSessions(
    _appId: number,
    _userId: string,
    _options?: { force?: boolean },
): Promise<number> {
    return 0;
}
