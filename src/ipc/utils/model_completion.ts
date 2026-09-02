import { generateText, Output, streamText, type ModelMessage } from "ai";
import type { UserSettings } from "../../lib/schemas";
import { getModelClient } from "./get_model_client";
import type { ModelReference } from "./model_reference";

export interface ModelCompletionOptions {
  messages: ModelMessage[];
  temperature?: number;
  maxOutputTokens?: number;
  abortSignal?: AbortSignal;
  output?: "json";
}

export interface ModelCompletionResult {
  text: string;
  output?: unknown;
  usage: {
    inputTokens?: number;
    outputTokens?: number;
  };
}

/**
 * Completion auxiliar provider-agnóstica.
 *
 * Recibe una referencia ya parseada: esta capa no conoce ni acepta strings de
 * settings (`custom::...`). `getModelClient` decide el transporte real y al
 * cliente solo se entrega `reference.model` como nombre de modelo.
 */
export async function modelCompletion(
  reference: ModelReference,
  settings: UserSettings,
  options: ModelCompletionOptions,
): Promise<ModelCompletionResult> {
  const { modelClient } = await getModelClient(
    { provider: reference.provider, name: reference.model },
    settings,
    { enableProviderTools: false },
  );
  const result = await generateText({
    model: modelClient.model,
    messages: options.messages,
    ...(options.temperature !== undefined
      ? { temperature: options.temperature }
      : {}),
    ...(options.maxOutputTokens !== undefined
      ? { maxOutputTokens: options.maxOutputTokens }
      : {}),
    ...(options.abortSignal ? { abortSignal: options.abortSignal } : {}),
    ...(options.output === "json" ? { output: Output.json() } : {}),
  });

  return {
    text: result.text,
    ...(options.output === "json" ? { output: result.output } : {}),
    usage: {
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    },
  };
}

/** Variante streaming con la misma frontera provider/model. */
export async function modelStreamCompletion(
  reference: ModelReference,
  settings: UserSettings,
  options: ModelCompletionOptions,
) {
  const { modelClient } = await getModelClient(
    { provider: reference.provider, name: reference.model },
    settings,
    { enableProviderTools: false },
  );
  return streamText({
    model: modelClient.model,
    messages: options.messages,
    ...(options.temperature !== undefined
      ? { temperature: options.temperature }
      : {}),
    ...(options.maxOutputTokens !== undefined
      ? { maxOutputTokens: options.maxOutputTokens }
      : {}),
    ...(options.abortSignal ? { abortSignal: options.abortSignal } : {}),
  });
}
