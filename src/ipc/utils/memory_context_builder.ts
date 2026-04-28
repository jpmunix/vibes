/**
 * Memory Context Builder — Read Pipeline
 *
 * Retrieves relevant memories for an app and formats them
 * as a compressed instruction block for injection into
 * the AI agent's context (OpenCode instructions[]).
 *
 * Scoring: importance × 0.5 + recency × 0.3 + typeWeight × 0.2
 * No embeddings — pure score-based retrieval.
 */

import log from "electron-log";
import { getRemoteDb } from "../../db/remote";
import * as remoteSchema from "../../db/remote-schema";
import { eq, and } from "drizzle-orm";

const logger = log.scope("memory_context");

// =============================================================================
// Constants
// =============================================================================

/** Maximum memories to inject into context */
const MAX_MEMORIES_IN_CONTEXT = 7;

/** Weight by memory type — preferences affect code generation most directly */
const TYPE_WEIGHTS: Record<string, number> = {
    preference: 1.0,
    fact: 0.9,
    decision: 0.8,
    issue: 0.6,
    episode: 0.4,
};

/** Type labels for formatted output */
const TYPE_LABELS: Record<string, string> = {
    fact: "fact",
    preference: "pref",
    decision: "decision",
    issue: "issue",
    episode: "episode",
};

// =============================================================================
// Recency scoring
// =============================================================================

function computeRecency(updatedAt: Date | string | number): number {
    const updated = typeof updatedAt === "number"
        ? updatedAt * 1000 // Unix timestamp (seconds) from SQLite
        : new Date(updatedAt).getTime();
    const now = Date.now();
    const hoursAgo = (now - updated) / (1000 * 60 * 60);

    if (hoursAgo < 24) return 1.0;
    if (hoursAgo < 24 * 7) return 0.8;
    if (hoursAgo < 24 * 30) return 0.5;
    return 0.2;
}

// =============================================================================
// Main builder
// =============================================================================

/**
 * Build a formatted memory context block for injection into agent instructions.
 * Returns empty string if no memories are available.
 */
export async function buildMemoryContext(
    appId: number,
    userId: string,
): Promise<string> {
    try {
        const db = getRemoteDb();

        // Query: app-specific, enabled only
        const rows = await db
            .select()
            .from(remoteSchema.memories)
            .where(
                and(
                    eq(remoteSchema.memories.userId, userId),
                    eq(remoteSchema.memories.appId, appId),
                    eq(remoteSchema.memories.enabled, 1),
                ),
            );

        if (rows.length === 0) return "";

        // Score each memory
        const scored = rows.map(row => {
            const importance = (row.importance ?? 50) / 100; // Convert 0–100 → 0.0–1.0
            const recency = computeRecency(row.updatedAt);
            const typeWeight = TYPE_WEIGHTS[row.type] ?? 0.5;

            const score =
                importance * 0.5 +
                recency * 0.3 +
                typeWeight * 0.2;

            return { row, score };
        });

        // Sort by score descending, take top N
        scored.sort((a, b) => b.score - a.score);
        const top = scored.slice(0, MAX_MEMORIES_IN_CONTEXT);

        // Format as compact block
        const lines = top.map(({ row }) => {
            const label = TYPE_LABELS[row.type] || row.type;
            const statusSuffix = row.type === "issue" && row.status
                ? `:${row.status}`
                : "";
            return `• [${label}${statusSuffix}] ${row.content}`;
        });

        const block = [
            "[MEMORY] Project and user context from previous sessions:",
            ...lines,
        ].join("\n");

        logger.info(`[Memory] Context built: ${top.length} memories (${block.length} chars) for appId=${appId}`);
        return block;

    } catch (error: any) {
        logger.warn(`[Memory] Context build failed: ${error.message}`);
        return "";
    }
}
