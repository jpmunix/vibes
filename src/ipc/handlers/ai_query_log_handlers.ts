import { db } from "../../db";
import { aiQueryLogs } from "../../db/schema";
import { desc, eq } from "drizzle-orm";
import { createTypedHandler } from "./base";
import { aiQueryLogContracts } from "../contracts/ai_query_logs";

export function registerAiQueryLogHandlers() {
    createTypedHandler(aiQueryLogContracts.getAiQueryLogs, async () => {
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
                .orderBy(desc(aiQueryLogs.id));
        } catch (error) {
            console.error("Error fetching AI query logs:", error);
            return [];
        }
    });

    createTypedHandler(aiQueryLogContracts.getAiQueryLogDetail, async (_, id) => {
        try {
            const results = await db
                .select()
                .from(aiQueryLogs)
                .where(eq(aiQueryLogs.id, id))
                .limit(1);
            return results[0] || null;
        } catch (error) {
            console.error("Error fetching AI query log detail:", error);
            return null;
        }
    });

    createTypedHandler(aiQueryLogContracts.getFullLogs, async () => {
        try {
            return await db.select().from(aiQueryLogs).orderBy(desc(aiQueryLogs.id));
        } catch (error) {
            console.error("Error fetching full logs:", error);
            return [];
        }
    });

    createTypedHandler(aiQueryLogContracts.addTestLog, async () => {
        const { logAiQuery } = await import("../utils/ai_query_logger");
        await logAiQuery({
            queryType: "test-manual",
            model: "test-model",
            promptSnippet: "This is a test log entry created manually.",
            payload: { test: true, message: "Hello world" },
            response: { success: true, answer: "Logging is working!" },
            inputTokens: 10,
            outputTokens: 20,
        });
    });

    createTypedHandler(aiQueryLogContracts.clearLogs, async () => {
        try {
            await db.delete(aiQueryLogs);
        } catch (error) {
            console.error("Error clearing logs:", error);
        }
    });
}
