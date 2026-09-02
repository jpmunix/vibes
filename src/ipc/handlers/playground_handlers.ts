import { createTypedHandler } from "./base";
import { miscContracts } from "../types/misc";
import { modelCompletion, modelStreamCompletion } from "../utils/model_completion";
import { readSettings } from "../../main/settings";
import { safeSend } from "../utils/safe_sender";
import log from "electron-log";
import { PLAYGROUND_EVALUATOR_SYSTEM_PROMPT } from "../../prompts/playground_evaluator";
import { parseModelReference } from "../utils/model_reference";

const logger = log.scope("playground");

// Active AbortController for cancellation support
let activeController: AbortController | null = null;

interface PlaygroundMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

async function runPlaygroundCompletion(
  model: string,
  messages: PlaygroundMessage[],
  opts: {
    temperature: number;
    signal?: AbortSignal;
    responseFormat?: { type: "json_object" | "text" };
  },
) {
  const reference = parseModelReference(model);
  if (!reference) throw new Error("Referencia de modelo inválida");
  const settings = readSettings();

  return modelCompletion(reference, settings, {
    messages,
    temperature: opts.temperature,
    ...(opts.signal ? { abortSignal: opts.signal } : {}),
    ...(opts.responseFormat?.type === "json_object" ? { output: "json" as const } : {}),
  });
}

export function registerPlaygroundHandlers() {
  createTypedHandler(
    miscContracts.playgroundCompletion,
    async (_, { model, prompt }) => {
      logger.info(`Playground completion request: model=${model}`);

      // Abort any previous in-flight request
      if (activeController) {
        activeController.abort();
      }

      const controller = new AbortController();
      activeController = controller;

      try {
        const result = await runPlaygroundCompletion(
          model,
          [{ role: "user", content: prompt }],
          {
            temperature: 0.7,
            signal: controller.signal,
          },
        );

        const text = result.text || JSON.stringify(result.output, null, 2);

        return {
          text,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
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
    },
  );

  createTypedHandler(miscContracts.playgroundCancel, async () => {
    if (activeController) {
      logger.info("Playground cancel requested");
      activeController.abort();
      activeController = null;
      return { cancelled: true };
    }
    return { cancelled: false };
  });

  // ── Playground Analysis ──────────────────────────────────────────────
  createTypedHandler(
    miscContracts.playgroundAnalyze,
    async (_, { model, originalPrompt, results }) => {
      logger.info(
        `Playground analysis request: model=${model}, results=${results.length}`,
      );

      // Filter out errored/timed-out results
      const valid = results.filter(
        (r) => !r.error && !r.timeout && r.text?.trim(),
      );
      if (valid.length === 0) {
        return {
          text: JSON.stringify({
            error: "No hay resultados válidos para analizar.",
          }),
        };
      }

      // Build context block for the analyst
      const resultsBlock = valid
        .map((r, i) => {
          return `### Modelo ${i + 1}: ${r.modelDisplayName} (${r.modelApiName})
- Latencia: ${r.durationMs}ms
- Tokens entrada: ${r.inputTokens ?? "N/A"}
- Tokens salida: ${r.outputTokens ?? "N/A"}

Respuesta:
${r.text}`;
        })
        .join("\n\n---\n\n");

      const systemPrompt = PLAYGROUND_EVALUATOR_SYSTEM_PROMPT;

      const userMessage = `Prompt original del usuario:
"${originalPrompt}"

Resultados de los modelos:

${resultsBlock}`;

      try {
        const result = await runPlaygroundCompletion(
          model,
          [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          {
            temperature: 0.3,
            responseFormat: { type: "json_object" },
          },
        );

        const text = result.text || JSON.stringify(result.output ?? {});
        return { text };
      } catch (error: any) {
        logger.error("Playground analysis failed:", error);
        return {
          text: JSON.stringify({ error: error.message || String(error) }),
        };
      }
    },
  );

  // ── Playground Streaming ───────────────────────────────────────────────
  createTypedHandler(
    miscContracts.playgroundStream,
    async (event, { model, prompt, timeoutMs }) => {
      logger.info(`Playground stream request: model=${model}`);

      // Abort any previous in-flight request
      if (activeController) {
        activeController.abort();
      }

      const controller = new AbortController();
      activeController = controller;

      const timeout = timeoutMs ?? 120_000;
      const timer = setTimeout(() => controller.abort(), timeout);

      let fullText = "";
      let timedOut = false;

      const send = (channel: string, payload: unknown) => {
        safeSend(event.sender, channel, payload);
      };

      try {
        const reference = parseModelReference(model);
        if (!reference) throw new Error("Referencia de modelo inválida");
        const settings = readSettings();
        const streamResult = await modelStreamCompletion(reference, settings, {
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
          abortSignal: controller.signal,
        });

        for await (const part of streamResult.fullStream) {
          if (controller.signal.aborted) {
            timedOut = true;
            break;
          }
          if (part.type === "text-delta") {
            fullText += part.text;
            send("playground:stream:chunk", { model, delta: part.text });
          } else if (part.type === "reasoning-delta") {
            if (part.text === "[REDACTED]") continue;
            send("playground:stream:reasoning", {
              model,
              delta: part.text,
            });
          }
        }

        const usage = await streamResult.usage;
        send("playground:stream:end", {
          model,
          text: fullText,
          inputTokens: usage?.inputTokens,
          outputTokens: usage?.outputTokens,
          timeout: timedOut,
        });
      } catch (error: any) {
        if (error.name === "AbortError" || controller.signal.aborted) {
          send("playground:stream:end", {
            model,
            text: fullText,
            timeout: true,
          });
        } else {
          logger.error("Playground stream failed:", error);
          send("playground:stream:error", {
            model,
            error: error?.message || String(error),
          });
        }
      } finally {
        clearTimeout(timer);
        if (activeController === controller) {
          activeController = null;
        }
      }

      return { text: fullText };
    },
  );

  logger.info("Registered playground handlers");
}
