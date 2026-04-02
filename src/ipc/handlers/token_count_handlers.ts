/**
 * Token Count Handlers — Lightweight stub
 *
 * In agent mode, OpenCode manages its own context window and token usage.
 * This handler now returns only the values that the ContextLimitBanner
 * and MessagesList need: actualMaxTokens (from the last assistant message)
 * and contextWindow (from token_utils). No codebase extraction.
 */
import { getRemoteDb } from "../../db/remote";
import * as remoteSchema from "../../db/remote-schema";
import { and, eq } from "drizzle-orm";
import log from "electron-log";

import { createTypedHandler } from "./base";
import { chatContracts } from "../types/chat";
import { estimateTokens, getContextWindow } from "../utils/token_utils";

const logger = log.scope("token_count_handlers");

export function registerTokenCountHandlers() {
  createTypedHandler(chatContracts.countTokens, async (_event, req, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    const chat = await db.query.chats.findFirst({
      where: and(
        eq(remoteSchema.chats.id, req.chatId),
        eq(remoteSchema.chats.userId, context.userId),
      ),
      with: {
        messages: {
          orderBy: (messages, { asc }) => [asc(messages.createdAt)],
        },
      },
    });

    if (!chat) {
      throw new Error(`Chat not found: ${req.chatId}`);
    }

    // Lightweight token estimates — no codebase extraction
    const messageHistory = chat.messages.map((m) => m.content).join("");
    const messageHistoryTokens = estimateTokens(messageHistory);
    const inputTokens = estimateTokens(req.input);

    // In agent mode, context is managed by OpenCode — return a flat estimate
    const systemPromptTokens = 500; // rough estimate for the injected instructions
    const codebaseTokens = 0; // agent mode: OpenCode handles file context
    const mentionedAppsTokens = 0;

    const totalTokens =
      messageHistoryTokens + inputTokens + systemPromptTokens;

    // actualMaxTokens comes from the last assistant message (set by the model response)
    const lastAssistantMessage = [...chat.messages]
      .reverse()
      .find((m) => m.role === "assistant");
    const actualMaxTokens = lastAssistantMessage?.maxTokensUsed ?? null;

    return {
      estimatedTotalTokens: totalTokens,
      actualMaxTokens,
      messageHistoryTokens,
      codebaseTokens,
      mentionedAppsTokens,
      inputTokens,
      systemPromptTokens,
      contextWindow: await getContextWindow(),
    };
  });

  logger.info("Registered token count handlers (lightweight — agent mode)");
}
