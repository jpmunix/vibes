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
import { getRuntime, getContextDebugSender } from "./runtime_host";
import { appendContextDebugEntry } from "./context_debug_log";
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
import { readSettings } from "../../main/settings";
import { attachToSystemPrompt } from "./prompt_attach";
import { attachmentsToImageParts, resolvePersistedImage } from "./attachments_media";
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
  /** #243: input del ÚLTIMO step LLM del turno — contexto real del próximo request. */
  lastStepInput: number;
};

/**
 * Converts Vibes chat history into runtime Messages for hydration.
 *   - Assistant content is scrubbed of `<vibes-*>` tags and think blocks, EXCEPT
 *     for `<vibes-context-summary>` which stores previous turn exploration memory.
 *   - The trailing empty assistant placeholder is naturally skipped.
 *   - The current user prompt is dropped if it matches the tail — it will be
 *     re-seeded by createSession (avoids duplication).
 */
async function convertHistoryToRuntimeMessages(
  chatMessages: any[],
  currentPrompt: string,
): Promise<Message[]> {
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

    const content: Message["content"] = [{ type: "text", text: finalText }];
    if (role === "user") {
      // Persisted chat rows keep the provider-facing representation in
      // aiMessagesJson so thumbnails and previous turns can be reconstructed.
      // Restore only image parts; the current textual path above remains the
      // canonical source for the visible prompt and summary tags.
      let persisted: unknown = msg.aiMessagesJson;
      if (typeof persisted === "string") {
        try {
          persisted = JSON.parse(persisted);
        } catch {
          persisted = undefined;
        }
      }
      const persistedMessages = Array.isArray(persisted)
        ? persisted
        : persisted && typeof persisted === "object" && Array.isArray((persisted as { messages?: unknown }).messages)
          ? (persisted as { messages: unknown[] }).messages
          : [];
      const persistedUser = persistedMessages.find((candidate: any) => candidate?.role === "user") as any;
      if (Array.isArray(persistedUser?.content)) {
        for (const part of persistedUser.content) {
          if (part?.type !== "image") continue;
          // The persisted representation is heterogeneous: CDN URL when the
          // upload succeeded, inline dataURL/base64 as fallback. The resolver
          // maps each to the correct ImageContentPart shape and re-inlines
          // CDN URLs as base64 (the universal wire representation).
          const normalized = await resolvePersistedImage({
            raw:
              typeof part.data === "string"
                ? part.data
                : typeof part.image === "string"
                  ? part.image
                  : undefined,
            mediaType:
              typeof part.mediaType === "string"
                ? part.mediaType
                : typeof part.mimeType === "string"
                  ? part.mimeType
                  : "image/png",
          });
          if (normalized) content.push(normalized);
        }
      }
    }

    messages.push({
      role,
      content,
      ts: typeof msg.createdAt === "number" ? msg.createdAt : undefined,
    });
  }
  // Drop the current prompt if it's the trailing user message.
  const last = messages[messages.length - 1];
  const lastText =
    last?.role === "user"
      ? last.content.find((part) => part.type === "text")
      : undefined;
  if (
    last &&
    last.role === "user" &&
    lastText?.type === "text" &&
    lastText.text.trim() === currentPrompt.trim()
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
    lastStepInput: 0,
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
  // #196: an image-only turn is a valid user request even when the text
  // prompt is empty. Convert once here so the guard and createSession share
  // exactly the same validity decision.
  const mediaParts = attachmentsToImageParts(req.attachments);
  const hasValidImage = mediaParts.length > 0;

  const promptLen = (req.prompt ?? "").length;
  if (!req.prompt?.trim() && !hasValidImage && !req.undoRedo) {
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

  // ── #258: sampling params (temperature / topP / repetitionPenalty) ──────
  // Read the user's inference settings once per turn and forward them to the
  // runtime via the AgentDefinition. undefined = omit the field; the runtime
  // and the provider then fall back to their own defaults.
  let samplingParams: { temperature?: number; topP?: number; repetitionPenalty?: number } = {};
  try {
    const s = readSettings();
    samplingParams = {
      ...(s.inferenceTemperature !== undefined ? { temperature: s.inferenceTemperature } : {}),
      ...(s.inferenceTopP !== undefined ? { topP: s.inferenceTopP } : {}),
      ...(s.inferenceRepetitionPenalty !== undefined
        ? { repetitionPenalty: s.inferenceRepetitionPenalty }
        : {}),
    };
  } catch (err) {
    // Settings unreadable → send no sampling params; the turn still works with
    // provider defaults.
    logger.warn(
      `[RuntimeBridge] Failed to read inference settings: ${(err as Error).message} — omitting sampling params`,
    );
  }

  // ── 1. Session resolution: continue existing session (chat = session) or create fresh ──
  // #248 (Slice C / DP-4 reverted): we maintain ONE persistent session per chat.
  // If the chat already has an opencodeSessionId and the session exists in the runtime,
  // we call continueSession to append the new user turn to the existing conversation.
  // Fallback legacy: if the chat has no session or continueSession fails (e.g. wiped SQLite
  // or old pre-#248 chat), we create a fresh hydrated session and link its id to the chat.
  const db = getRemoteDb();
  let existingSessionId: string | null = null;
  try {
    const chatRow = await db.query?.chats?.findFirst?.({
      where: eq(remoteSchema.chats.id, req.chatId),
      columns: { opencodeSessionId: true },
    });
    existingSessionId = chatRow?.opencodeSessionId ?? null;
  } catch (err) {
    logger.warn(
      `[RuntimeBridge] Failed to load chat ${req.chatId} opencodeSessionId: ${(err as Error).message}`,
    );
  }

  // Slice 3.9: if an active session handle is lingering in the map, cancel it.
  // If it is an orphaned leftover session that is NOT the chat's persistent session,
  // delete it from storage to prevent leaks.
  const previousActiveId = activeSessionByChat.get(req.chatId);
  if (previousActiveId) {
    logger.warn(
      `[RuntimeBridge] Found active handle ${previousActiveId} for chat ${req.chatId} before new turn — cancelling prior run`,
    );
    activeSessionByChat.delete(req.chatId);
    try {
      await runtime.cancel(previousActiveId);
      if (previousActiveId !== existingSessionId) {
        await runtime.deleteSession(previousActiveId);
      }
    } catch (err) {
      logger.warn(
        `[RuntimeBridge] Cleanup of active session ${previousActiveId} failed: ${(err as Error).message} — continuing`,
      );
    }
  }

  let session: import("@vibes/runtime").SessionHandle | null = null;
  if (existingSessionId) {
    try {
      session = await runtime.continueSession(existingSessionId, {
        prompt: req.prompt,
        media: mediaParts,
        agent: {
          id: agentId,
          ...(systemPrompt ? { systemPrompt } : {}),
          ...(toolsForAgent(agentId)
            ? { tools: toolsForAgent(agentId) as string[] }
            : {}),
          ...samplingParams,
        },
        workspaceRoots,
      });
      logger.info(
        `[RuntimeBridge] Continued existing session ${existingSessionId} for chat ${req.chatId}`,
      );
    } catch (err) {
      logger.warn(
        `[RuntimeBridge] Could not continue session ${existingSessionId} for chat ${req.chatId}: ${(err as Error).message} — creating fresh session with hydrated history`,
      );
      session = null;
    }
  }

  if (!session) {
    session = await runtime.createSession({
      prompt: req.prompt,
      agent: {
        id: agentId,
        ...(systemPrompt ? { systemPrompt } : {}),
        ...(toolsForAgent(agentId)
          ? { tools: toolsForAgent(agentId) as string[] }
          : {}),
        ...samplingParams,
      },
      messages: await convertHistoryToRuntimeMessages(chatMessages, req.prompt),
      media: mediaParts,
      workspaceRoots,
    });
    // Link session id to chat row so subsequent turns reuse it
    try {
      await db
        .update(remoteSchema.chats)
        .set({ opencodeSessionId: session.id })
        .where(eq(remoteSchema.chats.id, req.chatId));
      logger.info(
        `[RuntimeBridge] Created and linked session ${session.id} for chat ${req.chatId}`,
      );
    } catch (err) {
      logger.warn(
        `[RuntimeBridge] Failed to link opencodeSessionId ${session.id} to chat ${req.chatId}: ${(err as Error).message}`,
      );
    }
  }

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
          const snapshot = mapper.buildLiveContent();
          (mapper as unknown as { debugSnapshot?: (l: string, s: string) => void })
            .debugSnapshot?.("pushChunk-throttled", snapshot);
          sendChunk(snapshot);
        }, CHUNK_THROTTLE_MS);
      }
      return;
    }
    lastChunkAt = now;
    const snapshot = mapper.buildLiveContent();
    (mapper as unknown as { debugSnapshot?: (l: string, s: string) => void })
      .debugSnapshot?.("pushChunk-immediate", snapshot);
    sendChunk(snapshot);
  };

  const rawUnsubscribe = session.subscribe((e: RuntimeEvent) => {
    // #230/#243: el input del ÚLTIMO step es el contexto real del próximo
    // request. `session.run()` solo devuelve el ACUMULADO del turno
    // (state.usage) — sumar todos los steps cuenta el mismo contexto N veces.
    //
    // BUGFIX (#255): antes esto dependía SOLO de llm.completed.usage.input,
    // que llega del wire del provider. Si el provider/stream no lo mandaba
    // (usage ausente o prompt_tokens 0 en el chunk final), lastStepInput se
    // quedaba en 0 y el fallback de abajo lo sustituía por result.usage.input
    // — el ACUMULADO del turno (3.2M en turnos de 75 steps). El gauge entonces
    // pintaba el facturable como si fuera contexto real.
    //
    // Fuentes del contexto real del step, por fiabilidad:
    //   1. context.built.tokens — lo emite el loop SIEMPRE, justo antes de
    //      llamar al modelo, con la estimación exacta del contexto construido.
    //   2. llm.completed.usage.input — lo que el provider reporta haber
    //      mandado (solo si viene en el wire; no siempre).
    // Se sobreescribe con el evento más reciente de cualquiera de los dos;
    // ambos representan el MISMO step (context.built precede al llm.completed
    // de ese step), así que el último en llegar gana sin ambigüedad.
    if (e.type === "llm.completed" && e.usage && e.usage.input > 0) {
      lastStepInput = e.usage.input;
    } else if (e.type === "context.built" && typeof e.tokens === "number" && e.tokens > 0) {
      lastStepInput = e.tokens;
    }
    // Context debug (temporal): cada context.built con payload (systemPrompt
    // + messages + model, presentes solo con debugContext ON = ventana
    // abierta) se PERSISTE a disco (JSONL, fuente de verdad que sobrevive a
    // reinicios) y, si la ventana está abierta, se reenvía en vivo a esa
    // ventana. appendContextDebugEntry es fire-and-forget (no tumba el loop).
    if (e.type === "context.built") {
      if (e.systemPrompt || e.messages) {
        appendContextDebugEntry({
          chatId: req.chatId,
          sessionId: e.sessionId,
          iteration: e.iteration,
          tokens: e.tokens,
          model: e.model,
          systemPrompt: e.systemPrompt,
          messages: e.messages,
        });
        const debugWc = getContextDebugSender();
        if (debugWc) {
          safeSend(debugWc, "context:debug", {
            chatId: req.chatId,
            sessionId: e.sessionId,
            iteration: e.iteration,
            tokens: e.tokens,
            model: e.model,
            systemPrompt: e.systemPrompt,
            messages: e.messages,
          });
        }
      }
    }
    mapper.handle(e);
  });
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
  // #243: input del ÚLTIMO step (contexto real del próximo request), capturado
  // del evento llm.completed. session.run() solo devuelve el acumulado.
  let lastStepInput = 0;
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
  // #238: cerrar reasoning pendiente antes de serializar el contenido final.
  mapper.closePendingReasoning();
  let finalContent = mapper.buildLiveContent();
  (mapper as unknown as { debugSnapshot?: (l: string, s: string) => void })
    .debugSnapshot?.("final", finalContent);

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
    // BUGFIX (#255): NUNCA usar result.usage.input como input del tag. Ese es
    // el ACUMULADO facturable del turno (suma de todos los steps) — meterlo
    // como `input` hace que el gauge pinte 3.2M cuando el contexto real del
    // último step eran 120K. Si no hay lastStepInput (turno sin steps o sin
    // eventos), emitimos input=0: el parser lo trata como "sin dato" y el
    // gauge se queda mudo en vez de mentir. El billable (coste real) SÍ va
    // como atributo separado billable-input.
    const lastInput = lastStepInput > 0 ? lastStepInput : 0;
    const billable = result.usage.input;
    finalContent += buildTokenUsageTag(lastInput, result.usage.output, billable);
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
    // #243/#255: input del ÚLTIMO step — el contexto real del próximo
    // request. NUNCA cae al acumulado del turno (usage.input) — eso ya viaja
    // como inputTokens (coste). Si no hubo step (lastStepInput = 0), el
    // handler de chat_stream usa este valor para decidir si emite billable;
    // 0 es correcto ("no hay contexto de step que reportar").
    lastStepInput,
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
  const activeSessionId = activeSessionByChat.get(chatId);
  activeSessionByChat.delete(chatId);
  if (activeSessionId) {
    try {
      await getRuntime().cancel(activeSessionId);
    } catch {
      /* ignore */
    }
  }

  let sessionIdToDelete = activeSessionId;
  if (!sessionIdToDelete) {
    try {
      const db = getRemoteDb();
      const chat = await db.query?.chats?.findFirst?.({
        where: eq(remoteSchema.chats.id, chatId),
        columns: { opencodeSessionId: true },
      });
      if (chat?.opencodeSessionId) {
        sessionIdToDelete = chat.opencodeSessionId;
      }
    } catch (err) {
      logger.warn(
        `[RuntimeBridge] Could not query opencodeSessionId for chat ${chatId}: ${(err as Error).message}`,
      );
    }
  }

  if (!sessionIdToDelete) {
    logger.info(
      `[RuntimeBridge] deleteRuntimeSession for chat ${chatId}: no active handle or stored sessionId, skipping storage cleanup`,
    );
    return;
  }

  try {
    await getRuntime().deleteSession(sessionIdToDelete);
    logger.info(
      `[RuntimeBridge] Deleted runtime session ${sessionIdToDelete} (chat ${chatId})`,
    );
  } catch (err) {
    logger.warn(
      `[RuntimeBridge] deleteSession failed for ${sessionIdToDelete}: ${(err as Error).message}`,
    );
    throw err;
  }
}

/**
 * #248 (Slice C / D5): truncate the runtime session associated with a chat.
 * Used by undo/redo in chat_stream_handlers.ts and version_handlers.ts.
 */
export async function truncateRuntimeSession(
  chatId: number,
  options?: { toMessageIndex?: number },
): Promise<void> {
  try {
    const db = getRemoteDb();
    const chat = await db.query?.chats?.findFirst?.({
      where: eq(remoteSchema.chats.id, chatId),
      columns: { opencodeSessionId: true },
    });
    if (chat?.opencodeSessionId) {
      await getRuntime().truncateSession(chat.opencodeSessionId, options);
      logger.info(
        `[RuntimeBridge] Truncated runtime session ${chat.opencodeSessionId} (chat ${chatId})`,
      );
    }
  } catch (err) {
    logger.warn(
      `[RuntimeBridge] Failed to truncate session for chat ${chatId}: ${(err as Error).message}`,
    );
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
