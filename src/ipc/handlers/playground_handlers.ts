import { createTypedHandler } from "./base";
import { miscContracts } from "../types/misc";
import { openRouterCompletion } from "../utils/openrouter";
import log from "electron-log";

const logger = log.scope("playground");

// Active AbortController for cancellation support
let activeController: AbortController | null = null;

export function registerPlaygroundHandlers() {
  createTypedHandler(miscContracts.playgroundCompletion, async (_, { model, prompt }) => {
    logger.info(`Playground completion request: model=${model}`);

    // Abort any previous in-flight request
    if (activeController) {
      activeController.abort();
    }

    const controller = new AbortController();
    activeController = controller;

    try {
      const data = await openRouterCompletion({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        title: "playground",
        signal: controller.signal,
      });

      const text =
        data?.choices?.[0]?.message?.content ||
        JSON.stringify(data, null, 2);

      return {
        text,
        inputTokens: data?.usage?.prompt_tokens,
        outputTokens: data?.usage?.completion_tokens,
      };
    } catch (error: any) {
      if (error.name === "AbortError" || controller.signal.aborted) {
        logger.info(`Playground request cancelled: model=${model}`);
        throw new Error("Cancelado");
      }
      logger.error("Playground completion failed:", error);
      return {
        text: `Error: ${error.message || String(error)}`,
      };
    } finally {
      if (activeController === controller) {
        activeController = null;
      }
    }
  });

  createTypedHandler(miscContracts.playgroundCancel, async () => {
    if (activeController) {
      logger.info("Playground cancel requested");
      activeController.abort();
      activeController = null;
      return { cancelled: true };
    }
    return { cancelled: false };
  });

  logger.info("Registered playground handlers");
}
