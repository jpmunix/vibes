/**
 * B1: RuntimeHost — the singleton that replaces getOpenCodeClientInstance().
 *
 * Lazily builds ONE vibes-core Runtime for the whole app:
 *   - Storage: SQLite at app.getPath("userData")/runtime-sessions.db
 *   - Workspace: rooted at the vibes-apps base directory; each session can
 *     override its workspaceRoot via createSession({ workspaceRoot }).
 *   - Model: a DELEGATING provider. Vibes lets the user switch models at any
 *     moment (settings are mutable), so instead of baking one ModelProvider
 *     at boot, we resolve the current selectedModel/custom provider on every
 *     request and cache the concrete openai-compatible provider per
 *     (baseUrl|model|apiKey).
 *   - Permission gate: Vibes' banner via permission_state, wrapped in
 *     createTimeoutGate (fail-closed, 5 min — parity with the adapter).
 *
 * P1 boundary check: this file lives in Vibes (the carcass). The runtime
 * packages never import electron, UI or Vibes concepts.
 */

import { app } from "electron";
import log from "electron-log";
import * as path from "node:path";
import type {
  CompletionChunk,
  CompletionRequest,
  CompletionResponse,
  ModelProvider,
  PermissionGate,
  QuestionHandler,
  Runtime,
  LoopConfig,
} from "@vibes/runtime";
import { DEFAULT_LOOP_CONFIG } from "@vibes/runtime";
import {
  createSqliteStorageProvider,
  SqliteTodoHandler,
} from "@vibes/providers/sqlite";
import { permissionResolver } from "./permission_resolver";
import type { PermissionsConfig } from "../../lib/schemas";
import { createRuntimeBuilder } from "@vibes/runtime-impl";
import {
  openAiCompatibleFactory,
  OPENAI_COMPATIBLE_PROTOCOL,
  createOpenAICompatibleProvider,
} from "@vibes/providers/openai-compatible";
import { createBuiltInRegistry } from "@vibes/tools";
import {
  getSessionUIContext,
  waitForRuntimePermissionResponse,
  RUNTIME_PERMISSION_TIMEOUT_MS,
} from "./permission_state";
import {
  waitForRuntimeQuestionResponse,
  RUNTIME_QUESTION_TIMEOUT_MS,
} from "./question_state";
import { resolveRuntimeModelTarget, resolveRuntimeFallbackTarget } from "./model_resolver";
import { safeSend } from "../utils/safe_sender";
import { readSettings } from "../../main/settings";
import { randomUUID } from "node:crypto";
import type { Question, AskUserResponse } from "@vibes/shared";

const logger = log.scope("runtime_host");

// ============================================================================
// Logger adapter: vibes-core Logger → electron-log
// ============================================================================

/**
 * Adapts the vibes-core `Logger` interface to electron-log.
 * The runtime emits structured diagnostics (llm.request, tool.dispatch,
 * permission.*) at debug level — set VIBES_RUNTIME_LOG_LEVEL=debug to see them.
 */
const runtimeLogScope = log.scope("vibes-runtime");
const runtimeLogLevel = (process.env.VIBES_RUNTIME_LOG_LEVEL ??
  (app.isPackaged ? "info" : "debug")) as string;
const runtimeDebugEnabled = runtimeLogLevel === "debug";

const vibesRuntimeLogger = {
  debug(msg: string, ctx?: Record<string, unknown>): void {
    if (runtimeDebugEnabled) {
      runtimeLogScope.info(ctx ? `${msg} ${JSON.stringify(ctx)}` : msg);
    }
  },
  info(msg: string, ctx?: Record<string, unknown>): void {
    runtimeLogScope.info(ctx ? `${msg} ${JSON.stringify(ctx)}` : msg);
  },
  warn(msg: string, ctx?: Record<string, unknown>): void {
    runtimeLogScope.warn(ctx ? `${msg} ${JSON.stringify(ctx)}` : msg);
  },
  error(msg: string, ctx?: Record<string, unknown>): void {
    runtimeLogScope.error(ctx ? `${msg} ${JSON.stringify(ctx)}` : msg);
  },
};

/** OpenRouter requires these headers on every request. */
const OPENROUTER_HEADERS: Record<string, string> = {
  "HTTP-Referer": "https://vibes.app",
  "X-Title": "Vibes",
};

// ============================================================================
// Delegating model provider
// ============================================================================

/** Cache key → concrete provider, so we don't rebuild fetch pipelines per turn. */
const providerCache = new Map<string, ModelProvider>();

function resolveCachedProvider(): ModelProvider {
  const target = resolveRuntimeModelTarget();
  if (!target) {
    throw new Error(
      "runtime: no OpenAI-compatible model target configured (open the model settings panel)",
    );
  }
  const key = `${target.baseUrl}|${target.defaultModel}|${target.apiKey.slice(0, 8)}`;
  let provider = providerCache.get(key);
  if (!provider) {
    const isOpenRouter = target.baseUrl.includes("openrouter.ai");
    provider = createOpenAICompatibleProvider(
      {
        id: `vibes:${target.defaultModel}`,
        baseUrl: target.baseUrl,
        defaultModel: target.defaultModel,
        apiKey: target.apiKey,
        ...(isOpenRouter ? { extraHeaders: OPENROUTER_HEADERS } : {}),
      },
    );
    providerCache.set(key, provider);
    logger.info(
      `[RuntimeHost] Created model provider ${target.defaultModel} @ ${target.baseUrl}`,
    );
  }
  return provider;
}

/**
 * The ModelProvider handed to the runtime. Every call re-resolves the active
 * model from Vibes settings so mid-session model switches work like they do
 * with OpenCode (next request uses the new model).
 *
 * Card #VIBES-123: `id` used to be the fixed string "vibes-delegating", which
 * is exactly what the loop prints as `model=<id>` in the `context.snapshot`
 * header — so the log always showed `model=vibes-delegating` no matter what
 * model the user had selected. Making `id` a getter that resolves the cached
 * provider (whose id is `vibes:${defaultModel}`) lets the snapshot show the
 * real model per turn. Exported for tests.
 */
export const delegatingModelProvider: ModelProvider = {
  get id(): string {
    return resolveCachedProvider().id;
  },
  stream(req: CompletionRequest, signal: AbortSignal): AsyncIterable<CompletionChunk> {
    return resolveCachedProvider().stream(req, signal);
  },
  complete(req: CompletionRequest, signal: AbortSignal): Promise<CompletionResponse> {
    return resolveCachedProvider().complete(req, signal);
  },
  countTokens(text: string, model: string): Promise<number> {
    return resolveCachedProvider().countTokens(text, model);
  },
};

// ============================================================================
// Permission gate (B3 + Slice 3)
// ============================================================================

/**
 * Bridges runtime permission requests to Vibes' policy:
 *   - delegates the decision to `permissionResolver` (which implements the
 *     cascade: custom rules > sub-pills > global pill > Vibes default).
 *   - on "ask", sends `opencode-permission:request` to the renderer and waits.
 *   - timeout/abort → deny (fail-closed).
 *
 * Slice 3.1: the runtime no longer bypasses read-only tools. Every tool call
 * goes through the resolver. Ves defaults take care of read_* → allow.
 *
 * Slice 3.3: the resolver holds the policy. This gate is just a transport.
 */
/** Exported for tests — see runtime_host.gate.test.ts. */
export function createVibesPermissionGate(): PermissionGate {
  return {
    async requestPermission(request, signal) {
      // 1. Resolve the decision via the cascade (custom rules > sub-pills >
      //    global pill > Vibes default).
      const settings = readSettings() as {
        permissions?: PermissionsConfig;
      };
      const result = permissionResolver({
        toolId: request.toolId,
        args: request.args,
        settings: settings.permissions,
      });

      // 2. Decision is already allow/deny → return it directly.
      if (result.decision !== "ask") {
        logger.info(
          `[RuntimeHost] Permission ${result.decision} (source=${result.source}) for ${request.toolId} [${request.requestId}]`,
        );
        return result.decision;
      }

      // 3. Decision is "ask" — send to the renderer and wait.
      const ctx = getSessionUIContext(request.sessionId);
      if (!ctx?.sender) {
        // No window to ask → fail closed.
        logger.warn(
          `[RuntimeHost] No UI context for permission ${request.requestId} — denying`,
        );
        return "deny";
      }

      safeSend(ctx.sender, "opencode-permission:request", {
        requestId: request.requestId,
        sessionId: request.sessionId,
        chatId: ctx.chatId,
        toolName: request.toolId,
        toolInput: request.args ?? null,
      });
      logger.info(
        `[RuntimeHost] Permission ask sent to UI: ${request.toolId} [${request.requestId}] (source=${result.source})`,
      );

      const response = await waitForRuntimePermissionResponse(
        request.requestId,
        request.toolId,
        signal,
        RUNTIME_PERMISSION_TIMEOUT_MS,
      );
      return response === "reject" ? "deny" : "allow";
    },
  };
}

// ============================================================================
// Question handler (DP-3)
// ============================================================================

/**
 * Bridges runtime question requests to Vibes' UI:
 *   - generates a requestId
 *   - sends `agent-tool:ask-user-request` to the renderer with full Question[] payload
 *   - waits for the renderer's answer via `agent-tool:ask-user-response`
 *   - timeout/abort → reject with QuestionCancelled
 */
export function createVibesQuestionHandler(): QuestionHandler {
  return {
    async ask(
      questions: Question[],
      opts: { toolCallId?: string; signal: AbortSignal; sessionId: string },
    ): Promise<AskUserResponse> {
      const requestId = randomUUID();

      // Look up the UI context for this session
      const ctx = getSessionUIContext(opts.sessionId);
      if (!ctx?.sender) {
        logger.warn(
          `[RuntimeHost] No UI context for question ${requestId} — cancelling`,
        );
        const err = new Error("No UI context for question");
        err.name = "QuestionCancelled";
        throw err;
      }

      // Send to renderer
      safeSend(ctx.sender, "agent-tool:ask-user-request", {
        requestId,
        sessionId: opts.sessionId,
        chatId: ctx.chatId,
        questions,
        toolCallId: opts.toolCallId ?? null,
      });
      logger.info(
        `[RuntimeHost] Question sent to UI: ${questions.length} question(s) [${requestId}]`,
      );

      // Wait for response
      return waitForRuntimeQuestionResponse(
        requestId,
        opts.signal,
        RUNTIME_QUESTION_TIMEOUT_MS,
      );
    },
  };
}

// ============================================================================
// Runtime singleton
// ============================================================================

let runtimeInstance: Runtime | null = null;

// #165: LoopConfig que gobierna el loop del runtime. Vive a nivel de módulo
// (no dentro de getRuntime) para que el accessor de hot-reload
// (applyAgentLoopLimits) pueda mutarlo. El loop lo lee POR REFERENCIA en cada
// iteración, así que mutarlo aplica el cambio a la siguiente iteración SIN
// recrear el runtime ni tocar sesiones en curso. Es una copia del default del
// paquete para no pisar DEFAULT_LOOP_CONFIG compartido.
let loopConfigMutable: LoopConfig = { ...DEFAULT_LOOP_CONFIG };
// #215: último fallbackModel string persistido (para detectar cambios y no
// recrear el provider si el usuario no lo cambió).
let lastFbString: string | undefined = undefined;

/**
 * Lazily builds the shared Runtime. Throws if settings can't produce a
 * storage dir (should never happen in a real app).
 */
export function getRuntime(): Runtime {
  if (runtimeInstance) return runtimeInstance;

  const storagePath = path.join(app.getPath("userData"), "runtime-sessions.db");

  // Bug 76: build the SQLite provider explicitly so the same instance can back
  // both the storage and the TodoHandler. The builder's .sqliteStorage() builds
  // an internal provider we can't reach, and the loop needs a TodoHandler to
  // persist session-scoped todo lists (ctx.todo) — without it todowrite throws
  // 'Todo handler not configured' and the model dumps the list as plain text.
  const storageProvider = createSqliteStorageProvider({ path: storagePath });

  runtimeInstance = createRuntimeBuilder("vibes")
    .workspaceRoot(path.dirname(app.getPath("userData"))) // sessions override per-app via workspaceRoot
    .storage(storageProvider)
    .model(delegatingModelProvider)
    .registerProtocol(OPENAI_COMPATIBLE_PROTOCOL, openAiCompatibleFactory())
    .tools(createBuiltInRegistry())
    .permissionGate(createVibesPermissionGate())
    .questionHandler(createVibesQuestionHandler())
    .todoHandler(new SqliteTodoHandler(storageProvider))
    .loopConfig(loopConfigMutable)
    .logger(vibesRuntimeLogger)
    .build();

  // Aplica los límites persistidos por el usuario (si existen) sobre el
  // loopConfig recién creado. Así un arranque de app respeta lo guardado.
  applyAgentLoopLimits(readSettings());

  logger.info(`[RuntimeHost] Runtime ready (storage: ${storagePath})`);
  return runtimeInstance;
}

/**
 * #165: aplica los límites duros del loop configurados por el usuario
 * (Ajustes > Agente) al LoopConfig del runtime, mutándolo EN CALIENTE.
 *
 * El loop del runtime lee `loopConfig` por referencia en cada iteración, así
 * que mutar este objeto aplica el cambio a la siguiente iteración sin recrear
 * el runtime ni interrumpir sesiones en curso. Se llama:
 *   - desde getRuntime() al arrancar (respeta lo persistido)
 *   - desde setUserSettings() cuando el usuario cambia el valor (hot-reload)
 *
 * Valores undefined / fuera de rango → se cae al default de vibes-core.
 */
export function applyAgentLoopLimits(
  settings: {
    agentMaxIterations?: number;
    agentMaxWallClockMinutes?: number;
    fallbackModel?: string;
    compactionModel?: string;
    compactionMaxRoundsKept?: number;
  } | null | undefined,
): void {
  const maxIterations =
    typeof settings?.agentMaxIterations === "number" &&
    Number.isFinite(settings.agentMaxIterations) &&
    settings.agentMaxIterations >= 1
      ? Math.floor(settings.agentMaxIterations)
      : DEFAULT_LOOP_CONFIG.maxIterations;

  const maxWallClockMs =
    typeof settings?.agentMaxWallClockMinutes === "number" &&
    Number.isFinite(settings.agentMaxWallClockMinutes) &&
    settings.agentMaxWallClockMinutes >= 1
      ? Math.floor(settings.agentMaxWallClockMinutes) * 60 * 1000
      : DEFAULT_LOOP_CONFIG.maxWallClockMs;

  // #215: resolver el modelo de respaldo (fallbackModel) de la UI a un
  // ModelProvider concreto. Si el string es inválido o no resoluble → sin fallback.
  // Guardamos el string persistido en lastFbString para NO recrear el provider
  // si el usuario no cambió el modelo (evita ruido en log y trabajo innecesario).
  const fbString = settings?.fallbackModel;
  let fbProvider: ModelProvider | undefined;
  if (fbString) {
    const fbTarget = resolveRuntimeFallbackTarget(
      fbString,
      readSettings() as Parameters<typeof resolveRuntimeFallbackTarget>[1],
    );
    if (fbTarget) {
      fbProvider = createOpenAICompatibleProvider({
        id: `vibes:fb:${fbTarget.defaultModel}`,
        baseUrl: fbTarget.baseUrl,
        defaultModel: fbTarget.defaultModel,
        apiKey: fbTarget.apiKey,
      });
    }
  }

  const compactionString = settings?.compactionModel;
  let compactionProvider: ModelProvider | undefined;
  if (compactionString) {
    const target = resolveRuntimeFallbackTarget(
      compactionString,
      readSettings() as Parameters<typeof resolveRuntimeFallbackTarget>[1],
    );
    if (target) {
      compactionProvider = createOpenAICompatibleProvider({
        id: `vibes:compaction:${target.defaultModel}`,
        baseUrl: target.baseUrl,
        defaultModel: target.defaultModel,
        apiKey: target.apiKey,
      });
    }
  }

  // Solo mutamos si cambia (evita ruido en el log y trabajo innecesario).
  const fallbackChanged = lastFbString !== fbString;
  if (
    maxIterations === loopConfigMutable.maxIterations &&
    maxWallClockMs === loopConfigMutable.maxWallClockMs &&
    !fallbackChanged &&
    loopConfigMutable.compaction?.summarizerModel === compactionProvider &&
    loopConfigMutable.compaction?.maxRoundsKept === settings?.compactionMaxRoundsKept
  ) {
    return;
  }

  loopConfigMutable.maxIterations = maxIterations;
  loopConfigMutable.maxWallClockMs = maxWallClockMs;
  loopConfigMutable.fallbackModel = fbProvider;
  loopConfigMutable.compaction = {
    ...loopConfigMutable.compaction,
    summarizerModel: compactionProvider,
    ...(typeof settings?.compactionMaxRoundsKept === "number"
      ? { maxRoundsKept: Math.floor(settings.compactionMaxRoundsKept) }
      : {}),
  };
  lastFbString = fbString;
  logger.info(
    `[RuntimeHost] Loop limits updated: maxIterations=${maxIterations} maxWallClockMs=${maxWallClockMs} (${(maxWallClockMs / 3_600_000).toFixed(1)}h) fallback=${fbString ?? "none"}`,
  );
}

/**
 * #165: expone los límites actuales del loop (post-aplicación de settings).
 * Útil para diagnóstico y para tests del hot-reload.
 */
export function getAgentLoopLimits(): {
  maxIterations: number;
  maxWallClockMs: number;
  fallbackModel?: ModelProvider;
  compaction?: LoopConfig["compaction"];
} {
  return {
    maxIterations: loopConfigMutable.maxIterations,
    maxWallClockMs: loopConfigMutable.maxWallClockMs,
    fallbackModel: loopConfigMutable.fallbackModel,
    compaction: loopConfigMutable.compaction,
  };
}

/**
 * Graceful shutdown — call it from the app's quit sequence. Idempotent.
 */
export async function shutdownRuntime(): Promise<void> {
  if (!runtimeInstance) return;
  const instance = runtimeInstance;
  runtimeInstance = null;
  try {
    await instance.shutdown();
    logger.info("[RuntimeHost] Runtime shut down cleanly");
  } catch (err) {
    logger.error(`[RuntimeHost] Shutdown error: ${(err as Error).message}`);
  }
}

/** Visible for tests/diagnostics. */
export function hasRuntimeInstance(): boolean {
  return runtimeInstance !== null;
}
