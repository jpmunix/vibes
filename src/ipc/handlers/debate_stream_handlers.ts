import { ipcMain } from "electron";
import { getRemoteDb } from "../../db/remote";
import * as remoteSchema from "../../db/remote-schema";
import { eq, and } from "drizzle-orm";
import { DEFAULT_STANDARD_MODEL } from "../../lib/schemas";

import log from "electron-log";
import { readSettings } from "../../main/settings";
import { getModelClient } from "../utils/get_model_client";
import { logAiQuery } from "../utils/ai_query_logger";
import { streamText, TextStreamPart } from "ai";
import { safeSend } from "../utils/safe_sender";
import { logTokenUsage } from "../utils/token_stats_logger";
import { getEffectivePrompt } from "../../prompts";

const logger = log.scope("debate_stream_handlers");
const activeStreams = new Map<number, boolean>();

export function registerDebateStreamHandlers() {
  ipcMain.handle("debate:abort", async (_, { debateId }) => {
    logger.debug(`Aborting stream for debate ${debateId}`);
    activeStreams.set(debateId, false);
  });

  ipcMain.handle("debate:stream", async (event, req) => {
    const { debateId, prompt, injectedItems, mode, skipSaveUserMessage } = req;
    const settings = readSettings();
    const userId = settings.userId;
    if (!userId) {
      safeSend(event.sender, "debate:response:error", {
        debateId: debateId,
        error: "Unauthorized",
      });
      return;
    }
    const db = getRemoteDb();

    try {
      // Notify renderer that stream is starting
      safeSend(event.sender, "debate:stream:start", { debateId });

      // Get the debate
      const debate = await db.query.debates.findFirst({
        where: and(eq(remoteSchema.debates.id, debateId), eq(remoteSchema.debates.userId, userId)),
        with: {
          messages: {
            orderBy: (messages, { asc }) => [asc(messages.createdAt)],
          },
        },
      });

      if (!debate) throw new Error("Debate not found");

      // Construct history
      const history = (debate.messages || []).map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      }));

      // In regenerate mode, we use the prompt but don't save it as a new message
      // and we don't append it to history because it should already be the last message
      // OR if it's an edit, the user message was already updated in DB.

      let userPrompt = prompt;
      if (injectedItems && injectedItems.length > 0) {
        let injectedContent = "\n\n--- CONTEXTO INYECTADO ---\n";
        injectedItems.forEach((item: any) => {
          injectedContent += `[${item.type.toUpperCase()}] ${item.title}:\n${item.fragment || item.content}\n\n`;
        });
        userPrompt += injectedContent;
      }

      if (!skipSaveUserMessage) {
        // Save user message
        await db.insert(remoteSchema.debateMessages).values({
          userId,
          debateId,
          role: "user",
          content: userPrompt,
          injectedItems: injectedItems || [],
          createdAt: new Date(),
        });
      }

      // Fetch all messages including the new (or updated) user message
      const currentMessages = await db.query.debateMessages.findMany({
        where: and(eq(remoteSchema.debateMessages.debateId, debateId), eq(remoteSchema.debateMessages.userId, userId)),
        orderBy: (messages, { asc }) => [asc(messages.createdAt)],
      });

      // Send updated messages to frontend
      safeSend(event.sender, "debate:response:chunk", {
        debateId,
        messages: currentMessages,
      });

      // Prepare final history for LLM
      const finalHistory = currentMessages.map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      }));

      const messagesAfterUser = currentMessages; // Reference for chunk updates

      // Auto-generate title if it's a new debate
      if (
        debate.title === "Nuevo Debate" &&
        (!debate.messages || debate.messages.length === 0)
      ) {
        try {
          const settings = readSettings();
          const titleModel =
            settings.standardModeModel || DEFAULT_STANDARD_MODEL; // Fast model
          const { getLanguageModelProviders, getLanguageModels } =
            await import("../shared/language_model_helpers");
          const allModels = await getLanguageModels({
            providerId: "openrouter",
          });

          let bestModel = {
            name: DEFAULT_STANDARD_MODEL,
            provider: "openrouter",
          }; // Fallback

          // Try to find configured model
          const found = allModels.find((m) => m.apiName === titleModel);
          if (found) {
            bestModel = { name: found.apiName, provider: "openrouter" };
          } else if (settings.selectedModel) {
            bestModel = settings.selectedModel;
          }

          const { modelClient: titleClient } = await getModelClient(
            bestModel,
            settings,
          );

          const { text: newTitle } = await import("ai").then((ai) =>
            ai.generateText({
              model: titleClient.model,
              prompt: `Genera un título muy breve (máximo 5-6 palabras) y conciso para un debate que comienza con este mensaje: "${userPrompt}". Devuelve SOLO el título, sin comillas ni explicaciones.`,
            }),
          );

          if (newTitle && newTitle.trim()) {
            await db
              .update(remoteSchema.debates)
              .set({ title: newTitle.trim() })
              .where(and(eq(remoteSchema.debates.id, debateId), eq(remoteSchema.debates.userId, userId)));
            safeSend(event.sender, "ipc-event", { channel: "debates:updated" }); // Notify list to refresh
            safeSend(event.sender, "debate:title:updated", {
              debateId,
              title: newTitle.trim(),
            });
          }
        } catch (err) {
          logger.warn("Failed to auto-generate debate title", err);
        }
      }

      const settings = readSettings();
      let selectedModel = settings.selectedModel;

      if (settings.proModeModel && settings.proModeModel !== "SAME_AS_CHAT") {
        const { getLanguageModelProviders, getLanguageModels } =
          await import("../shared/language_model_helpers");
        const allModels = await getLanguageModels({ providerId: "openrouter", userId });
        const found = allModels.find((m) => m.apiName === settings.proModeModel);
        if (found) {
          selectedModel = {
            name: found.apiName,
            provider: "openrouter",
          };
        }
      }

      const { modelClient } = await getModelClient(selectedModel, settings);
      activeStreams.set(debateId, true);

      // Create placeholder assistant message
      const [assistantMsg] = await db
        .insert(remoteSchema.debateMessages)
        .values({
          userId,
          debateId,
          role: "assistant",
          content: "",
          createdAt: new Date(),
        })
        .returning();

      let fullResponse = "";

      const result = await streamText({
        model: modelClient.model,
        messages: [
          {
            role: "system",
            content: getEffectivePrompt("debate_chat_system", settings),
          },
          ...finalHistory,
        ],
      });

      const fullStream = result.fullStream as AsyncIterable<TextStreamPart<any>>;
      let inThinkingBlock = false;

      for await (const part of fullStream) {
        if (activeStreams.get(debateId) === false) {
          logger.debug(`Stream aborted for debate ${debateId}`);
          break;
        }
        let chunk = "";

        if (
          inThinkingBlock &&
          part.type !== "reasoning-delta"
        ) {
          chunk = "</vibes-think>\n";
          inThinkingBlock = false;
        }

        if (part.type === "text-delta") {
          chunk += part.text;
        } else if (part.type === "reasoning-delta") {
          const text = part.text;

          if (!inThinkingBlock) {
            chunk = "<vibes-think>\n";
            inThinkingBlock = true;
          }
          chunk += text;
        } else if (part.type === "error") {
          logger.error("Error in stream part:", part.error);
          // We continue, but loop might end
        }

        if (chunk) {
          fullResponse += chunk;

          safeSend(event.sender, "debate:response:chunk", {
            debateId,
            messages: [
              ...messagesAfterUser,
              { ...assistantMsg, content: fullResponse },
            ],
          });
        }
      }

      // Close thinking block if still open
      if (inThinkingBlock) {
        fullResponse += "\n</vibes-think>";
        safeSend(event.sender, "debate:response:chunk", {
          debateId,
          messages: [
            ...messagesAfterUser,
            { ...assistantMsg, content: fullResponse },
          ],
        });
      }

      if (!fullResponse.trim()) {
        fullResponse = "*Acción completada*";
      }

      const usage = await result.totalUsage;
      if (usage) {
        const usageAny = usage as any;
        const promptTokens = usageAny.promptTokens ?? usageAny.inputTokens ?? 0;
        const completionTokens =
          usageAny.completionTokens ?? usageAny.outputTokens ?? 0;
        const totalTokens =
          usage.totalTokens ?? promptTokens + completionTokens;

        logTokenUsage({
          debateId,
          source: "debate",
          messageId: assistantMsg.id,
          totalTokens,
          promptTokens,
          completionTokens,
          model: selectedModel?.name || "unknown",
          timestamp: Date.now(),
          appId: req.appId || null,
          toolsUsed: [],
        });
      }

      // Log the query to the dedicated AI query log
      try {
        // const { logAiQuery } = await import("../utils/ai_query_logger");
        void logAiQuery({
          queryType: "debate-stream",
          model: selectedModel.name,
          promptSnippet: prompt.slice(0, 100),
          payload: {
            system: getEffectivePrompt("debate_chat_system", settings),
            messages: finalHistory,
          },
          response: {
            text: fullResponse,
          },
          inputTokens: (usage as any)?.inputTokens ?? (usage as any)?.promptTokens,
          outputTokens: (usage as any)?.outputTokens ?? (usage as any)?.completionTokens,
        }, userId);
      } catch (e) {
        logger.error("Failed to log debate AI query", e);
      }

      // Final update
      await db
        .update(remoteSchema.debateMessages)
        .set({ content: fullResponse })
        .where(and(eq(remoteSchema.debateMessages.id, assistantMsg.id), eq(remoteSchema.debateMessages.userId, userId)));
      await db
        .update(remoteSchema.debates)
        .set({ updatedAt: new Date() })
        .where(and(eq(remoteSchema.debates.id, debateId), eq(remoteSchema.debates.userId, userId)));

      safeSend(event.sender, "debate:response:end", {
        debateId,
      });
    } catch (e: any) {
      logger.error("Error in debate stream", e);
      safeSend(event.sender, "debate:response:error", {
        debateId: debateId,
        error: e.message,
      });
    } finally {
      activeStreams.delete(debateId);
    }
  });
}
