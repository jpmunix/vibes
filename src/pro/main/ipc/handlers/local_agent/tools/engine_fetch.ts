/**
 * Shared utility for making fetch requests to the Dyad engine API.
 * Handles common headers including Authorization and X-Dyad-Request-Id.
 */

import { readSettings } from "@/main/settings";
import log from "electron-log";
import type { AgentContext } from "./types";

export const DYAD_ENGINE_URL =
  process.env.DYAD_ENGINE_URL ?? "https://engine.dyad.sh/v1";

export interface EngineFetchOptions extends Omit<RequestInit, "headers"> {
  /** Additional headers to include */
  headers?: Record<string, string>;
}

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const logger = log.scope("engine_fetch");
const TURBO_EDIT_TIMEOUT_MS = 20_000;

interface TurboFileEditRequestBody {
  path: string;
  content: string;
  originalContent: string;
  instructions?: string;
}

function parseTurboFileEditBody(body: EngineFetchOptions["body"]) {
  if (!body) {
    throw new Error("Turbo file edit requires a request body.");
  }

  if (typeof body === "string") {
    return JSON.parse(body) as TurboFileEditRequestBody;
  }

  if (body instanceof Uint8Array) {
    const decoded = new TextDecoder().decode(body);
    return JSON.parse(decoded) as TurboFileEditRequestBody;
  }

  throw new Error("Unsupported turbo file edit request body format.");
}

function getOpenRouterApiKey(settings: ReturnType<typeof readSettings>) {
  const apiKey = settings.providerSettings?.openrouter?.apiKey?.value?.trim();

  if (!apiKey) {
    throw new Error("OpenRouter API key is required to run turbo file edits.");
  }

  return apiKey;
}

function buildTurboEditMessages(body: TurboFileEditRequestBody) {
  const instructions = body.instructions?.trim();
  const instructionsBlock = instructions
    ? `Instructions:\n${instructions}\n\n`
    : "";

  return [
    {
      role: "system",
      content: [
        "You are a precise code-editing assistant.",
        "Apply the requested edit to the original file content.",
        "Return the full updated file content only.",
        "Preserve unchanged content exactly.",
        'The edit snippet may contain "// ... existing code ..." markers that represent unchanged sections.',
        "Do not include explanations or code fences.",
      ].join(" "),
    },
    {
      role: "user",
      content: [
        `File path: ${body.path}`,
        instructionsBlock,
        "<original>",
        body.originalContent,
        "</original>",
        "",
        "<edit>",
        body.content,
        "</edit>",
      ]
        .filter((line) => line !== "")
        .join("\n"),
    },
  ];
}

function sanitizeTurboEditResponse(content: string) {
  const trimmed = content.trim();
  if (trimmed.startsWith("```")) {
    const withoutFirstFence = trimmed.replace(/^```[a-zA-Z0-9-]*\n?/, "");
    return withoutFirstFence.replace(/\n?```$/, "");
  }
  return content;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = TURBO_EDIT_TIMEOUT_MS,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function callTurboFileEditViaOpenRouter(
  ctx: Pick<AgentContext, "dyadRequestId">,
  options: EngineFetchOptions,
): Promise<Response> {
  const settings = readSettings();
  const apiKey = getOpenRouterApiKey(settings);
  const model = settings.turboEditModel || "openai/gpt-4.1-mini";
  const body = parseTurboFileEditBody(options.body);

  const baseRequest = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: buildTurboEditMessages(body),
    }),
  } satisfies RequestInit;

  let response: Response | null = null;
  try {
    response = await fetchWithTimeout(
      `${OPENROUTER_BASE_URL}/chat/completions`,
      baseRequest,
    );
  } catch (error) {
    logger.error("OpenRouter turbo edit request timed out or failed", error);
    throw new Error(
      `OpenRouter turbo file edit failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `OpenRouter turbo file edit failed: ${response.status} ${response.statusText} - ${errorText}`,
    );
  }

  const data = await response.json();
  const rawContent = data?.choices?.[0]?.message?.content ?? "";
  if (!rawContent) {
    throw new Error("OpenRouter turbo file edit returned no content.");
  }

  logger.log(buildTurboEditMessages(body));
  logger.warn(data.choices[0].message.content);
  const result = sanitizeTurboEditResponse(rawContent);
  logger.info(result);

  return new Response(JSON.stringify({ result }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Fetch wrapper for Dyad engine API calls.
 * Automatically adds Authorization and X-Dyad-Request-Id headers.
 *
 * @param ctx - The agent context containing the request ID
 * @param endpoint - The API endpoint path (e.g., "/tools/web-search")
 * @param options - Fetch options (method, body, additional headers, etc.)
 * @returns The fetch Response
 * @throws Error if Dyad Pro API key is not configured
 */
export async function engineFetch(
  ctx: Pick<AgentContext, "dyadRequestId">,
  endpoint: string,
  options: EngineFetchOptions = {},
): Promise<Response> {
  if (endpoint === "/tools/turbo-file-edit") {
    // Turbo Edit uses OpenRouter only; failures should bubble so callers can fallback to full rewrite
    return callTurboFileEditViaOpenRouter(ctx, options);
  }

  const settings = readSettings();
  const apiKey = settings.providerSettings?.auto?.apiKey?.value;

  // if (!apiKey) {
  //   throw new Error("Dyad Pro API key is required");
  // }

  const { headers: extraHeaders, ...restOptions } = options;

  return fetch(`${DYAD_ENGINE_URL}${endpoint}`, {
    ...restOptions,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "X-Dyad-Request-Id": ctx.dyadRequestId,
      ...extraHeaders,
    },
  });
}
