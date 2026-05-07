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
import { normalizeLegacyTags } from "../../../shared/normalizeLegacyTags";

const logger = log.scope("chat_handlers");

export function registerChatHandlers() {
  createTypedHandler(chatContracts.createChat, async (_, appId, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();

    // Get the app's path first
    const app = await db.query.apps.findFirst({
      where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId!)),
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
        userId: context.userId!,
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

  createTypedHandler(chatContracts.getChat as any, async (_, chatId: number, context: HandlerContext) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();

    const chat = await db.query.chats.findFirst({
      where: and(eq(remoteSchema.chats.id, chatId), eq(remoteSchema.chats.userId, context.userId!)),
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
          eq(remoteSchema.chats.userId, context.userId!),
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
          eq(remoteSchema.chats.userId, context.userId!),
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
    
    // Attempt to delete from OpenCode backend and condense memories
    const chat = await db.query.chats.findFirst({
      where: and(eq(remoteSchema.chats.id, chatId), eq(remoteSchema.chats.userId, context.userId!)),
      columns: { appId: true, opencodeSessionId: true }
    });
    if (chat) {
      if (chat.appId) {
        try {
          const { forceCondenseChatSession } = await import("../utils/memory_extractor");
          forceCondenseChatSession({ appId: chat.appId, userId: context.userId!, chatId }).catch(e => {
            logger.error("Error auto-condensing chat on delete", e);
          });
        } catch (e) {
          logger.error("Error importing memory_extractor on delete", e);
        }
      }
      if (chat.opencodeSessionId) {
        const { deleteOpenCodeSessionById } = await import("./opencode_adapter");
        deleteOpenCodeSessionById(chat.opencodeSessionId);
      }
    }

    await db.delete(remoteSchema.chats).where(and(eq(remoteSchema.chats.id, chatId), eq(remoteSchema.chats.userId, context.userId!)));
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
      await db.update(remoteSchema.chats).set(updateData).where(and(eq(remoteSchema.chats.id, chatId), eq(remoteSchema.chats.userId, context.userId!)));
    }
  });

  createTypedHandler(chatContracts.savePlanData, async (_, { chatId, planData }, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    await db.update(remoteSchema.chats).set({
      planData,
      isPlan: 1,
    }).where(and(eq(remoteSchema.chats.id, chatId), eq(remoteSchema.chats.userId, context.userId!)));
  });

  createTypedHandler(chatContracts.getPlanData, async (_, chatId, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    const chat = await db.query.chats.findFirst({
      where: and(eq(remoteSchema.chats.id, chatId), eq(remoteSchema.chats.userId, context.userId!)),
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
        eq(remoteSchema.chats.userId, context.userId!),
        like(remoteSchema.chats.title, `%${query}%`)
      ))
      .orderBy(desc(remoteSchema.chats.createdAt))
      .limit(10);

    const titleResults: ChatSearchResult[] = chatTitleMatches.map((c) => ({
      id: c.id,
      appId: c.appId as number,
      title: c.title || "",
      createdAt: c.createdAt,
      matchedMessageContent: null,
      isPlan: c.isPlan ? true : false,
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
        eq(remoteSchema.chats.userId, context.userId!),
        like(remoteSchema.messages.content, `%${query}%`)
      ))
      .orderBy(desc(remoteSchema.chats.createdAt))
      .limit(10);

    // Combine: keep title matches and per-message matches
    const messageResultsMapped: ChatSearchResult[] = messageResults.map(c => ({
      id: c.id,
      appId: c.appId as number,
      title: c.title || "",
      createdAt: c.createdAt,
      matchedMessageContent: c.matchedMessageContent,
      isPlan: c.isPlan ? true : false
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
        settings.executorModel || DEFAULT_STANDARD_MODEL;

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
            .where(and(eq(remoteSchema.messages.chatId, chatId), eq(remoteSchema.chats.userId, context.userId!)))
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
          max_tokens: 80,
          messages: [
            {
              role: "system",
              content:
                "Eres un asistente que genera títulos cortos y descriptivos en español para chats. Devuelve SOLO el título, sin comillas ni texto adicional. Máximo 100 caracteres. Sé conciso y claro. IMPORTANTE: El título debe ser objetivo y NO usar primera persona (evita 'he generado', 'he creado', etc). Usa formato neutro como 'Sistema de...', 'Implementación de...', 'Análisis de...'.",
            },
            {
              role: "user",
              content: `Genera un título corto en español en formato objetivo (sin primera persona) para este chat: "${messageContent.slice(0, 500)}"`,
            },
          ],
        });

        const title =
          data?.choices?.[0]?.message?.content?.trim() || "Nuevo chat";


        // Sanitize title
        const sanitizedTitle = title.replace(/^["']|["']$/g, "").slice(0, 100);

        logger.info(
          `Generated title for chatId=${chatId}: "${sanitizedTitle}"`,
        );

        // Update the chat title in the database
        const updateResult = await db
          .update(remoteSchema.chats)
          .set({ title: sanitizedTitle })
          .where(and(eq(remoteSchema.chats.id, chatId), eq(remoteSchema.chats.userId, context.userId!)))
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

      const condition = currentChatId !== null
        ? and(eq(remoteSchema.chats.appId, appId), eq(remoteSchema.chats.userId, context.userId!), ne(remoteSchema.chats.id, currentChatId))
        : and(eq(remoteSchema.chats.appId, appId), eq(remoteSchema.chats.userId, context.userId!));

      // Attempt to delete from OpenCode backend and condense memories
      const chatsToDelete = await db.query.chats.findMany({
        where: condition,
        columns: { id: true, appId: true, opencodeSessionId: true }
      });
      if (chatsToDelete.length > 0) {
        const { deleteOpenCodeSessionById } = await import("./opencode_adapter");
        const { forceCondenseChatSession } = await import("../utils/memory_extractor");
        
        for (const c of chatsToDelete) {
          try {
            if (c.appId) {
              forceCondenseChatSession({ appId: c.appId, userId: context.userId!, chatId: c.id }).catch(e => {
                logger.error(`Error auto-condensing chat ${c.id} on bulk delete`, e);
              });
            }
          } catch (e) {
            logger.error(`Error with auto-condense invocation for chat ${c.id}`, e);
          }
          if (c.opencodeSessionId) deleteOpenCodeSessionById(c.opencodeSessionId);
        }
      }

      await db.delete(remoteSchema.chats).where(condition);
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
          where: and(eq(remoteSchema.chats.appId, appId), eq(remoteSchema.chats.userId, context.userId!)),
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
              eq(remoteSchema.chats.userId, context.userId!)
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
      .where(and(eq(remoteSchema.chats.id, chatId), eq(remoteSchema.chats.userId, context.userId!)));
  });

  // Mark a chat as unread
  createTypedHandler(chatContracts.markChatUnread, async (_, chatId, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    await db.update(remoteSchema.chats)
      .set({ isRead: 0 })
      .where(and(eq(remoteSchema.chats.id, chatId), eq(remoteSchema.chats.userId, context.userId!)));
  });

  // Rename a chat
  createTypedHandler(chatContracts.renameChat, async (_, { chatId, title }, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    await db.update(remoteSchema.chats)
      .set({ title })
      .where(and(eq(remoteSchema.chats.id, chatId), eq(remoteSchema.chats.userId, context.userId!)));
  });

  // Archive / unarchive a chat
  createTypedHandler(chatContracts.archiveChat, async (_, { chatId, archived }, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();

    if (archived) {
      // Auto-condense before archiving
      const chat = await db.query.chats.findFirst({
        where: and(eq(remoteSchema.chats.id, chatId), eq(remoteSchema.chats.userId, context.userId!)),
        columns: { appId: true }
      });
      if (chat?.appId) {
        try {
          const { forceCondenseChatSession } = await import("../utils/memory_extractor");
          forceCondenseChatSession({ appId: chat.appId, userId: context.userId!, chatId }).catch(e => {
            logger.error("Error auto-condensing chat on archive", e);
          });
        } catch (e) {
          logger.error("Error importing memory_extractor on archive", e);
        }
      }
    }

    await db.update(remoteSchema.chats)
      .set({ isArchived: archived ? 1 : 0 })
      .where(and(eq(remoteSchema.chats.id, chatId), eq(remoteSchema.chats.userId, context.userId!)));
  });

  // Get archived chats for an app
  createTypedHandler(chatContracts.getArchivedChats, async (_, appId, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    const archived = await db.query.chats.findMany({
      where: and(
        eq(remoteSchema.chats.appId, appId),
        eq(remoteSchema.chats.userId, context.userId!),
        eq(remoteSchema.chats.isArchived, 1),
      ),
      columns: { id: true, title: true, createdAt: true, appId: true },
      orderBy: [desc(remoteSchema.chats.createdAt)],
    });
    return archived as any;
  });

  // Insert N user messages into the DB without triggering an AI stream.
  // Used by the pending-message queue to persist each typed message as its own
  // bubble so the AI sees them as separate turns in the conversation.
  createTypedHandler(chatContracts.insertUserMessages, async (_, { chatId, messages }, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();

    const { writeFile } = await import("fs/promises");
    const fs = await import("node:fs");
    const path = await import("path");
    const os = await import("os");
    const crypto = await import("crypto");

    const TEMP_DIR = path.join(os.tmpdir(), "vibes-attachments");
    if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

    for (const msg of messages) {
      let userPrompt = msg.prompt;
      let userAiMessagesJson: any = null;

      // Process attachments if present
      if (msg.attachments && msg.attachments.length > 0) {
        const imageParts: any[] = [];
        let attachmentInfo = "\n\nAttachments:\n";

        for (const attachment of msg.attachments) {
          const hash = crypto.createHash("md5").update(attachment.name + Date.now()).digest("hex");
          const fileExtension = path.extname(attachment.name);
          const filename = `${hash}${fileExtension}`;
          const filePath = path.join(TEMP_DIR, filename);
          const base64Data = attachment.data.split(";base64,").pop() || "";
          await writeFile(filePath, Buffer.from(base64Data, "base64"));

          attachmentInfo += `- ${attachment.name} (${attachment.type})\n`;

          // Build image part for aiMessagesJson so the AI can see the image
          imageParts.push({
            type: "image",
            image: `data:${attachment.type};base64,${base64Data}`,
            mediaType: attachment.type,
          });
        }

        userPrompt += attachmentInfo;

        if (imageParts.length > 0) {
          const aiMsg = {
            role: "user",
            content: [
              { type: "text", text: userPrompt },
              ...imageParts,
            ],
          };
          userAiMessagesJson = JSON.stringify([aiMsg]);
        }
      }

      await db.insert(remoteSchema.messages).values({
        userId: context.userId!,
        chatId,
        role: "user",
        content: userPrompt,
        aiMessagesJson: userAiMessagesJson,
        createdAt: new Date(),
      });

      // 1ms gap to guarantee stable insertion order
      await new Promise((r) => setTimeout(r, 1));
    }
  });

  // Pin / unpin a chat
  createTypedHandler(chatContracts.pinChat, async (_, { chatId, pinned }, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();

    if (pinned) {
      // Enforce max 10 pinned chats
      const currentPinned = await db
        .select({ id: remoteSchema.chats.id })
        .from(remoteSchema.chats)
        .where(and(
          eq(remoteSchema.chats.userId, context.userId!),
          eq(remoteSchema.chats.isPinned, 1),
        ));
      if (currentPinned.length >= 10) {
        throw new Error("Máximo 10 conversaciones fijadas");
      }
    }

    await db.update(remoteSchema.chats)
      .set({ isPinned: pinned ? 1 : 0 })
      .where(and(eq(remoteSchema.chats.id, chatId), eq(remoteSchema.chats.userId, context.userId!)));
  });

  // Get all pinned chats (across all apps)
  createTypedHandler(chatContracts.getPinnedChats, async (_, _input, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();

    const pinned = await db
      .select({
        id: remoteSchema.chats.id,
        appId: remoteSchema.chats.appId,
        appName: remoteSchema.apps.name,
        title: remoteSchema.chats.title,
        createdAt: remoteSchema.chats.createdAt,
      })
      .from(remoteSchema.chats)
      .innerJoin(remoteSchema.apps, eq(remoteSchema.chats.appId, remoteSchema.apps.id))
      .where(and(
        eq(remoteSchema.chats.userId, context.userId!),
        eq(remoteSchema.chats.isPinned, 1),
      ))
      .orderBy(desc(remoteSchema.chats.createdAt));

    return pinned as any;
  });

  // Summarize the current chat and output to a new chat
  createTypedHandler(chatContracts.summarizeToNewChat, async (_, { appId, chatId }, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();

    // 1. Fetch old chat details and all its messages
    const oldChat = await db.query.chats.findFirst({
      where: and(eq(remoteSchema.chats.id, chatId), eq(remoteSchema.chats.userId, context.userId!)),
      with: {
        messages: {
          orderBy: (messages, { asc }) => [asc(messages.createdAt)],
        },
      },
    });

    if (!oldChat || oldChat.messages.length === 0) {
      throw new Error("Chat not found or is empty");
    }

    // 2. Format history for the prompt
    const formattedHistory = oldChat.messages
      .map((m) => `[${m.role.toUpperCase()}]: ${m.content}`)
      .join("\n\n");

    // 3. Generate summary using openRouterCompletion
    const { readSettings } = await import("../../main/settings");
    const settings = readSettings();
    const model = settings.executorModel || DEFAULT_STANDARD_MODEL;

    let generatedSummary = "";
    try {
      const data = await openRouterCompletion({
        model,
        title: "summarize-to-new-chat",
        temperature: 0.2,
        max_tokens: 2000,
        messages: [
          {
            role: "system",
            content: "Eres un analista técnico de primer nivel. Tu tarea es condensar el historial de esta conversación en un resumen denso y estructurado. Incluye contexto técnico, decisiones tomadas, estado final y próximos pasos. Este resumen se usará como contexto inicial para continuar el trabajo en una nueva sesión. Devuelve SOLO el markdown del resumen, sin saludos, sin intros ni despedidas.\n\nIMPORTANTE: Si mencionas archivos de artefactos/planificaciones, usa SIEMPRE la ruta completa con el directorio .vibes/ (ej: `.vibes/plan-internacionalizacion-1715123456.md`), nunca solo el nombre del archivo suelto. Esto permite que la interfaz los detecte y abra correctamente.",
          },
          {
            role: "user",
            content: formattedHistory,
          },
        ],
      });
      generatedSummary = data?.choices?.[0]?.message?.content?.trim() || "";

      // Sanitizar el markdown quitando bloques envolventes ```markdown ... ```
      const mdWrapperRegex = /^```(?:markdown)?\s*([\s\S]*?)```\s*$/i;
      const match = generatedSummary.match(mdWrapperRegex);
      if (match) {
        generatedSummary = match[1].trim();
      }
    } catch (error) {
      logger.error("Error summarizing chat:", error);
      throw new Error("No se pudo generar el resumen");
    }

    if (!generatedSummary) throw new Error("El resumen generado está vacío");

    // 4. Create new chat
    const [newChat] = await db
      .insert(remoteSchema.chats)
      .values({
        appId,
        userId: context.userId!,
        initialCommitHash: oldChat.initialCommitHash,
        createdAt: new Date(),
        title: `Resumen: ${oldChat.title || "Chat " + oldChat.id}`
      })
      .returning();

    // 5. Insert the summary as an assistant message
    const introText = "Me he traído el contexto de nuestro chat anterior. Aquí tienes el estado actual del proyecto para que podamos continuar:\n\n---\n" + generatedSummary + "\n---\n\n¿Qué hacemos ahora?";
    
    await db.insert(remoteSchema.messages).values({
      userId: context.userId!,
      chatId: newChat.id,
      role: "assistant",
      content: introText,
      aiMessagesJson: null,
      createdAt: new Date(),
    });

    logger.info(`Summarized chat ${chatId} into new chat ${newChat.id}`);
    return newChat.id;
  });

  createTypedHandler(chatContracts.getChatArtifacts, async (_, chatId, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    const fs = await import("fs");
    const pathMod = await import("path");

    // ── Auto-discover .vibes/*.md from disk ──────────────────────────
    // If the project has .vibes/ files on disk that aren't in the DB yet,
    // register them automatically. This handles cases where the DB was
    // recreated or the interceptor missed a write.
    try {
      const chat = await db.query.chats.findFirst({
        where: eq(remoteSchema.chats.id, chatId),
        columns: { appId: true },
        with: { app: { columns: { path: true } } },
      });

      if (chat?.app?.path) {
        const projectDir = getVibesAppPath(chat.app.path);
        const vibesDir = pathMod.join(projectDir, ".vibes");

        if (fs.existsSync(vibesDir)) {
          const mdFiles = fs.readdirSync(vibesDir).filter((f: string) => f.endsWith(".md"));

          for (const file of mdFiles) {
            const relativePath = `.vibes/${file}`;
            // Check if this artifact is already registered for ANY chat (not just this one)
            // to avoid cross-chat contamination
            const existingAnywhere = await db.query.chatArtifacts.findFirst({
              where: and(
                eq(remoteSchema.chatArtifacts.appId, chat.appId),
                eq(remoteSchema.chatArtifacts.path, relativePath)
              ),
            });

            // Only register if truly orphaned (no chat owns it at all)
            if (!existingAnywhere) {
              // Try to extract H1 heading from the file content
              let artifactTitle = file;
              try {
                const fullPath = pathMod.join(vibesDir, file);
                const fileContent = fs.readFileSync(fullPath, "utf-8");
                const h1Match = fileContent.match(/^#\s+(.+)$/m);
                if (h1Match?.[1]) {
                  artifactTitle = h1Match[1].trim();
                }
              } catch { /* non-fatal — fall back to filename */ }

              await db.insert(remoteSchema.chatArtifacts).values({
                userId: context.userId!,
                appId: chat.appId,
                chatId,
                path: relativePath,
                title: artifactTitle,
                createdAt: new Date(),
                updatedAt: new Date(),
              });
              logger.info(`[getChatArtifacts] Auto-registered orphaned artifact ${relativePath} for chat ${chatId}`);
            }
          }
        }
      }
    } catch (syncErr: any) {
      logger.warn(`[getChatArtifacts] Auto-sync failed (non-fatal): ${syncErr.message}`);
    }

    // ── Return all artifacts for this chat ────────────────────────────
    const artifacts = await db.query.chatArtifacts.findMany({
      where: and(
        eq(remoteSchema.chatArtifacts.chatId, chatId),
        eq(remoteSchema.chatArtifacts.userId, context.userId!)
      ),
      columns: { id: true, path: true, title: true, createdAt: true, updatedAt: true },
      orderBy: [desc(remoteSchema.chatArtifacts.createdAt)],
    });

    // ── Auto-heal stale titles (raw filenames → H1) ─────────────────
    try {
      const chat = await db.query.chats.findFirst({
        where: eq(remoteSchema.chats.id, chatId),
        columns: { appId: true },
        with: { app: { columns: { path: true } } },
      });
      if (chat?.app?.path) {
        const projectDir = getVibesAppPath(chat.app.path);
        for (const artifact of artifacts) {
          // Title looks like a raw filename if it ends with .md
          if (artifact.title && artifact.title.endsWith(".md")) {
            try {
              const fullPath = pathMod.join(projectDir, artifact.path);
              if (fs.existsSync(fullPath)) {
                const fileContent = fs.readFileSync(fullPath, "utf-8");
                const h1Match = fileContent.match(/^#\s+(.+)$/m);
                if (h1Match?.[1]) {
                  const newTitle = h1Match[1].trim();
                  await db.update(remoteSchema.chatArtifacts)
                    .set({ title: newTitle })
                    .where(eq(remoteSchema.chatArtifacts.id, artifact.id));
                  artifact.title = newTitle;
                }
              }
            } catch { /* non-fatal */ }
          }
        }
      }
    } catch { /* non-fatal */ }

    return artifacts as any;
  });

  createTypedHandler(chatContracts.getChatArtifactContent, async (_, { appId, path: relPath }, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    
    const app = await db.query.apps.findFirst({
      where: and(eq(remoteSchema.apps.id, appId), eq(remoteSchema.apps.userId, context.userId!)),
      columns: { path: true },
    });
    
    if (!app) throw new Error("App not found");
    
    const fs = await import("fs");
    const path = await import("path");
    
    // getVibesAppPath is already imported at the top
    const fullPath = path.join(getVibesAppPath(app.path), relPath);
    
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Artifact file not found: ${relPath}`);
    }
    
    return fs.readFileSync(fullPath, "utf-8");
  });

  logger.debug("Registered chat IPC handlers");
}
