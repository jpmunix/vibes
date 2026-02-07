import { createTypedHandler } from "./base";
import { chatLogsContracts } from "../types/chat_logs";
import { db } from "../../db";
import { chatLogs } from "../../db/schema";
import { and, desc, eq } from "drizzle-orm";

export function registerChatLogsHandlers() {
  createTypedHandler(chatLogsContracts.getChatLogs, async (_event, params) => {
    const { chatId, messageId, limit = 500 } = params;

    const conditions = [eq(chatLogs.chatId, chatId)];
    if (messageId !== undefined) {
      conditions.push(eq(chatLogs.messageId, messageId));
    }

    const logs = await db
      .select()
      .from(chatLogs)
      .where(and(...conditions))
      .orderBy(desc(chatLogs.timestamp))
      .limit(limit);

    return logs.map((log) => ({
      id: log.id,
      chatId: log.chatId,
      messageId: log.messageId ?? undefined,
      level: log.level as "debug" | "info" | "warn" | "error",
      category: log.category,
      message: log.message,
      metadata: log.metadata ?? undefined,
      timestamp: log.timestamp.getTime(),
    }));
  });

  createTypedHandler(chatLogsContracts.addChatLog, async (_event, entry) => {
    await db.insert(chatLogs).values({
      chatId: entry.chatId,
      messageId: entry.messageId ?? null,
      level: entry.level,
      category: entry.category,
      message: entry.message,
      metadata: entry.metadata ?? null,
      timestamp: new Date(entry.timestamp),
    });
  });

  createTypedHandler(
    chatLogsContracts.clearChatLogs,
    async (_event, { chatId }) => {
      await db.delete(chatLogs).where(eq(chatLogs.chatId, chatId));
    },
  );
}
