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
  Runtime,
} from "@vibes/runtime";
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
import { resolveRuntimeModelTarget } from "./model_resolver";
import { safeSend } from "../utils/safe_sender";
import { readSettings } from "../../main/settings";

const logger = log.scope("runtime_host");

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
 */
const delegatingModelProvider: ModelProvider = {
  id: "vibes-delegating",
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
// Permission gate (B3)
// ============================================================================

/**
 * Bridges runtime permission requests to Vibes' existing banner:
 *   - resolves the user's pill for the tool (read family → allow direct);
 *   - on "ask", sends `opencode-permission:request` (same payload as the
 *     OpenCode adapter, so the UI needs zero changes) and waits;
 *   - timeout/abort → deny (fail-closed).
 */
/** Exported for tests — see runtime_host.gate.test.ts. */
export function createVibesPermissionGate(): PermissionGate {
  return {
    async requestPermission(request, signal) {
      // Runtime tool id → settings pill key. Read-only tools never prompt
      // (they are already filtered upstream by requiresConsent, but this is
      // a second line of defense with the adapter's same posture).
      if (
        request.toolId === "read_file" ||
        request.toolId === "glob" ||
        request.toolId === "grep"
      ) {
        return "allow";
      }

      const ctx = getSessionUIContext(request.sessionId);
      if (!ctx?.sender) {
        // No window to ask → fail closed.
        logger.warn(
          `[RuntimeHost] No UI context for permission ${request.requestId} — denying`,
        );
        return "deny";
      }

      const settings = readSettings();
      const pillKey =
        request.toolId === "shell"
          ? "bash"
          : request.toolId === "write_file" || request.toolId === "edit_file"
            ? "edit"
            : "edit";
      const pill = settings.openCodePermissions2?.[pillKey];

      if (pill === "allow") return "allow";
      if (pill === "deny") return "deny";

      // "ask" (or unset) → send to the renderer and wait.
      safeSend(ctx.sender, "opencode-permission:request", {
        requestId: request.requestId,
        sessionId: request.sessionId,
        chatId: ctx.chatId,
        toolName: request.toolId,
        toolInput: JSON.stringify(request.args ?? {}),
      });
      logger.info(
        `[RuntimeHost] Permission ask sent to UI: ${request.toolId} [${request.requestId}]`,
      );

      const response = await waitForRuntimePermissionResponse(
        request.requestId,
        signal,
        RUNTIME_PERMISSION_TIMEOUT_MS,
      );
      return response === "reject" ? "deny" : "allow";
    },
  };
}

// ============================================================================
// Runtime singleton
// ============================================================================

let runtimeInstance: Runtime | null = null;

/**
 * Lazily builds the shared Runtime. Throws if settings can't produce a
 * storage dir (should never happen in a real app).
 */
export function getRuntime(): Runtime {
  if (runtimeInstance) return runtimeInstance;

  const storagePath = path.join(app.getPath("userData"), "runtime-sessions.db");

  runtimeInstance = createRuntimeBuilder("vibes-mcode")
    .workspaceRoot(path.dirname(app.getPath("userData"))) // sessions override per-app via workspaceRoot
    .sqliteStorage(storagePath)
    .model(delegatingModelProvider)
    .registerProtocol(OPENAI_COMPATIBLE_PROTOCOL, openAiCompatibleFactory())
    .tools(createBuiltInRegistry())
    .permissionGate(createVibesPermissionGate())
    .build();

  logger.info(`[RuntimeHost] Runtime ready (storage: ${storagePath})`);
  return runtimeInstance;
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
