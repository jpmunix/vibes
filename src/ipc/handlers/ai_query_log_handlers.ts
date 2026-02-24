import { getRemoteDb } from "../../db/remote";
import { aiQueryLogs } from "../../db/remote-schema";
import { desc, eq, and } from "drizzle-orm";
import { createTypedHandler, HandlerContext } from "./base";
import { aiQueryLogContracts } from "../contracts/ai_query_logs";
import { logAiQuery } from "../utils/ai_query_logger";

export function registerAiQueryLogHandlers() {
    createTypedHandler(aiQueryLogContracts.getAiQueryLogs, async (_, __, context) => {
        if (!context.userId) throw new Error("Unauthorized");
        const db = getRemoteDb();
        try {
            return await db
                .select({
                    id: aiQueryLogs.id,
                    queryType: aiQueryLogs.queryType,
                    model: aiQueryLogs.model,
                    promptSnippet: aiQueryLogs.promptSnippet,
                    inputTokens: aiQueryLogs.inputTokens,
                    outputTokens: aiQueryLogs.outputTokens,
                    createdAt: aiQueryLogs.createdAt,
                })
                .from(aiQueryLogs)
                .where(eq(aiQueryLogs.userId, context.userId))
                .orderBy(desc(aiQueryLogs.id));
        } catch (error) {
            console.error("Error fetching AI query logs:", error);
            return [];
        }
    });

    createTypedHandler(aiQueryLogContracts.getAiQueryLogDetail, async (_, id, context) => {
        if (!context.userId) throw new Error("Unauthorized");
        const db = getRemoteDb();
        try {
            const results = await db
                .select()
                .from(aiQueryLogs)
                .where(and(eq(aiQueryLogs.id, id), eq(aiQueryLogs.userId, context.userId)))
                .limit(1);
            return results[0] || null;
        } catch (error) {
            console.error("Error fetching AI query log detail:", error);
            return null;
        }
    });

    createTypedHandler(aiQueryLogContracts.getFullLogs, async (_, __, context) => {
        if (!context.userId) throw new Error("Unauthorized");
        const db = getRemoteDb();
        try {
            return await db.select().from(aiQueryLogs).where(eq(aiQueryLogs.userId, context.userId)).orderBy(desc(aiQueryLogs.id));
        } catch (error) {
            console.error("Error fetching full logs:", error);
            return [];
        }
    });

    createTypedHandler(aiQueryLogContracts.addTestLog, async (_, __, context) => {
        if (!context.userId) throw new Error("Unauthorized");
        // const { logAiQuery } = await import("../utils/ai_query_logger");
        await logAiQuery({
            queryType: "test-manual",
            model: "test-model",
            promptSnippet: "This is a test log entry created manually.",
            payload: { test: true, message: "Hello world" },
            response: { success: true, answer: "Logging is working!" },
            inputTokens: 10,
            outputTokens: 20,
        }, context.userId);
    });

    createTypedHandler(aiQueryLogContracts.clearLogs, async (_, __, context) => {
        if (!context.userId) throw new Error("Unauthorized");
        const db = getRemoteDb();
        try {
            await db.delete(aiQueryLogs).where(eq(aiQueryLogs.userId, context.userId));
        } catch (error) {
            console.error("Error clearing logs:", error);
        }
    });
}
