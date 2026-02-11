/**
 * Shared utility for making fetch requests to the Dyad engine API.
 * Handles common headers including Authorization and X-Dyad-Request-Id.
 */

import { readSettings } from "@/main/settings";
import log from "electron-log";
import type { AgentContext } from "./types";
import {
  openRouterCompletion,
  type OpenRouterMessage,
} from "@/ipc/utils/openrouter";
import { getEffectivePrompt } from "@/prompts";

export const DYAD_ENGINE_URL =
  process.env.DYAD_ENGINE_URL ?? "https://engine.dyad.sh/v1";

export interface EngineFetchOptions extends Omit<RequestInit, "headers"> {
  /** Additional headers to include */
  headers?: Record<string, string>;
}

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
  const openRouterSettings = settings.providerSettings?.openrouter as any;

  // Check multi-key system first
  if (openRouterSettings?.selectedKeyId && openRouterSettings?.keys?.length > 0) {
    const selectedKey = openRouterSettings.keys.find((k: any) => k.id === openRouterSettings.selectedKeyId);
    if (selectedKey?.key?.value?.trim()) {
      return selectedKey.key.value.trim();
    }
  }

  // Fallback to legacy single-key
  const apiKey = openRouterSettings?.apiKey?.value?.trim();

  if (!apiKey) {
    throw new Error("OpenRouter API key is required to run turbo file edits.");
  }

  return apiKey;
}

function buildTurboEditMessages(
  body: TurboFileEditRequestBody,
  settings: ReturnType<typeof readSettings>,
): OpenRouterMessage[] {
  const instructions = body.instructions?.trim();
  const instructionsBlock = instructions
    ? `Instructions:\n${instructions}\n\n`
    : "";

  return [
    {
      role: "system",
      content: getEffectivePrompt("turbo_edit_system", settings),
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

  let data: any;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TURBO_EDIT_TIMEOUT_MS);
    try {
      data = await openRouterCompletion({
        model,
        title: "turbo-edit",
        temperature: 0,
        messages: buildTurboEditMessages(body, settings),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    logger.error("OpenRouter turbo edit request timed out or failed", error);
    throw new Error(
      `OpenRouter turbo file edit failed: ${error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  const rawContent = data?.choices?.[0]?.message?.content ?? "";
  if (!rawContent) {
    throw new Error("OpenRouter turbo file edit returned no content.");
  }

  logger.log(buildTurboEditMessages(body, settings));
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
