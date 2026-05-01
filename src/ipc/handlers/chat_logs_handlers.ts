import { createTypedHandler, HandlerContext } from "./base";
import { chatLogsContracts } from "../types/chat_logs";
import { getRemoteDb } from "../../db/remote";
import * as remoteSchema from "../../db/remote-schema";
import { and, desc, eq } from "drizzle-orm";


export function registerChatLogsHandlers() {
  createTypedHandler(chatLogsContracts.getChatLogs, async (_event, params, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    const { chatId, messageId, limit = 500 } = params;

    const conditions = [eq(remoteSchema.chatLogs.chatId, chatId), eq(remoteSchema.chatLogs.userId, context.userId)];
    if (messageId !== undefined) {
      conditions.push(eq(remoteSchema.chatLogs.messageId, messageId));
    }

    const logs = await db
      .select()
      .from(remoteSchema.chatLogs)
      .where(and(...conditions))
      .orderBy(desc(remoteSchema.chatLogs.timestamp))
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

  createTypedHandler(chatLogsContracts.addChatLog, async (_event, entry, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    await db.insert(remoteSchema.chatLogs).values({
      userId: context.userId,
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
    async (_event, { chatId }, context) => {
      if (!context.userId) throw new Error("Unauthorized");
      const db = getRemoteDb();
      await db.delete(remoteSchema.chatLogs).where(and(eq(remoteSchema.chatLogs.chatId, chatId), eq(remoteSchema.chatLogs.userId, context.userId)));
    },
  );
}
