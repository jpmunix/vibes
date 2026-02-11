import { readSettings } from "../../main/settings";
import log from "electron-log";

const logger = log.scope("openrouter_client");

/**
 * Check if an OpenRouter API key is available (supports both legacy single-key and multi-key system).
 */
export function hasOpenRouterApiKey(): boolean {
  const settings = readSettings();
  const openRouterSettings = settings.providerSettings?.openrouter as any;

  // Check multi-key system first
  if (openRouterSettings?.selectedKeyId && openRouterSettings?.keys?.length > 0) {
    const selectedKey = openRouterSettings.keys.find((k: any) => k.id === openRouterSettings.selectedKeyId);
    if (selectedKey?.key?.value?.trim()) {
      return true;
    }
  }

  // Fallback to legacy single-key
  if (openRouterSettings?.apiKey?.value?.trim()) {
    return true;
  }

  return false;
}

export interface OpenRouterMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface OpenRouterCompletionOptions {
  model?: string;
  messages: OpenRouterMessage[];
  temperature?: number;
  max_tokens?: number;
  referer?: string;
  title?: string;
  signal?: AbortSignal;
  response_format?: { type: "json_object" | "text" };
}

/**
 * Common utility for making generic requests to OpenRouter.
 */
export async function openRouterRequest(
  endpoint: string,
  options: RequestInit = {},
) {
  const settings = readSettings();
  const openRouterSettings = settings.providerSettings?.openrouter as any;

  let apiKey = openRouterSettings?.apiKey?.value;

  if (openRouterSettings?.selectedKeyId && openRouterSettings?.keys?.length > 0) {
    const selectedKey = openRouterSettings.keys.find((k: any) => k.id === openRouterSettings.selectedKeyId);
    if (selectedKey) {
      apiKey = selectedKey.key.value;
    }
  }

  apiKey = apiKey?.trim();

  if (!apiKey) {
    throw new Error(
      "OpenRouter API key not found. Please configure it in settings.",
    );
  }

  const { headers: extraHeaders, ...rest } = options;

  const response = await fetch(`https://openrouter.ai/api/v1${endpoint}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...extraHeaders,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error(
      `OpenRouter request to ${endpoint} failed: ${response.status} ${response.statusText}`,
      errorText,
    );
    throw new Error(
      `OpenRouter failed: ${response.status} ${response.statusText} - ${errorText}`,
    );
  }

  return response;
}

/**
 * Common utility for making chat completion requests to OpenRouter.
 * Automatically handles API key from settings and provides common headers.
 */
export async function openRouterCompletion(
  options: OpenRouterCompletionOptions,
) {
  const settings = readSettings();

  const {
    model, // optional, will default to settings.appTitleGenerationModel or a fallback
    messages,
    temperature = 0.3,
    max_tokens,
    referer,
    title,
    signal,
  } = options;

  const defaultModel =
    settings.appTitleGenerationModel || "google/gemini-2.5-flash-lite";
  const finalModel = model || defaultModel;

  const body: any = {
    model: finalModel,
    messages,
    temperature,
  };

  if (options.response_format) {
    body.response_format = options.response_format;
  }

  if (max_tokens !== undefined) {
    body.max_tokens = max_tokens;
  }

  const headers: Record<string, string> = {};
  if (referer) headers["HTTP-Referer"] = referer;
  if (title) headers["X-Title"] = title;

  const response = await openRouterRequest("/chat/completions", {
    method: "POST",
    body: JSON.stringify(body),
    headers,
    signal,
  });

  const data = await response.json();

  // Log the query
  try {
    const { logAiQuery } = await import("./ai_query_logger");
    void logAiQuery({
      queryType: options.title || "generic-completion",
      model: finalModel,
      promptSnippet: messages[messages.length - 1]?.content?.slice(0, 100) || "",
      payload: body,
      response: data,
      inputTokens: data?.usage?.prompt_tokens,
      outputTokens: data?.usage?.completion_tokens,
    });
  } catch (err) {
    logger.error("Failed to initiate AI query logging", err);
  }

  return data;
}
