/**
 * Question handler for the vibes-core runtime bridge.
 *
 * Handles the `agent-tool:ask-user-response` IPC channel — the renderer's
 * answer to a question prompt. Routes runtime requestIds to question_state.
 */

import log from "electron-log";
import { createTypedHandler } from "../handlers/base";
import { agentContracts } from "../types/agent";
import { respondRuntimeQuestion } from "./question_state";

const logger = log.scope("runtime_question");

export function registerRuntimeQuestionHandler() {
  createTypedHandler(
    agentContracts.respondToAskUser,
    async (_event, params) => {
      const { requestId } = params;

      // Determine answers: prefer runtime format (answers[]), fall back to
      // legacy format (response + questionIndex).
      let answers: Array<string | string[]>;
      if (params.answers) {
        answers = params.answers;
      } else if (params.response !== undefined) {
        // Legacy: wrap single response into an array aligned with questionIndex
        answers = Array.isArray(params.response)
          ? [params.response]
          : [params.response];
      } else {
        answers = [];
      }

      logger.info(
        `[Question] Received UI response for ${requestId}: ${JSON.stringify(answers)}`,
      );

      const resolved = respondRuntimeQuestion(requestId, answers);
      if (!resolved) {
        logger.warn(
          `[Question] No pending resolver for ${requestId} — already timed out?`,
        );
      }
    },
  );
}
