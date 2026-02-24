import { getRemoteDb } from "../../db/remote";
import { aiQueryLogs } from "../../db/remote-schema";
import { desc, sql, lt, eq, and } from "drizzle-orm";
import { readSettings } from "../../main/settings";
import log from "electron-log";

const logger = log.scope("ai_query_logger");

export interface LogAiQueryParams {
    queryType: string;
    model: string;
    promptSnippet: string;
    payload: any;
    response: any;
    inputTokens?: number;
    outputTokens?: number;
}

/**
 * Log an AI query with payload and response, and handle FIFO rotation.
 */
export async function logAiQuery(params: LogAiQueryParams, userId: string) {
    try {
        const settings = readSettings();
        const db = getRemoteDb();
        if (!settings.enableAllStatsAndLogs) {
            return;
        }
        const threshold = parseInt(settings.aiQueryLogRotationThreshold || "200", 10);

        // 1. Insert the new log
        await db.insert(aiQueryLogs).values({
            userId,
            queryType: params.queryType,
            model: params.model,
            promptSnippet: params.promptSnippet,
            payload: params.payload,
            response: params.response,
            inputTokens: params.inputTokens ?? null,
            outputTokens: params.outputTokens ?? null,
            createdAt: new Date(),
        });

        // 2. Handle rotation (FIFO)
        // Find how many entries we have for this user
        const counts = await db.select({ count: sql<number>`count(*)` }).from(aiQueryLogs).where(eq(aiQueryLogs.userId, userId));
        const total = Number(counts[0]?.count || 0);

        if (total > threshold) {
            // Find the threshold-th newest entry to determine the cutoff
            // We keep the 'threshold' most recent entries.
            const entriesToKeep = await db
                .select({ id: aiQueryLogs.id })
                .from(aiQueryLogs)
                .where(eq(aiQueryLogs.userId, userId))
                .orderBy(desc(aiQueryLogs.id))
                .limit(threshold);

            if (entriesToKeep.length > 0) {
                const oldestKeepId = entriesToKeep[entriesToKeep.length - 1].id;
                // Delete everything older than the oldest kept ID for this user
                await db.delete(aiQueryLogs).where(and(eq(aiQueryLogs.userId, userId), lt(aiQueryLogs.id, oldestKeepId)));
            }
        }
    } catch (error) {
        logger.error("Failed to log AI query", error);
    }
}
