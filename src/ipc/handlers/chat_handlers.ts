import { getRemoteDb } from "../../db/remote";
import * as remoteSchema from "../../db/remote-schema";
import { desc, eq, and, like, ne, gte, sql } from "drizzle-orm";
import type { ChatSearchResult, ChatSummary } from "../../lib/schemas";
import { DEFAULT_STANDARD_MODEL } from "../../lib/schemas";

import log from "electron-log";
import { getVibesAppPath } from "../../paths/paths";
import { getCurrentCommitHash } from "../utils/git_utils";
import { createTypedHandler } from "./base";
import { chatContracts } from "../types/chat";
import { openRouterCompletion, hasOpenRouterApiKey } from "../utils/openrouter";
import { logChatInfo } from "../utils/chat_logger";
import { normalizeLegacyTags } from "../../../shared/normalizeLegacyTags";

const logger = log.scope("chat_handlers");

export function registerChatHandlers() {
  createTypedHandler(chatContracts.createChat, async (_, appId, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();

    // Get the app's path first
    const app = await db.query.apps.findFirst({
      where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId)),
      columns: {
        path: true,
      },
    });

    if (!app) {
      throw new Error("App not found");
    }

    let initialCommitHash = null;
    try {
      // Get the current git revision of the currently checked-out branch
      initialCommitHash = await getCurrentCommitHash({
        path: getVibesAppPath(app.path),
      });
    } catch (error) {
      logger.error("Error getting git revision:", error);
      // Continue without the git revision
    }

    // Create a new chat
    const [chat] = await db
      .insert(remoteSchema.chats)
      .values({
        appId,
        userId: context.userId,
        initialCommitHash,
        createdAt: new Date(),
      })
      .returning();
    logger.info(
      "Created chat:",
      chat.id,
      "for app:",
      appId,
      "with initial commit hash:",
      initialCommitHash,
    );
    return chat.id;
  });

  createTypedHandler(chatContracts.getChat, async (_, chatId, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();

    const chat = await db.query.chats.findFirst({
      where: and(eq(remoteSchema.chats.id, chatId), eq(remoteSchema.chats.userId, context.userId)),
      with: {
        messages: {
          orderBy: (messages, { asc }) => [asc(messages.createdAt)],
        },
      },
    });

    if (!chat) {
      throw new Error("Chat not found");
    }

    return {
      ...chat,
      title: chat.title ?? "",
      messages: chat.messages.map((m) => ({
        ...m,
        content: m.content ? normalizeLegacyTags(m.content) : m.content,
        role: m.role as "user" | "assistant",
      })),
      isPlan: chat.isPlan ?? false,
      planData: chat.planData ?? null,
    };
  });

  createTypedHandler(chatContracts.getChats, async (_, appId, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();

    // If appId is provided, filter chats for that app
    const query = appId
      ? db.query.chats.findMany({
        where: and(
          eq(remoteSchema.chats.appId, appId),
          eq(remoteSchema.chats.userId, context.userId),
          eq(remoteSchema.chats.isArchived, 0),
        ),
        columns: {
          id: true,
          title: true,
          createdAt: true,
          appId: true,
          isPlan: true,
          lastReadAt: true,
        },
        orderBy: [desc(remoteSchema.chats.createdAt)],
      })
      : db.query.chats.findMany({
        where: and(
          eq(remoteSchema.chats.userId, context.userId),
          eq(remoteSchema.chats.isArchived, 0),
        ),
        columns: {
          id: true,
          title: true,
          createdAt: true,
          appId: true,
          isPlan: true,
          lastReadAt: true,
        },
        orderBy: [desc(remoteSchema.chats.createdAt)],
      });

    const allChats = await query;
    return allChats as unknown as ChatSummary[];
  });

  createTypedHandler(chatContracts.deleteChat, async (_, chatId, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    await db.delete(remoteSchema.chats).where(and(eq(remoteSchema.chats.id, chatId), eq(remoteSchema.chats.userId, context.userId)));
  });

  createTypedHandler(chatContracts.updateChat, async (_, params, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    const { chatId, title, isPlan, planData } = params;
    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (isPlan !== undefined) updateData.isPlan = isPlan;
    if (planData !== undefined) updateData.planData = planData;

    if (Object.keys(updateData).length > 0) {
      await db.update(remoteSchema.chats).set(updateData).where(and(eq(remoteSchema.chats.id, chatId), eq(remoteSchema.chats.userId, context.userId)));
    }
  });

  createTypedHandler(chatContracts.savePlanData, async (_, { chatId, planData }, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    await db.update(remoteSchema.chats).set({
      planData,
      isPlan: true,
    }).where(and(eq(remoteSchema.chats.id, chatId), eq(remoteSchema.chats.userId, context.userId)));
  });

  createTypedHandler(chatContracts.getPlanData, async (_, chatId, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    const chat = await db.query.chats.findFirst({
      where: and(eq(remoteSchema.chats.id, chatId), eq(remoteSchema.chats.userId, context.userId)),
      columns: { planData: true },
    });
    return chat?.planData ?? null;
  });


  createTypedHandler(chatContracts.searchChats, async (_, params, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    const { appId, query } = params;

    // 1) Find chats by title and map to ChatSearchResult with no matched message
    const chatTitleMatches = await db
      .select({
        id: remoteSchema.chats.id,
        appId: remoteSchema.chats.appId,
        title: remoteSchema.chats.title,
        createdAt: remoteSchema.chats.createdAt,
        isPlan: remoteSchema.chats.isPlan,
      })
      .from(remoteSchema.chats)
      .where(and(
        eq(remoteSchema.chats.appId, appId),
        eq(remoteSchema.chats.userId, context.userId),
        like(remoteSchema.chats.title, `%${query}%`)
      ))
      .orderBy(desc(remoteSchema.chats.createdAt))
      .limit(10);

    const titleResults: ChatSearchResult[] = chatTitleMatches.map((c) => ({
      id: c.id,
      appId: c.appId as number,
      title: c.title || "",
      createdAt: c.createdAt as unknown as string,
      matchedMessageContent: null,
      isPlan: c.isPlan ?? false,
    }));

    // 2) Find messages that match and join to chats to build one result per message
    const messageResults = await db
      .select({
        id: remoteSchema.chats.id,
        appId: remoteSchema.chats.appId,
        title: remoteSchema.chats.title,
        createdAt: remoteSchema.chats.createdAt,
        isPlan: remoteSchema.chats.isPlan,
        matchedMessageContent: remoteSchema.messages.content,
      })
      .from(remoteSchema.messages)
      .innerJoin(remoteSchema.chats, eq(remoteSchema.messages.chatId, remoteSchema.chats.id))
      .where(and(
        eq(remoteSchema.chats.appId, appId),
        eq(remoteSchema.chats.userId, context.userId),
        like(remoteSchema.messages.content, `%${query}%`)
      ))
      .orderBy(desc(remoteSchema.chats.createdAt))
      .limit(10);

    // Combine: keep title matches and per-message matches
    const messageResultsMapped: ChatSearchResult[] = messageResults.map(c => ({
      id: c.id,
      appId: c.appId as number,
      title: c.title || "",
      createdAt: c.createdAt as unknown as string,
      matchedMessageContent: c.matchedMessageContent,
      isPlan: c.isPlan ?? false
    }));

    const combined: ChatSearchResult[] = [...titleResults, ...messageResultsMapped];
    const uniqueChats = Array.from(
      new Map(combined.map((item) => [item.id, item])).values(),
    );

    // Sort newest chats first
    uniqueChats.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    return uniqueChats;
  });

  createTypedHandler(
    chatContracts.generateChatTitle,
    async (_, { chatId, prompt }, context) => {
      if (!context.userId) throw new Error("Unauthorized");
      const db = getRemoteDb();

      logger.info(`generateChatTitle called for chatId=${chatId}`);
      if (!hasOpenRouterApiKey()) {
        logger.warn("OpenRouter API key not found, using default title");
        return { title: "Nuevo chat" };
      }
      const { readSettings } = await import("../../main/settings");
      const settings = readSettings();

      const model =
        settings.standardModeModel || DEFAULT_STANDARD_MODEL;

      try {
        let messageContent = prompt;

        // If no prompt provided, fetch from DB (legacy/manual behavior)
        if (!messageContent) {
          logger.info(
            `No prompt provided, fetching first message for chatId=${chatId}`,
          );
          // Fetch the first message from this chat
          const firstMessage = await db
            .select({
              content: remoteSchema.messages.content,
            })
            .from(remoteSchema.messages)
            .innerJoin(remoteSchema.chats, eq(remoteSchema.messages.chatId, remoteSchema.chats.id))
            .where(and(eq(remoteSchema.messages.chatId, chatId), eq(remoteSchema.chats.userId, context.userId)))
            .orderBy(remoteSchema.messages.createdAt)
            .limit(1);

          if (!firstMessage.length) {
            logger.warn(`No messages found for chatId=${chatId}`);
            return { title: "Nuevo chat" };
          }
          messageContent = firstMessage[0].content;
          logger.info(
            `Found first message (${messageContent.slice(0, 100)}...) for chatId=${chatId}`,
          );
        }

        // If it's a summarize command, don't generate title
        // This is a safety check in case the frontend still calls it
        if (
          messageContent.startsWith("Resumir el chat chat-id=") ||
          messageContent.startsWith("Summarize from chat-id")
        ) {
          return { title: "Nuevo chat" };
        }

        const data = await openRouterCompletion({
          model,
          title: "chat-title",
          temperature: 0.3,
          max_tokens: 40,
          messages: [
            {
              role: "system",
              content:
                "Eres un asistente que genera títulos cortos y descriptivos en español para chats. Devuelve SOLO el título, sin comillas ni texto adicional. Máximo 50 caracteres. Sé conciso y claro. IMPORTANTE: El título debe ser objetivo y NO usar primera persona (evita 'he generado', 'he creado', etc). Usa formato neutro como 'Sistema de...', 'Implementación de...', 'Análisis de...'.",
            },
            {
              role: "user",
              content: `Genera un título corto en español en formato objetivo (sin primera persona) para este chat: "${messageContent.slice(0, 500)}"`,
            },
          ],
        });

        const title =
          data?.choices?.[0]?.message?.content?.trim() || "Nuevo chat";

        // Log token usage for title generation
        const usage = data?.usage;
        if (usage) {
          void logChatInfo(
            chatId,
            "token-usage",
            `Chat Title Generation - Total tokens: ${usage.total_tokens} (input: ${usage.prompt_tokens}, output: ${usage.completion_tokens})`,
            {
              totalTokens: usage.total_tokens,
              inputTokens: usage.prompt_tokens,
              outputTokens: usage.completion_tokens,
              model,
              type: "chat-title-generation",
            },
          );
        }

        // Sanitize title
        const sanitizedTitle = title.replace(/^["']|["']$/g, "").slice(0, 50);

        logger.info(
          `Generated title for chatId=${chatId}: "${sanitizedTitle}"`,
        );

        // Update the chat title in the database
        const updateResult = await db
          .update(remoteSchema.chats)
          .set({ title: sanitizedTitle })
          .where(and(eq(remoteSchema.chats.id, chatId), eq(remoteSchema.chats.userId, context.userId)))
          .returning({ id: remoteSchema.chats.id, title: remoteSchema.chats.title });

        logger.info(
          `Updated chat title in DB for chatId=${chatId}:`,
          updateResult,
        );

        return { title: sanitizedTitle };
      } catch (error) {
        logger.error("Error generating chat title:", error);
        return { title: "Nuevo chat" };
      }
    },
  );

  createTypedHandler(
    chatContracts.deleteAllChatsExceptCurrent,
    async (_, { appId, currentChatId }, context) => {
      if (!context.userId) throw new Error("Unauthorized");
      const db = getRemoteDb();

      if (currentChatId !== null) {
        await db
          .delete(remoteSchema.chats)
          .where(and(
            eq(remoteSchema.chats.appId, appId),
            eq(remoteSchema.chats.userId, context.userId),
            ne(remoteSchema.chats.id, currentChatId)
          ));
      } else {
        // If no current chat, delete all chats for the app
        await db.delete(remoteSchema.chats).where(and(eq(remoteSchema.chats.appId, appId), eq(remoteSchema.chats.userId, context.userId)));
      }
    },
  );


  createTypedHandler(
    chatContracts.getInitialPrompt,
    async (_, appId, context) => {
      if (!context.userId) throw new Error("Unauthorized");
      const db = getRemoteDb();
      try {
        // Find the oldest chat for this app
        const oldestChat = await db.query.chats.findFirst({
          where: and(eq(remoteSchema.chats.appId, appId), eq(remoteSchema.chats.userId, context.userId)),
          orderBy: (chats, { asc }) => [asc(chats.createdAt)],
          columns: { id: true },
        });

        if (!oldestChat) {
          return { content: null, createdAt: null };
        }

        // Get the first user message in that chat
        const firstUserMessage = await db
          .select({
            content: remoteSchema.messages.content,
            createdAt: remoteSchema.messages.createdAt,
          })
          .from(remoteSchema.messages)
          .innerJoin(remoteSchema.chats, eq(remoteSchema.messages.chatId, remoteSchema.chats.id))
          .where(
            and(
              eq(remoteSchema.messages.chatId, oldestChat.id),
              eq(remoteSchema.messages.role, "user"),
              eq(remoteSchema.chats.userId, context.userId)
            ),
          )
          .orderBy(remoteSchema.messages.createdAt)
          .limit(1);

        if (!firstUserMessage.length) {
          return { content: null, createdAt: null };
        }

        return {
          content: firstUserMessage[0].content,
          createdAt: firstUserMessage[0].createdAt,
        };
      } catch (error) {
        logger.error("Error getting initial prompt:", error);
        return { content: null, createdAt: null };
      }
    },
  );

  // Mark a chat as read (update lastReadAt timestamp)
  createTypedHandler(chatContracts.markChatRead, async (_, chatId, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    await db.update(remoteSchema.chats)
      .set({ lastReadAt: new Date(), isRead: 1 })
      .where(and(eq(remoteSchema.chats.id, chatId), eq(remoteSchema.chats.userId, context.userId)));
  });

  // Mark a chat as unread
  createTypedHandler(chatContracts.markChatUnread, async (_, chatId, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    await db.update(remoteSchema.chats)
      .set({ isRead: 0 })
      .where(and(eq(remoteSchema.chats.id, chatId), eq(remoteSchema.chats.userId, context.userId)));
  });

  // Rename a chat
  createTypedHandler(chatContracts.renameChat, async (_, { chatId, title }, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    await db.update(remoteSchema.chats)
      .set({ title })
      .where(and(eq(remoteSchema.chats.id, chatId), eq(remoteSchema.chats.userId, context.userId)));
  });

  // Archive / unarchive a chat
  createTypedHandler(chatContracts.archiveChat, async (_, { chatId, archived }, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    await db.update(remoteSchema.chats)
      .set({ isArchived: archived ? 1 : 0 })
      .where(and(eq(remoteSchema.chats.id, chatId), eq(remoteSchema.chats.userId, context.userId)));
  });

  // Get archived chats for an app
  createTypedHandler(chatContracts.getArchivedChats, async (_, appId, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    const archived = await db.query.chats.findMany({
      where: and(
        eq(remoteSchema.chats.appId, appId),
        eq(remoteSchema.chats.userId, context.userId),
        eq(remoteSchema.chats.isArchived, 1),
      ),
      columns: { id: true, title: true, createdAt: true, appId: true },
      orderBy: [desc(remoteSchema.chats.createdAt)],
    });
    return archived as any;
  });

  logger.debug("Registered chat IPC handlers");
}
