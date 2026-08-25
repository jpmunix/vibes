import { createTypedHandler } from "./base";
import { miscContracts } from "../types/misc";
import {
  openRouterCompletion,
  openRouterStreamCompletion,
} from "../utils/openrouter";
import { getModelClient } from "../utils/get_model_client";
import { generateText, streamText } from "ai";
import { readSettings } from "../../main/settings";
import { safeSend } from "../utils/safe_sender";
import log from "electron-log";
import { PLAYGROUND_EVALUATOR_SYSTEM_PROMPT } from "../../prompts/playground_evaluator";

const logger = log.scope("playground");

// Active AbortController for cancellation support
let activeController: AbortController | null = null;

// ── Multi-provider routing ────────────────────────────────────────────────
// Playground model ids are plain "vendor/name" for OpenRouter and prefixed as
// "custom::<providerId>::<modelName>" for custom providers, so we can route
// each model to its correct endpoint.

function resolveModelProvider(model: string): {
  name: string;
  provider: string;
} {
  if (model.startsWith("custom::")) {
    // useMultiProviderModels builds "custom::<providerId>::<modelName>" where
    // providerId is itself "custom::<slug>", so ids look like
    // "custom::custom::minube::deepseek/..." — the provider is everything up
    // to the LAST "::".
    const rest = model.slice("custom::".length);
    const lastSep = rest.lastIndexOf("::");
    if (lastSep > 0) {
      return {
        provider: rest.slice(0, lastSep),
        name: rest.slice(lastSep + 2),
      };
    }
  }
  // Local providers: ollama::<model> / lmstudio::<model>
  const sep = model.indexOf("::");
  if (sep > 0) {
    const provider = model.slice(0, sep);
    if (provider === "ollama" || provider === "lmstudio") {
      return { provider, name: model.slice(sep + 2) };
    }
  }
  return { name: model, provider: "openrouter" };
}

interface PlaygroundMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface PlaygroundCompletionData {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

async function runPlaygroundCompletion(
  model: string,
  messages: PlaygroundMessage[],
  opts: {
    temperature: number;
    title?: string;
    signal?: AbortSignal;
    responseFormat?: { type: "json_object" | "text" };
  },
): Promise<PlaygroundCompletionData> {
  const { provider, name } = resolveModelProvider(model);

  if (provider === "openrouter") {
    return openRouterCompletion({
      model: name,
      messages,
      temperature: opts.temperature,
      title: opts.title ?? "playground",
      signal: opts.signal,
      ...(opts.responseFormat
        ? { response_format: opts.responseFormat }
        : {}),
    });
  }

  // Custom providers (OpenAI-compatible endpoints).
  const settings = readSettings();
  const { modelClient } = await getModelClient({ name, provider }, settings);
  const result = await generateText({
    model: modelClient.model,
    messages,
    temperature: opts.temperature,
    ...(opts.signal ? { abortSignal: opts.signal } : {}),
  });

  return {
    choices: [{ message: { content: result.text } }],
    usage: {
      prompt_tokens: result.usage.inputTokens,
      completion_tokens: result.usage.outputTokens,
    },
  };
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
        const data = await runPlaygroundCompletion(
          model,
          [{ role: "user", content: prompt }],
          {
            temperature: 0.7,
            title: "playground",
            signal: controller.signal,
          },
        );

        const text =
          data?.choices?.[0]?.message?.content || JSON.stringify(data, null, 2);

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
        const data = await runPlaygroundCompletion(
          model,
          [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage },
          ],
          {
            temperature: 0.3,
            title: "playground-analysis",
            responseFormat: { type: "json_object" },
          },
        );

        const text = data?.choices?.[0]?.message?.content || "{}";
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
        const { provider, name } = resolveModelProvider(model);

        if (provider === "openrouter") {
          const gen = openRouterStreamCompletion({
            model: name,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.7,
            title: "playground",
            signal: controller.signal,
          });
          for await (const delta of gen) {
            if (controller.signal.aborted) {
              timedOut = true;
              break;
            }
            fullText += delta;
            send("playground:stream:chunk", { model, delta });
          }
          send("playground:stream:end", {
            model,
            text: fullText,
            timeout: timedOut,
          });
        } else {
          const settings = readSettings();
          const { modelClient } = await getModelClient(
            { name, provider },
            settings,
          );
          const streamResult = streamText({
            model: modelClient.model,
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
        }
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
