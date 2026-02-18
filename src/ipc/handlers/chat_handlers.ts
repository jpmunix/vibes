import { db } from "../../db";
import { apps, chats, messages } from "../../db/schema";
import { desc, eq, and, like, ne, gte, sql } from "drizzle-orm";
import type { ChatSearchResult, ChatSummary } from "../../lib/schemas";

import log from "electron-log";
import { getDyadAppPath } from "../../paths/paths";
import { getCurrentCommitHash } from "../utils/git_utils";
import { createTypedHandler } from "./base";
import { chatContracts } from "../types/chat";
import { openRouterCompletion, hasOpenRouterApiKey } from "../utils/openrouter";
import { logChatInfo } from "../utils/chat_logger";

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
      isPlan: chat.isPlan ?? false,
      planData: chat.planData ?? null,
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
          isPlan: true,
        },
        orderBy: [desc(chats.createdAt)],
      })
      : db.query.chats.findMany({
        columns: {
          id: true,
          title: true,
          createdAt: true,
          appId: true,
          isPlan: true,
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
    const { chatId, title, isPlan, planData } = params;
    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (isPlan !== undefined) updateData.isPlan = isPlan;
    if (planData !== undefined) updateData.planData = planData;

    if (Object.keys(updateData).length > 0) {
      await db.update(chats).set(updateData).where(eq(chats.id, chatId));
    }
  });

  createTypedHandler(chatContracts.savePlanData, async (_, { chatId, planData }) => {
    await db.update(chats).set({
      planData,
      isPlan: true,
    }).where(eq(chats.id, chatId));
  });

  createTypedHandler(chatContracts.getPlanData, async (_, chatId) => {
    const chat = await db.query.chats.findFirst({
      where: eq(chats.id, chatId),
      columns: { planData: true },
    });
    return chat?.planData ?? null;
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
        isPlan: chats.isPlan,
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
      isPlan: c.isPlan ?? false,
    }));

    // 2) Find messages that match and join to chats to build one result per message
    const messageResults = await db
      .select({
        id: chats.id,
        appId: chats.appId,
        title: chats.title,
        createdAt: chats.createdAt,
        isPlan: chats.isPlan,
        matchedMessageContent: messages.content,
      })
      .from(messages)
      .innerJoin(chats, eq(messages.chatId, chats.id))
      .where(and(eq(chats.appId, appId), like(messages.content, `%${query}%`)))
      .orderBy(desc(chats.createdAt))
      .limit(10);

    // Combine: keep title matches and per-message matches
    // Need to map messageResults to ChatSearchResult shape explicitly to ensure type compatibility
    const messageResultsMapped: ChatSearchResult[] = messageResults.map(c => ({
      id: c.id,
      appId: c.appId,
      title: c.title,
      createdAt: c.createdAt,
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
    async (_, { chatId, prompt }) => {
      logger.info(`generateChatTitle called for chatId=${chatId}`);
      if (!hasOpenRouterApiKey()) {
        logger.warn("OpenRouter API key not found, using default title");
        return { title: "Nuevo chat" };
      }
      const { readSettings } = await import("../../main/settings");
      const settings = readSettings();

      const model =
        settings.appTitleGenerationModel || "openai/gpt-4.1-nano";

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
              content: messages.content,
            })
            .from(messages)
            .where(eq(messages.chatId, chatId))
            .orderBy(messages.createdAt)
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
          .update(chats)
          .set({ title: sanitizedTitle })
          .where(eq(chats.id, chatId))
          .returning({ id: chats.id, title: chats.title });

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
    async (_, { appId, currentChatId }) => {
      if (currentChatId !== null) {
        await db
          .delete(chats)
          .where(and(eq(chats.appId, appId), ne(chats.id, currentChatId)));
      } else {
        // If no current chat, delete all chats for the app
        await db.delete(chats).where(eq(chats.appId, appId));
      }
    },
  );

  createTypedHandler(chatContracts.summarizeTodaysChats, async (_, appId) => {
    if (!hasOpenRouterApiKey()) {
      throw new Error("OpenRouter API key not found");
    }
    const { readSettings } = await import("../../main/settings");
    const settings = readSettings();

    const model =
      settings.appTitleGenerationModel || "openai/gpt-4.1-nano";

    // Get today's start timestamp (midnight local time)
    const todayLocalMidnight = new Date();
    todayLocalMidnight.setHours(0, 0, 0, 0);

    // SQLite's unixepoch() returns seconds. 
    // Drizzle's mode: 'timestamp' for SQLite also expects seconds in some configurations.
    // To be safe, we'll use seconds for the query.
    const todaySeconds = Math.floor(todayLocalMidnight.getTime() / 1000);

    logger.info(`Summarizing chats since ${todayLocalMidnight.toISOString()} (unix: ${todaySeconds})`);

    // Fetch all chats that have messages created today for this app
    const todaysChats = await db.query.chats.findMany({
      where: (chats, { exists, and, eq, gte }) =>
        and(
          eq(chats.appId, appId),
          exists(
            db
              .select()
              .from(messages)
              .where(
                and(
                  eq(messages.chatId, chats.id),
                  // Explicitly compare as seconds to match unixepoch() default
                  sql`${messages.createdAt} >= ${todaySeconds}`,
                ),
              ),
          ),
        ),
      columns: {
        id: true,
        title: true,
        createdAt: true,
      },
      with: {
        messages: {
          where: sql`${messages.createdAt} >= ${todaySeconds}`,
          columns: {
            role: true,
            content: true,
          },
          orderBy: (messages, { asc }) => [asc(messages.createdAt)],
        },
      },
      orderBy: [desc(chats.createdAt)],
    });

    logger.info(`Found ${todaysChats.length} chats from today for appId=${appId}`);
    for (const chat of todaysChats) {
      logger.info(` - Chat "${chat.title}" has ${chat.messages?.length || 0} messages today`);
    }

    if (todaysChats.length === 0) {
      // Diagnostic log: check if any chats exist for this app at all
      const totalChats = await db.query.chats.findMany({
        where: eq(chats.appId, appId),
        limit: 1,
      });
      logger.info(`Total chats for app ${appId}: ${totalChats.length}`);

      return { summary: "No hay chats del día de hoy para resumir." };
    }

    // Build the context for the AI, stripping verbose tags to save tokens and focus on content
    const chatsContext = todaysChats
      .map((chat) => {
        const chatTitle = chat.title || "Sin título";
        const messagesText = chat.messages
          .map((msg) => {
            // Strip dyad tags for the summary to focus on the intent/result
            const cleanContent = msg.content
              .replace(/<dyad-think>[\s\S]*?<\/dyad-think>/g, "")
              .replace(/<dyad-[a-z-]+[\s\S]*?>[\s\S]*?<\/dyad-[a-z-]+>/g, "")
              .trim();
            return cleanContent ? `${msg.role}: ${cleanContent}` : "";
          })
          .filter(Boolean)
          .join("\n");
        return messagesText ? `## Chat: ${chatTitle}\n${messagesText}` : "";
      })
      .filter(Boolean)
      .join("\n\n---\n\n");

    // Safety check: if all content was stripped, return early
    if (!chatsContext.trim()) {
      logger.warn("All chat content was empty after cleaning tags");
      return {
        summary:
          "Los chats de hoy no contienen contenido suficiente para generar un resumen.",
      };
    }

    // Limit context size to prevent overwhelming the model (max ~8000 chars)
    const maxContextLength = 8000;
    const truncatedContext =
      chatsContext.length > maxContextLength
        ? chatsContext.slice(0, maxContextLength) +
        "\n\n[...contenido truncado por límite de tamaño...]"
        : chatsContext;

    logger.info(
      `Summarizing ${todaysChats.length} chats, context length: ${truncatedContext.length} chars`,
    );

    try {
      const data = await openRouterCompletion({
        model,
        title: "daily-summary",
        temperature: 0.3,
        max_tokens: 500,
        messages: [
          {
            role: "system",
            content:
              "Eres un asistente que resume el trabajo del día a nivel de features y funcionalidades principales. NO entres en detalles técnicos de archivos, componentes o implementación. Crea un resumen con grandes titulares de las features desarrolladas, bugs corregidos y cambios importantes. Usa viñetas con títulos descriptivos y concisos. IMPORTANTE: No uses frases introductorias como 'Aquí tienes el resumen' o similares. Empieza directamente con el contenido del resumen. FORMATO: Siempre responde en formato markdown, usando viñetas (-), encabezados (##), y saltos de línea apropiados.",
          },
          {
            role: "user",
            content: `Resume las features y funcionalidades principales trabajadas hoy (NO menciones archivos ni componentes específicos, solo las features a alto nivel):\n\n${truncatedContext}`,
          },
        ],
      });

      const summary =
        data?.choices?.[0]?.message?.content?.trim() ||
        "No se pudo generar el resumen.";

      // Validate that we got actual content
      if (!summary || summary === "No se pudo generar el resumen.") {
        logger.warn("Model returned empty or default summary");
        return {
          summary: `Se encontraron ${todaysChats.length} chat(s) de hoy, pero no se pudo generar un resumen automático. Por favor, revisa los chats manualmente.`,
        };
      }

      // Log token usage for daily summary
      const usage = data?.usage;
      if (usage) {
        logger.info(
          `Daily summary token usage: ${usage.total_tokens} (input: ${usage.prompt_tokens}, output: ${usage.completion_tokens})`,
        );
      }

      return { summary };
    } catch (error) {
      logger.error("Error generating daily summary:", error);
      throw new Error("Error al generar el resumen del día");
    }
  });

  logger.debug("Registered chat IPC handlers");
}
