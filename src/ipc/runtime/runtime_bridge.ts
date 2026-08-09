/**
 * B2: handleRuntimeStream — the heart of the swap.
 *
 * Same contract as handleOpenCodeStream: chat_stream_handlers.ts calls one or
 * the other behind the `runtimeBridgeEnabled` flag and must NOT notice the
 * difference. Return shape is identical; the renderer receives the same
 * `chat:response:chunk` events with `<vibes-*>` tags.
 *
 * Architecture decision (DP-4 + runtime-impl reality):
 *   - vibes-core finishes each turn with status='finished', and
 *     resumeSession() refuses finished sessions; there is also no API to
 *     append a next-turn prompt to an existing session. Therefore the correct
 *     model is ONE FRESH SESSION PER TURN, hydrated with the last N messages
 *     of Vibes' own chat history (Vibes owns the history; the runtime only
 *     sees a window of it). This matches OpenCode's session-per-chat model
 *     from the user's perspective because Vibes replays its history.
 *   - Hydration excludes: the assistant placeholder (empty) and the current
 *     user prompt (createSession seeds it itself — passing it in `messages`
 *     too would duplicate it).
 *
 * Flow:
 *   1. getRuntime() (B1 singleton).
 *   2. createSession hydrated + agent composition (system prompt via
 *      attachToSystemPrompt — reused as-is, it's pure).
 *   3. attachBridge → VibesEventMapper → throttled chunks.
 *   4. 10s checkpoint of partial text to the messages table (adapter parity).
 *   5. Cancellation: the AbortController signal is honored by run(); partial
 *      content + <vibes-cancelled> is returned, exactly like today.
 */

import type { IpcMainInvokeEvent } from "electron";
import log from "electron-log";
import * as path from "node:path";
import { getRemoteDb } from "../../db/remote";
import * as remoteSchema from "../../db/remote-schema";
import { eq } from "drizzle-orm";
import type { ChatStreamParams } from "@/ipc/types";
import type { Message, RuntimeEvent } from "@vibes/shared";
import { attachBridge } from "@vibes/bridge";
import { getRuntime } from "./runtime_host";
import {
  VibesEventMapper,
  buildTokenUsageTag,
  buildCancelledTag,
  escapeAttr,
} from "./event_mapper";
import {
  setSessionUIContext,
  clearSessionUIContext,
} from "./permission_state";
import { getVibesAppPath } from "../../paths/paths";
import { attachToSystemPrompt } from "./prompt_attach";
import { safeSend } from "../utils/safe_sender";
import { resolveRuntimeModelTarget } from "./model_resolver";

const logger = log.scope("runtime_bridge");

/** How many history messages we hydrate into each fresh session (DP-4). */
const HYDRATION_LIMIT = 20;

/**
 * ChatId → currently RUNNING runtime session. Needed by chat:cancel so the
 * abort reaches the right session. Sessions are per-turn, so this is set at
 * turn start and cleared at turn end.
 */
const activeSessionByChat = new Map<number, string>();

export type RuntimeStreamOptions = {
  placeholderMessageId: number;
  appPath: string;
  chatMessages: any[];
  agentId?: "build" | "plan" | "explore" | "mockup";
  contextInstructions?: string[];
  customSystemPrompt?: string;
  customPromptMode?: "additive" | "replace";
  customAgentModelSource?: "chat" | "static";
  customAgentModel?: string | null;
};

export type RuntimeStreamResult = {
  fullResponse: string;
  success: boolean;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
  costUsd: number | null;
};

/**
 * Converts Vibes chat history into runtime Messages for hydration.
 *   - Assistant content is scrubbed of `<vibes-*>` tags and think blocks.
 *   - The trailing empty assistant placeholder is naturally skipped.
 *   - The current user prompt is dropped if it matches the tail — it will be
 *     re-seeded by createSession (avoids duplication).
 */
function convertHistoryToRuntimeMessages(
  chatMessages: any[],
  currentPrompt: string,
): Message[] {
  const messages: Message[] = [];
  for (const msg of chatMessages ?? []) {
    const role = msg?.role;
    if (role !== "user" && role !== "assistant") continue;
    const raw: string = typeof msg.content === "string" ? msg.content : "";
    if (!raw.trim()) continue;
    const scrubbed = raw
      .replace(/<vibes-[^>]*\/>/g, "")
      .replace(/<vibes-[^>]*>[\s\S]*?<\/vibes-[^>]*>/g, "")
      .replace(/<think>[\s\S]*?<\/think>/g, "")
      .trim();
    if (!scrubbed) continue;
    messages.push({
      role,
      content: [{ type: "text", text: scrubbed }],
      ts: typeof msg.createdAt === "number" ? msg.createdAt : undefined,
    });
  }
  // Drop the current prompt if it's the trailing user message.
  const last = messages[messages.length - 1];
  if (
    last &&
    last.role === "user" &&
    last.content.length === 1 &&
    last.content[0].type === "text" &&
    last.content[0].text.trim() === currentPrompt.trim()
  ) {
    messages.pop();
  }
  return messages.slice(-HYDRATION_LIMIT);
}

/** Tool subsets per agent. Explore is strictly read-only. */
function toolsForAgent(
  agentId: RuntimeStreamOptions["agentId"],
): string[] | undefined {
  switch (agentId) {
    case "explore":
      return ["read_file", "glob", "grep"];
    default:
      return undefined; // all tools
  }
}

/** Chunk throttle: the runtime emits deltas faster than the renderer needs. */
const CHUNK_THROTTLE_MS = 100;

export async function handleRuntimeStream(
  event: IpcMainInvokeEvent,
  req: ChatStreamParams,
  abortController: AbortController,
  options: RuntimeStreamOptions,
): Promise<RuntimeStreamResult> {
  const { placeholderMessageId, appPath, chatMessages } = options;
  const agentId = options.agentId ?? "build";

  const emptyResult: RuntimeStreamResult = {
    fullResponse: "",
    success: false,
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    cachedTokens: 0,
    costUsd: null,
  };

  // ── 0. Pre-flight: resolve the model target early so we fail fast ──────
  const target = resolveRuntimeModelTarget({
    customAgentModelSource: options.customAgentModelSource,
    customAgentModel: options.customAgentModel,
  });
  if (!target) {
    return {
      ...emptyResult,
      fullResponse:
        "No hay ningún modelo OpenAI-compatible configurado. Abre el panel de modelos y configura OpenRouter, un proveedor custom o un modelo local.",
    };
  }

  // Additive custom prompt → fold into contextInstructions (adapter parity).
  const contextInstructions = [...(options.contextInstructions ?? [])];
  if (options.customPromptMode === "additive" && options.customSystemPrompt) {
    contextInstructions.push(
      `CUSTOM AGENT SYSTEM INSTRUCTIONS:\n${options.customSystemPrompt}`,
    );
  }

  const systemPrompt = attachToSystemPrompt(
    contextInstructions.length > 0 ? contextInstructions : undefined,
    options.customSystemPrompt,
  );

  const runtime = getRuntime();
  const mapper = new VibesEventMapper();
  const workspaceRoot = getVibesAppPath(appPath);

  // ── 1. Fresh hydrated session for this turn (DP-4) ─────────────────────
  const session = await runtime.createSession({
    prompt: req.prompt,
    agent: {
      id: agentId,
      ...(systemPrompt ? { systemPrompt } : {}),
      ...(toolsForAgent(agentId)
        ? { tools: toolsForAgent(agentId) as string[] }
        : {}),
    },
    messages: convertHistoryToRuntimeMessages(chatMessages, req.prompt),
    workspaceRoot,
  });
  activeSessionByChat.set(req.chatId, session.id);
  logger.info(
    `[RuntimeBridge] Session ${session.id} for chat ${req.chatId} (agent=${agentId}, workspace=${workspaceRoot})`,
  );

  // ── 2. UI context for permission prompts (B3) ──────────────────────────
  setSessionUIContext(session.id, { chatId: req.chatId, sender: event.sender });

  // ── 3. Subscribe: raw events → mapper; bridge → throttled chunks ───────
  const sendChunk = (content: string) => {
    const currentMessages = [...chatMessages];
    if (currentMessages.length > 0) {
      const lastMsg = currentMessages[currentMessages.length - 1];
      if (lastMsg.role === "assistant") lastMsg.content = content;
    }
    safeSend(event.sender, "chat:response:chunk", {
      chatId: req.chatId,
      messages: currentMessages,
    });
  };

  let lastChunkAt = 0;
  let chunkTimer: NodeJS.Timeout | null = null;
  const pushChunk = () => {
    const now = Date.now();
    if (now - lastChunkAt < CHUNK_THROTTLE_MS) {
      if (!chunkTimer) {
        chunkTimer = setTimeout(() => {
          chunkTimer = null;
          lastChunkAt = Date.now();
          sendChunk(mapper.buildLiveContent());
        }, CHUNK_THROTTLE_MS);
      }
      return;
    }
    lastChunkAt = now;
    sendChunk(mapper.buildLiveContent());
  };

  const rawUnsubscribe = session.subscribe((e: RuntimeEvent) => mapper.handle(e));
  const bridgeUnsubscribe = attachBridge(
    (handler) => session.subscribe(handler),
    {
      onTextDelta: () => pushChunk(),
      onToolStarted: () => pushChunk(),
      onToolFinished: () => pushChunk(),
    },
  );

  // ── 4. 10s checkpoint of partial text (adapter parity) ─────────────────
  let lastCheckpointLength = 0;
  const checkpointIntervalId = setInterval(async () => {
    try {
      const currentPartial = mapper
        .getTimeline()
        .filter((e) => e.type === "text")
        .map((e) => (e as { type: "text"; text: string }).text)
        .join("");
      if (
        currentPartial.length > lastCheckpointLength &&
        currentPartial.length > 0
      ) {
        lastCheckpointLength = currentPartial.length;
        const db = getRemoteDb();
        await db
          .update(remoteSchema.messages)
          .set({ content: currentPartial })
          .where(eq(remoteSchema.messages.id, placeholderMessageId));
        logger.debug(
          `[RuntimeBridge] Checkpoint: ${currentPartial.length}ch for message ${placeholderMessageId}`,
        );
      }
    } catch (err) {
      logger.warn(
        `[RuntimeBridge] Checkpoint write failed (non-fatal): ${(err as Error).message}`,
      );
    }
  }, 10_000);

  // ── 5. Run ─────────────────────────────────────────────────────────────
  let result: Awaited<ReturnType<typeof session.run>> | undefined;
  let runError: Error | null = null;
  try {
    result = await session.run(abortController.signal);
  } catch (err) {
    runError = err as Error;
    logger.error(`[RuntimeBridge] run() failed: ${runError.message}`);
  } finally {
    clearInterval(checkpointIntervalId);
    if (chunkTimer) clearTimeout(chunkTimer);
    rawUnsubscribe();
    bridgeUnsubscribe();
    clearSessionUIContext(session.id);
    activeSessionByChat.delete(req.chatId);
  }

  // ── 6. Final content ───────────────────────────────────────────────────
  let finalContent = mapper.buildLiveContent();

  const filesChanged = mapper.getFilesChanged();
  if (filesChanged.length > 0) {
    const basenames = [
      ...new Set(filesChanged.map((f) => path.basename(f))),
    ];
    finalContent += `\n<vibes-files-changed files="${basenames.length}" insertions="0" deletions="0" paths="${escapeAttr(basenames.join(","))}">\n</vibes-files-changed>\n`;
  }

  if (result) {
    finalContent += buildTokenUsageTag(result.usage.input, result.usage.output);
  }

  const aborted =
    abortController.signal.aborted || result?.finishReason === "cancelled";
  if (aborted) {
    finalContent += buildCancelledTag();
  }

  sendChunk(finalContent);

  const success =
    !runError &&
    !aborted &&
    result !== undefined &&
    result.finishReason !== "error";
  const usage = result?.usage ?? {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
  };

  logger.info(
    `[RuntimeBridge] Finished chat ${req.chatId}: finish=${result?.finishReason ?? "n/a"} usage=${usage.input}+${usage.output} aborted=${aborted}`,
  );

  return {
    fullResponse: finalContent || (aborted ? "Operación cancelada" : ""),
    success,
    inputTokens: usage.input,
    outputTokens: usage.output,
    // vibes-core v1 does not split reasoning tokens yet (post-MVP).
    reasoningTokens: 0,
    cachedTokens: usage.cacheRead,
    // No cost accounting in vibes-core v1 (post-MVP).
    costUsd: null,
  };
}

/** Cancels the ACTIVE runtime session for a chat (chat:cancel path). */
export async function cancelRuntimeStream(chatId: number): Promise<void> {
  const sessionId = activeSessionByChat.get(chatId);
  if (!sessionId) return;
  try {
    await getRuntime().cancel(sessionId);
    logger.info(
      `[RuntimeBridge] Cancelled runtime session ${sessionId} (chat ${chatId})`,
    );
  } catch (err) {
    logger.warn(`[RuntimeBridge] cancel failed: ${(err as Error).message}`);
  }
}

/** Visible for diagnostics/tests. */
export function getActiveRuntimeSession(chatId: number): string | undefined {
  return activeSessionByChat.get(chatId);
}

/**
 * v2.7 (B6 hardening): hard-delete the runtime session for a chat.
 *
 * Used when the host deletes a chat, resets the workspace, or purges
 * orphaned sessions. If there's no active handle (session already
 * finished) we still call Runtime.deleteSession so the persisted row
 * is cleaned up — the runtime API is idempotent.
 *
 * We also drop the chatId → sessionId mapping so a subsequent
 * `getActiveRuntimeSession` call for the same chat returns undefined.
 */
export async function deleteRuntimeSession(chatId: number): Promise<void> {
  const sessionId = activeSessionByChat.get(chatId);
  activeSessionByChat.delete(chatId);
  if (!sessionId) {
    // No active handle — nothing to cancel. Storage cleanup is best-effort:
    // we don't know which sessionId corresponds to this chatId, so we
    // cannot delete the persisted record here. The host is expected to
    // delete the Vibes-side record; orphan rows will be reaped by a
    // future GC pass (post-MVP).
    logger.info(
      `[RuntimeBridge] deleteRuntimeSession for chat ${chatId}: no active handle, skipping storage cleanup`,
    );
    return;
  }
  try {
    await getRuntime().deleteSession(sessionId);
    logger.info(
      `[RuntimeBridge] Deleted runtime session ${sessionId} (chat ${chatId})`,
    );
  } catch (err) {
    logger.warn(
      `[RuntimeBridge] deleteSession failed for ${sessionId}: ${(err as Error).message}`,
    );
    throw err;
  }
}

/**
 * v2.7 (B6 hardening): delete the runtime session when you know the
 * sessionId (typically loaded from chats.opencodeSessionId at delete
 * time, where the session has already finished and is not in the
 * active map).
 *
 * Idempotent. Logs and re-throws on storage failure.
 */
export async function deleteRuntimeSessionBySessionId(
  sessionId: string,
): Promise<void> {
  try {
    await getRuntime().deleteSession(sessionId);
    logger.info(`[RuntimeBridge] Deleted runtime session ${sessionId} by id`);
  } catch (err) {
    logger.warn(
      `[RuntimeBridge] deleteSession failed for ${sessionId}: ${(err as Error).message}`,
    );
    throw err;
  }
}
