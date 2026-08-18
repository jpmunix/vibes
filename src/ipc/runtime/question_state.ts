/**
 * Question state for the vibes-core runtime bridge.
 *
 * Mirror of permission_state.ts: a Map<requestId, entry> plus a
 * promise-based wait with timeout/abort. The runtime's QuestionHandler
 * calls `waitForRuntimeQuestionResponse()` after sending
 * `agent-tool:ask-user-request` to the renderer. The renderer answers via
 * the existing `agent-tool:ask-user-response` contract.
 */

import log from "electron-log";
import type { AskUserResponse } from "@vibes/shared";

const logger = log.scope("runtime_question_state");

/** 5 minutes — same timeout as permissions. */
export const RUNTIME_QUESTION_TIMEOUT_MS = 5 * 60 * 1000;

type PendingEntry = {
  resolve: (response: AskUserResponse) => void;
  reject: (error: Error) => void;
};

const pendingRuntimeQuestions = new Map<string, PendingEntry>();

/**
 * Resolves a pending runtime question when the renderer answers.
 * Returns true if a resolver was found, false otherwise.
 */
export function respondRuntimeQuestion(
  requestId: string,
  answers: Array<string | string[]>,
): boolean {
  const entry = pendingRuntimeQuestions.get(requestId);
  if (!entry) return false;

  logger.info(`[RuntimeQuestion] UI responded for ${requestId}`);
  pendingRuntimeQuestions.delete(requestId);
  entry.resolve({ requestId, answers });
  return true;
}

/**
 * Waits for the renderer's answer to a question request. Times out after
 * `timeoutMs` and rejects with QuestionCancelled (fail-closed). An aborted
 * signal also short-circuits to reject immediately.
 */
export function waitForRuntimeQuestionResponse(
  requestId: string,
  signal: AbortSignal,
  timeoutMs: number = RUNTIME_QUESTION_TIMEOUT_MS,
): Promise<AskUserResponse> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(questionCancelled());
      return;
    }

    const timer = setTimeout(() => {
      pendingRuntimeQuestions.delete(requestId);
      logger.warn(
        `[RuntimeQuestion] Timeout for ${requestId} — cancelling`,
      );
      reject(questionCancelled("Question timed out"));
    }, timeoutMs);

    const onAbort = () => {
      clearTimeout(timer);
      pendingRuntimeQuestions.delete(requestId);
      reject(questionCancelled());
    };
    signal.addEventListener("abort", onAbort, { once: true });

    pendingRuntimeQuestions.set(requestId, {
      resolve: (response) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        pendingRuntimeQuestions.delete(requestId);
        resolve(response);
      },
      reject: (error) => {
        clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        pendingRuntimeQuestions.delete(requestId);
        reject(error);
      },
    });
  });
}

/**
 * Cancels any pending question prompts (session cancelled / app quitting).
 */
export function rejectAllPendingRuntimeQuestions(): void {
  for (const [requestId, entry] of pendingRuntimeQuestions) {
    logger.info(`[RuntimeQuestion] Rejecting pending ${requestId}`);
    entry.reject(questionCancelled("Session cancelled"));
  }
  pendingRuntimeQuestions.clear();
}

/** Visible for tests. */
export function pendingRuntimeQuestionCount(): number {
  return pendingRuntimeQuestions.size;
}

function questionCancelled(message = "Question cancelled"): Error {
  const err = new Error(message);
  err.name = "QuestionCancelled";
  return err;
}
