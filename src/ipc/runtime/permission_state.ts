/**
 * B3: Shared pending-permission state for the vibes-core runtime.
 *
 * Extracted pattern from opencode_adapter.ts's `pendingPermissionResolvers`:
 * a Map<requestId, resolver> plus a promise-based wait with timeout.
 *
 * The runtime's PermissionGate calls `waitForRuntimePermissionResponse()`
 * after sending `opencode-permission:request` to the renderer (same channel
 * and payload as today — the UI does not change). The renderer answers via
 * the existing `opencode-permission:respond` contract, and the modified
 * `registerPermissionHandler` routes runtime requestIds here.
 *
 * MVP scope (per phase1-tasks.md): global pills only. The granular
 * `bashCustomRules` remain OpenCode-specific until post-MVP.
 */

import log from "electron-log";
import type { WebContents } from "electron";

const logger = log.scope("runtime_permission_state");

/** 5 minutes — parity with the OpenCode adapter's pending-permission timeout. */
export const RUNTIME_PERMISSION_TIMEOUT_MS = 5 * 60 * 1000;

/** Renderer answers with the same vocabulary as the OpenCode banner. */
export type RuntimePermissionResponse = "once" | "always" | "reject";

const pendingRuntimePermissionResolvers = new Map<
  string,
  (response: RuntimePermissionResponse) => void
>();

// Slice 3.6: track the toolId per requestId so the permission handler can
// persist "always" decisions to the corresponding pill in settings.
const pendingRuntimePermissionToolIds = new Map<string, string>();

/** Get the toolId associated with a pending requestId, or undefined. */
export function getPendingRuntimePermissionToolId(
  requestId: string,
): string | undefined {
  return pendingRuntimePermissionToolIds.get(requestId);
}

/** Clear the toolId for a requestId (after the request resolves). */
function clearPendingRuntimePermissionToolId(requestId: string): void {
  pendingRuntimePermissionToolIds.delete(requestId);
}

/**
 * Resolves a pending runtime permission request when the renderer answers.
 * Returns true if a resolver was found (i.e. the requestId belongs to the
 * runtime bridge), false otherwise — callers use this to route between
 * OpenCode and runtime requestIds in a single IPC handler.
 */
export function respondRuntimePermission(
  requestId: string,
  response: string,
): boolean {
  const resolver = pendingRuntimePermissionResolvers.get(requestId);
  if (!resolver) return false;

  // Defensive: only accept the known vocabulary; anything else → reject
  // (fail-closed, same posture as the runtime gate).
  const normalized: RuntimePermissionResponse =
    response === "once" || response === "always" ? response : "reject";

  logger.info(
    `[RuntimePermission] UI responded ${normalized} for ${requestId}`,
  );
  resolver(normalized);
  return true;
}

/**
 * Waits for the renderer's answer to a permission request. Times out after
 * `timeoutMs` and resolves to "reject" (fail-closed). An aborted signal also
 * short-circuits to reject immediately.
 *
 * The `toolId` is recorded alongside the requestId so the IPC handler can
 * later look it up when persisting "always" decisions to settings.
 */
export function waitForRuntimePermissionResponse(
  requestId: string,
  toolId: string,
  signal: AbortSignal,
  timeoutMs: number = RUNTIME_PERMISSION_TIMEOUT_MS,
): Promise<RuntimePermissionResponse> {
  pendingRuntimePermissionToolIds.set(requestId, toolId);
  return new Promise((resolve) => {
    if (signal.aborted) {
      clearPendingRuntimePermissionToolId(requestId);
      resolve("reject");
      return;
    }
    const timer = setTimeout(() => {
      pendingRuntimePermissionResolvers.delete(requestId);
      clearPendingRuntimePermissionToolId(requestId);
      logger.warn(
        `[RuntimePermission] Timeout for ${requestId} — auto-rejecting`,
      );
      resolve("reject");
    }, timeoutMs);

    const onAbort = () => {
      clearTimeout(timer);
      pendingRuntimePermissionResolvers.delete(requestId);
      clearPendingRuntimePermissionToolId(requestId);
      resolve("reject");
    };
    signal.addEventListener("abort", onAbort, { once: true });

    pendingRuntimePermissionResolvers.set(requestId, (response) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      pendingRuntimePermissionResolvers.delete(requestId);
      clearPendingRuntimePermissionToolId(requestId);
      resolve(response);
    });
  });
}

/**
 * Cancels any pending permission prompts (session cancelled / app quitting).
 * Each pending request is resolved as reject so the gate fails closed and
 * the blocked tool call finishes cleanly.
 */
export function rejectAllPendingRuntimePermissions(): void {
  for (const [requestId, resolver] of pendingRuntimePermissionResolvers) {
    logger.info(`[RuntimePermission] Rejecting pending ${requestId}`);
    resolver("reject");
  }
  pendingRuntimePermissionResolvers.clear();
}

/** Visible for tests. */
export function pendingRuntimePermissionCount(): number {
  return pendingRuntimePermissionResolvers.size;
}

// ============================================================================
// Session → UI context
// ============================================================================
// The runtime's PermissionGate only receives (sessionId, toolCallId, toolId,
// args). To emit `opencode-permission:request` to the correct window we need
// the chatId + WebContents for the session that owns the request. The stream
// handler registers this context before running a session and clears it after.

export type SessionUIContext = {
  chatId: number;
  sender: WebContents | null;
};

const sessionUIContext = new Map<string, SessionUIContext>();

export function setSessionUIContext(
  sessionId: string,
  ctx: SessionUIContext,
): void {
  sessionUIContext.set(sessionId, ctx);
}

export function getSessionUIContext(
  sessionId: string,
): SessionUIContext | undefined {
  return sessionUIContext.get(sessionId);
}

export function clearSessionUIContext(sessionId: string): void {
  sessionUIContext.delete(sessionId);
}
