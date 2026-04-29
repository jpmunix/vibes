import { createTypedHandler } from "./base";
import { miscContracts } from "../types/misc";
import { openRouterCompletion } from "../utils/openrouter";
import log from "electron-log";

const logger = log.scope("playground");

export function registerPlaygroundHandlers() {
  createTypedHandler(miscContracts.playgroundCompletion, async (_, { model, prompt }) => {
    logger.info(`Playground completion request: model=${model}`);

    try {
      const data = await openRouterCompletion({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        title: "playground",
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
      logger.error("Playground completion failed:", error);
      return {
        text: `Error: ${error.message || String(error)}`,
      };
    }
  });

  logger.info("Registered playground handlers");
}
