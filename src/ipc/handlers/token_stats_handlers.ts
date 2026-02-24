import { createTypedHandler, HandlerContext } from "./base";
import { tokenStatsContracts } from "../types/token_stats";
import { getRemoteDb } from "../../db/remote";
import { aiQueryLogs } from "../../db/remote-schema";
import { eq, desc } from "drizzle-orm";

export function registerTokenStatsHandlers() {
  createTypedHandler(tokenStatsContracts.getTokenStats, async (_, __, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();

    try {
      const logs = await db
        .select()
        .from(aiQueryLogs)
        .where(eq(aiQueryLogs.userId, context.userId))
        .orderBy(desc(aiQueryLogs.id))
        .limit(300);

      return logs.map((log) => {
        let payload: any = {};
        try {
          payload = JSON.parse(log.payload);
        } catch (e) {
          // Fallback if not JSON
        }

        return {
          chatId: payload.chatId || 0,
          messageId: payload.messageId || 0,
          totalTokens: (log.inputTokens || 0) + (log.outputTokens || 0),
          promptTokens: log.inputTokens || 0,
          completionTokens: log.outputTokens || 0,
          model: log.model,
          timestamp: log.createdAt instanceof Date ? log.createdAt.getTime() : Number(log.createdAt),
          appId: payload.appId || null,
        };
      });
    } catch (error) {
      console.error(\"Error fetching token stats from remote DB:\", error);
      return [];
    }
  });
}
