import { readSettings, decrypt } from "../../main/settings";
import log from "electron-log";
import { DEFAULT_STANDARD_MODEL } from "../../lib/schemas";

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

  let apiKeySecret = openRouterSettings?.apiKey;

  if (openRouterSettings?.selectedKeyId && openRouterSettings?.keys?.length > 0) {
    const selectedKey = openRouterSettings.keys.find((k: any) => k.id === openRouterSettings.selectedKeyId);
    if (selectedKey) {
      apiKeySecret = selectedKey.key;
    }
  }

  let apiKey: string | undefined;
  if (apiKeySecret?.value) {
    try {
      apiKey = apiKeySecret.encryptionType === "plaintext"
        ? apiKeySecret.value
        : decrypt(apiKeySecret);
    } catch (e) {
      logger.error("Failed to decrypt OpenRouter API key:", e);
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
    model, // optional, will default to settings.executorModel or a fallback
    messages,
    temperature = 0.3,
    max_tokens,
    referer,
    title,
    signal,
  } = options;

  const defaultModel =
    settings.executorModel || DEFAULT_STANDARD_MODEL;
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


  return data;
}

/**
 * Streaming chat completion via OpenRouter (SSE) using Node.js https module.
 * More reliable than fetch body streaming in Electron's main process.
 * Returns an async generator that yields text deltas as they arrive.
 */
export async function* openRouterStreamCompletion(
  options: OpenRouterCompletionOptions,
): AsyncGenerator<string> {
  const { default: https } = await import("node:https");

  const settings = readSettings();
  const openRouterSettings = settings.providerSettings?.openrouter as any;

  let apiKeySecret = openRouterSettings?.apiKey;
  if (openRouterSettings?.selectedKeyId && openRouterSettings?.keys?.length > 0) {
    const selected = openRouterSettings.keys.find(
      (k: any) => k.id === openRouterSettings.selectedKeyId,
    );
    if (selected) apiKeySecret = selected.key;
  }

  let apiKey: string | undefined;
  if (apiKeySecret?.value) {
    try {
      apiKey = apiKeySecret.encryptionType === "plaintext"
        ? apiKeySecret.value
        : decrypt(apiKeySecret);
    } catch (e) {
      logger.error("Failed to decrypt OpenRouter API key (stream):", e);
    }
  }
  apiKey = apiKey?.trim();
  if (!apiKey) throw new Error("OpenRouter API key not found.");

  const defaultModel = settings.executorModel || DEFAULT_STANDARD_MODEL;
  const finalModel = options.model || defaultModel;

  const body = JSON.stringify({
    model: finalModel,
    messages: options.messages,
    temperature: options.temperature ?? 0.7,
    ...(options.max_tokens !== undefined && { max_tokens: options.max_tokens }),
    stream: true,
  });

  // Bridge Node.js stream → async generator via a tiny queue+resolver
  const queue: string[] = [];
  let resolveNext: (() => void) | null = null;
  let streamDone = false;
  let streamError: Error | null = null;
  let sseBuffer = "";

  function pushToken(token: string) {
    queue.push(token);
    resolveNext?.();
    resolveNext = null;
  }

  function markDone(err?: Error) {
    if (err) streamError = err;
    streamDone = true;
    resolveNext?.();
    resolveNext = null;
  }

  const req = https.request(
    {
      hostname: "openrouter.ai",
      path: "/api/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...(options.title && { "X-Title": options.title }),
        "Content-Length": Buffer.byteLength(body),
      },
    },
    (res) => {
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => {
        sseBuffer += chunk;
        const lines = sseBuffer.split("\n");
        sseBuffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(":")) continue; // empty or SSE comment
          if (!trimmed.startsWith("data:")) continue;
          const data = trimmed.slice(5).trim();
          if (data === "[DONE]") { markDone(); return; }
          try {
            const parsed = JSON.parse(data);
            const delta: string | undefined = parsed.choices?.[0]?.delta?.content;
            if (delta) pushToken(delta);
          } catch { /* skip malformed */ }
        }
      });
      res.on("end", () => markDone());
      res.on("error", (err) => { logger.error(`[OpenRouterStream] Response error: ${err.message}`); markDone(err); });
    },
  );

  req.on("error", (err) => { logger.error(`[OpenRouterStream] Request error: ${err.message}`); markDone(err); });
  req.write(body);
  req.end();

  // Drain queue as tokens arrive
  while (!streamDone || queue.length > 0) {
    if (queue.length > 0) {
      yield queue.shift()!;
    } else if (!streamDone) {
      await new Promise<void>((resolve) => { resolveNext = resolve; });
    }
  }

  if (streamError) throw streamError;
}
