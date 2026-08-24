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
  buildTurnSummaryTag,
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
 *
 * Slice 3.9: also exported as `__activeSessionByChat` for the contract test
 * that exercises the leftover-purge path. Not part of the public surface.
 */
const activeSessionByChat = new Map<number, string>();
export const __activeSessionByChat = activeSessionByChat;

export type RuntimeStreamOptions = {
  placeholderMessageId: number;
  appPath: string;
  /**
   * #95: the app id, used by the bridge to resolve the linked folders
   * (app_folders table) and mount a multi-root runtime session.
   */
  appId: number;
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
 *   - Assistant content is scrubbed of `<vibes-*>` tags and think blocks, EXCEPT
 *     for `<vibes-context-summary>` which stores previous turn exploration memory.
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

    // Extract context summary if present before stripping other tags
    const summaryMatch = raw.match(/<vibes-context-summary>([\s\S]*?)<\/vibes-context-summary>/);
    const summaryText = summaryMatch ? summaryMatch[1].trim() : "";

    const scrubbed = raw
      .replace(/<vibes-[^>]*\/>/g, "")
      .replace(/<vibes-[^>]*>[\s\S]*?<\/vibes-[^>]*>/g, "")
      .replace(/<think>[\s\S]*?<\/think>/g, "")
      .trim();

    let finalText = scrubbed;
    if (summaryText) {
      finalText = finalText
        ? `${finalText}\n\n[Previous Turn Context Summary]\n${summaryText}`
        : `[Previous Turn Context Summary]\n${summaryText}`;
    }

    if (!finalText) continue;
    messages.push({
      role,
      content: [{ type: "text", text: finalText }],
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

  // ── 0b. Pre-flight: guard de prompt vacío (#179) ─────────────────────────
  // El handler de chat_stream muta req.prompt al strippear slash commands
  // (p.ej. un prompt que era solo "/agent  " queda ""). Un prompt vacío llega
  // al runtime, que seedea un user message con texto '' que el provider
  // openai-compatible descarta del wire → el modelo responde sin petición
  // ("estoy listo, ¿qué hago?"). Abortamos con error visible y log de
  // diagnóstico (chatId, longitudes y banderas) para cazar la vía por la que
  // se perdió el texto. undoRedo sin prompt es un flujo legítimo (solo
  // deshacer), se respeta.
  const promptLen = (req.prompt ?? "").length;
  if (!req.prompt?.trim() && !req.undoRedo) {
    logger.warn(
      `[RuntimeBridge] Empty prompt guard tripped (chat ${req.chatId}): ` +
        `promptLen=${promptLen} attachments=${req.attachments?.length ?? 0} ` +
        `priorMessages=${req.priorMessages?.length ?? 0} selectedComponents=${req.selectedComponents?.length ?? 0} ` +
        `chatMode=${req.chatMode ?? "n/a"} undoRedo=${req.undoRedo ?? false} redo=${req.redo ?? false}`,
    );
    return {
      ...emptyResult,
      fullResponse:
        "El mensaje llegó vacío al agente (posible comando sin texto). Revisa el log de la app para más detalle.",
    };
  }

  // Additive custom prompt → fold into contextInstructions (adapter parity).
  const contextInstructions = [...(options.contextInstructions ?? [])];
  if (options.customPromptMode === "additive" && options.customSystemPrompt) {
    contextInstructions.push(
      `CUSTOM AGENT SYSTEM INSTRUCTIONS:\n${options.customSystemPrompt}`,
    );
  }

  // Note: `systemPrompt` is built later, after the #95 workspace folders
  // descriptor is pushed to `contextInstructions`, so the model knows about
  // all the linked folders when it receives the system prompt.

  const runtime = getRuntime();
  const mapper = new VibesEventMapper({
    onTodoUpdated: (todos) => {
      safeSend(event.sender, "agent-tool:todos-update", {
        chatId: req.chatId,
        todos,
      });
    },
  });

  // ── #95: Workspace multi-proyecto ───────────────────────────────────────
  // Resolve the app's linked folders: the primary (app.path) plus the extras
  // from the app_folders table. The primary is always first; extras follow in
  // insertion order. When the app has no extras, workspaceRoots has length 1
  // and the runtime falls back to single-root (byte-a-byte compat).
  const primaryRoot = getVibesAppPath(appPath);
  let extraFolders: { path: string; label: string; language: string | null; projectType: string | null }[] = [];
  try {
    const db = getRemoteDb();
    const rows = await db
      .select()
      .from(remoteSchema.appFolders)
      .where(eq(remoteSchema.appFolders.appId, options.appId))
      .orderBy(remoteSchema.appFolders.isPrimary, remoteSchema.appFolders.id);
    // Skip the primary row (if present from backfill) — the primary is
    // already `primaryRoot` and we want it first, deterministically.
    extraFolders = rows
      .filter((r) => r.isPrimary === 0)
      .map((r) => ({ path: r.path, label: r.label, language: r.language, projectType: r.projectType }));
  } catch (err) {
    // If the table is missing or the query fails, degrade gracefully to
    // single-root (the chat still works, just without multi-folder).
    logger.warn(
      `[RuntimeBridge] Failed to load app_folders for app ${options.appId}: ${(err as Error).message} — falling back to single-root`,
    );
  }
  const workspaceRoots = [primaryRoot, ...extraFolders.map((f) => f.path)];
  const isMultiRoot = workspaceRoots.length > 1;

  // Push a folder descriptor to contextInstructions so the model knows what
  // it has access to (decision #6: one line per folder).
  if (isMultiRoot) {
    const lines: string[] = [
      `Your workspace consists of ${workspaceRoots.length} folders. When calling file/shell tools, use ABSOLUTE paths so the runtime routes the operation to the correct folder.`,
      `When the user's request is ambiguous, use the question tool to clarify which folder they mean.`,
      `Folder 1 (primary, ${appPath}): ${primaryRoot}`,
    ];
    extraFolders.forEach((f, i) => {
      const meta = [f.language, f.projectType].filter(Boolean).join('/');
      const tag = meta ? ` (${meta})` : '';
      lines.push(`Folder ${i + 2}${tag}: ${f.path}`);
    });
    contextInstructions.push(`WORKSPACE FOLDERS:\n${lines.join('\n')}`);
  }

  const systemPrompt = attachToSystemPrompt(
    contextInstructions.length > 0 ? contextInstructions : undefined,
    options.customSystemPrompt,
  );

  // ── 1. Fresh hydrated session for this turn (DP-4) ─────────────────────
  // Slice 3.9: if a previous session for this chat is still in the active
  // map (it shouldn't be — the run() finally block deletes it — but a fast
  // double-tap can race), purge it before creating the new one. Without
  // this, every extra turn leaks a session into runtime.sessions because
  // the map key collides.
  const previousSessionId = activeSessionByChat.get(req.chatId);
  if (previousSessionId) {
    logger.warn(
      `[RuntimeBridge] Found leftover session ${previousSessionId} for chat ${req.chatId} before new turn — purging`,
    );
    activeSessionByChat.delete(req.chatId);
    try {
      const runtime = getRuntime();
      await runtime.cancel(previousSessionId);
      await runtime.deleteSession(previousSessionId);
    } catch (err) {
      logger.warn(
        `[RuntimeBridge] Purge of leftover session ${previousSessionId} failed: ${(err as Error).message} — continuing`,
      );
    }
  }

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
    // #95: pass all roots; the runtime picks multi vs single based on length.
    workspaceRoots,
  });
  activeSessionByChat.set(req.chatId, session.id);
  logger.info(
    `[RuntimeBridge] Session ${session.id} for chat ${req.chatId} (agent=${agentId}, workspace=${primaryRoot}, folders=${workspaceRoots.length})`,
  );

  // ── 1b. Hydrate todos from persisted state (G18) ────────────────────────
  // On session creation/resume, read persisted todos and emit to renderer
  // so the dock shows existing state immediately on first turn.
  try {
    const todoHandler = runtime.deps.todoHandler;
    if (todoHandler) {
      const persistedTodos = await todoHandler.get(session.id);
      if (persistedTodos.length > 0) {
        safeSend(event.sender, "agent-tool:todos-update", {
          chatId: req.chatId,
          todos: persistedTodos,
        });
        logger.info(
          `[RuntimeBridge] Hydrated ${persistedTodos.length} todos for session ${session.id}`,
        );
      }
    }
  } catch (err) {
    logger.warn(
      `[RuntimeBridge] Failed to hydrate todos for session ${session.id}: ${(err as Error).message}`,
    );
  }

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
      // 172: el razonamiento nativo se emite en vivo (LiveThinkingPanel).
      onReasoningStart: () => pushChunk(),
      onReasoningDelta: () => pushChunk(),
      onReasoningEnd: () => pushChunk(),
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

  // BUGFIX #122: si el loop terminó en error (session.failed), la UI se
  // quedaba en blanco porque finalContent era "". Exponemos el error para que
  // el usuario vea algo accionable en vez de "nada".
  const failedError = mapper.getFailedError();
  if (result?.finishReason === "error" && !finalContent) {
    finalContent =
      failedError ?? "Error del agente: el proveedor devolvió una respuesta inválida.";
  }

  const filesChanged = mapper.getFilesChanged();
  if (filesChanged.length > 0) {
    const basenames = [
      ...new Set(filesChanged.map((f) => path.basename(f))),
    ];
    finalContent += `\n<vibes-files-changed files="${basenames.length}" insertions="0" deletions="0" paths="${escapeAttr(basenames.join(","))}">\n</vibes-files-changed>\n`;
  }

  const summaryTag = buildTurnSummaryTag({
    filesRead: mapper.getFilesRead(),
    dirsListed: mapper.getDirsListed(),
    filesModified: filesChanged,
  });
  if (summaryTag) {
    finalContent += `\n${summaryTag}\n`;
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

  // #165: un corte por límite (wall-clock / iteraciones) NO es un error
  // (el modelo hizo su trabajo hasta el tope), pero SÍ es informativo: el
  // usuario debe saber que la tarea llegó al límite y cómo subirlo. Antes el
  // bridge lo marcaba success=true en silencio (finish=max-wall-clock) y
  // parecía que la tarea terminó sola. Ahora se añade un aviso visible
  // (blockquote de markdown — robusto, siempre se renderiza) + warning en log.
  const limitReason =
    result?.finishReason === "max-wall-clock"
      ? "wall-clock"
      : result?.finishReason === "max-iterations"
        ? "iterations"
        : null;
  if (limitReason) {
    const limitMsg =
      limitReason === "wall-clock"
        ? "⚠️ **Límite de tiempo alcanzado.** La tarea se detuvo al llegar al límite de tiempo del agente. Puedes subirlo en *Ajustes > Agente*."
        : "⚠️ **Límite de iteraciones alcanzado.** La tarea se detuvo al llegar al máximo de iteraciones del agente. Puedes subirlo en *Ajustes > Agente*.";
    finalContent += `\n\n> ${limitMsg}\n`;
    sendChunk(finalContent);
    logger.warn(
      `[RuntimeBridge] Chat ${req.chatId} hit loop limit (${limitReason}). ` +
        `Total input: ${result?.usage.input ?? 0} output: ${result?.usage.output ?? 0}. ` +
        `User can raise it in Settings > Agente.`,
    );
  }

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
    `[RuntimeBridge] Finished chat ${req.chatId}: finish=${result?.finishReason ?? "n/a"} Total input: ${usage.input} Total output: ${usage.output} aborted=${aborted}`,
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
