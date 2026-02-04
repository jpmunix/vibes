import { db } from "../../db";
import { apps, chats, messages } from "../../db/schema";
import { desc, eq, and, like } from "drizzle-orm";
import type { ChatSearchResult, ChatSummary } from "../../lib/schemas";

import log from "electron-log";
import { getDyadAppPath } from "../../paths/paths";
import { getCurrentCommitHash } from "../utils/git_utils";
import { createTypedHandler } from "./base";
import { chatContracts } from "../types/chat";

const logger = log.scope("chat_handlers");

export function registerChatHandlers() {
  createTypedHandler(chatContracts.createChat, async (_, appId) => {
    // Get the app's path first
    const app = await db.query.apps.findFirst({
      where: eq(apps.id, appId),
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
        path: getDyadAppPath(app.path),
      });
    } catch (error) {
      logger.error("Error getting git revision:", error);
      // Continue without the git revision
    }

    // Create a new chat
    const [chat] = await db
      .insert(chats)
      .values({
        appId,
        initialCommitHash,
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

  createTypedHandler(chatContracts.getChat, async (_, chatId) => {
    const chat = await db.query.chats.findFirst({
      where: eq(chats.id, chatId),
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
        role: m.role as "user" | "assistant",
      })),
    };
  });

  createTypedHandler(chatContracts.getChats, async (_, appId) => {
    // If appId is provided, filter chats for that app
    const query = appId
      ? db.query.chats.findMany({
        where: eq(chats.appId, appId),
        columns: {
          id: true,
          title: true,
          createdAt: true,
          appId: true,
        },
        orderBy: [desc(chats.createdAt)],
      })
      : db.query.chats.findMany({
        columns: {
          id: true,
          title: true,
          createdAt: true,
          appId: true,
        },
        orderBy: [desc(chats.createdAt)],
      });

    const allChats = await query;
    return allChats as ChatSummary[];
  });

  createTypedHandler(chatContracts.deleteChat, async (_, chatId) => {
    await db.delete(chats).where(eq(chats.id, chatId));
  });

  createTypedHandler(chatContracts.updateChat, async (_, params) => {
    const { chatId, title } = params;
    await db.update(chats).set({ title }).where(eq(chats.id, chatId));
  });

  createTypedHandler(chatContracts.deleteMessages, async (_, chatId) => {
    await db.delete(messages).where(eq(messages.chatId, chatId));
  });

  createTypedHandler(chatContracts.searchChats, async (_, params) => {
    const { appId, query } = params;
    // 1) Find chats by title and map to ChatSearchResult with no matched message
    const chatTitleMatches = await db
      .select({
        id: chats.id,
        appId: chats.appId,
        title: chats.title,
        createdAt: chats.createdAt,
      })
      .from(chats)
      .where(and(eq(chats.appId, appId), like(chats.title, `%${query}%`)))
      .orderBy(desc(chats.createdAt))
      .limit(10);

    const titleResults: ChatSearchResult[] = chatTitleMatches.map((c) => ({
      id: c.id,
      appId: c.appId,
      title: c.title,
      createdAt: c.createdAt,
      matchedMessageContent: null,
    }));

    // 2) Find messages that match and join to chats to build one result per message
    const messageResults = await db
      .select({
        id: chats.id,
        appId: chats.appId,
        title: chats.title,
        createdAt: chats.createdAt,
        matchedMessageContent: messages.content,
      })
      .from(messages)
      .innerJoin(chats, eq(messages.chatId, chats.id))
      .where(and(eq(chats.appId, appId), like(messages.content, `%${query}%`)))
      .orderBy(desc(chats.createdAt))
      .limit(10);

    // Combine: keep title matches and per-message matches
    const combined: ChatSearchResult[] = [...titleResults, ...messageResults];
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
    async (_, { chatId, prompt }) => {
      const { readSettings } = await import("../../main/settings");
      const settings = readSettings();
      const apiKey = settings.providerSettings?.openrouter?.apiKey?.value?.trim();

      if (!apiKey) {
        logger.warn("OpenRouter API key not found, using default title");
        return { title: "Nuevo chat" };
      }

      const model = settings.appTitleGenerationModel || "google/gemini-2.5-flash-lite";

      try {
        let messageContent = prompt;

        // If no prompt provided, fetch from DB (legacy/manual behavior)
        if (!messageContent) {
          // Fetch the first message from this chat
          const firstMessage = await db
            .select({
              content: messages.content,
            })
            .from(messages)
            .where(eq(messages.chatId, chatId))
            .orderBy(messages.createdAt)
            .limit(1);

          if (!firstMessage.length) {
            return { title: "Nuevo chat" };
          }
          messageContent = firstMessage[0].content;
        }

        const response = await fetch(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
              "HTTP-Referer": "https://dyad.sh",
              "X-Title": "Dyad",
            },
            body: JSON.stringify({
              model,
              temperature: 0.3,
              max_tokens: 15,
              messages: [
                {
                  role: "system",
                  content:
                    "Eres un asistente que genera títulos cortos y descriptivos en español para chats. Devuelve SOLO el título, sin comillas ni texto adicional. Máximo 50 caracteres. Sé conciso y claro.",
                },
                {
                  role: "user",
                  content: `Genera un título corto en español para este chat: "${messageContent.slice(0, 500)}"`,
                },
              ],
            }),
          },
        );

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `OpenRouter failed: ${response.status} ${response.statusText} - ${errorText}`,
          );
        }

        const data = await response.json();
        const title =
          data?.choices?.[0]?.message?.content?.trim() || "Nuevo chat";

        // Sanitize title
        const sanitizedTitle = title.replace(/^["']|["']$/g, "").slice(0, 50);

        // Update the chat title in the database
        await db
          .update(chats)
          .set({ title: sanitizedTitle })
          .where(eq(chats.id, chatId));

        return { title: sanitizedTitle };
      } catch (error) {
        logger.error("Error generating chat title:", error);
        return { title: "Nuevo chat" };
      }
    },
  );

  logger.debug("Registered chat IPC handlers");
}
