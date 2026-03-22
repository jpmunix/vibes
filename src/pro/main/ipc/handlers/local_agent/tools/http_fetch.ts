/**
 * http_fetch tool — Make HTTP requests and inspect responses.
 *
 * Allows the agent to fetch any URL and inspect the response status,
 * headers, and body. Useful for verifying APIs, checking URLs,
 * testing endpoints, reading documentation, etc.
 */

import { z } from "zod";
import log from "electron-log";
import {
  ToolDefinition,
  AgentContext,
  escapeXmlAttr,
  escapeXmlContent,
} from "./types";

const logger = log.scope("http_fetch");

// ============================================================================
// Schema
// ============================================================================

const httpFetchSchema = z.object({
  url: z
    .string()
    .describe("The URL to fetch (e.g. 'https://api.example.com/health')."),
  method: z
    .enum(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
    .default("GET")
    .describe("HTTP method (default: GET)."),
  headers: z
    .record(z.string(), z.string())
    .optional()
    .describe("Optional headers to send with the request (e.g. { \"Authorization\": \"Bearer ...\" })."),
  body: z
    .string()
    .optional()
    .describe("Optional request body (for POST/PUT/PATCH). Send as string."),
  timeout_ms: z
    .number()
    .int()
    .positive()
    .default(15_000)
    .describe("Request timeout in milliseconds (default: 15s)."),
  max_response_bytes: z
    .number()
    .int()
    .positive()
    .default(50_000)
    .describe("Maximum response body size to return in characters (default: 50000). Larger responses will be truncated."),
});

type HttpFetchArgs = z.infer<typeof httpFetchSchema>;

// ============================================================================
// Tool Definition
// ============================================================================

const MAX_BODY_DEFAULT = 50_000;

export const httpFetchTool: ToolDefinition<HttpFetchArgs> = {
  name: "http_fetch",
  description: `Make an HTTP request and return the response.

Returns the status code, relevant headers, and response body (truncated if too large).

Use this to:
- Verify that a URL is accessible and returns the expected content
- Check API endpoints and their responses
- Read content from web pages or documentation
- Debug HTTP-related issues
- Inspect response headers (CORS, content-type, etc.)

EXAMPLES:
- { "url": "https://example.com" } — Simple GET request
- { "url": "http://localhost:3000/api/health" } — Check a local API
- { "url": "https://api.example.com/data", "method": "POST", "headers": { "Content-Type": "application/json" }, "body": "{\\"key\\": \\"value\\"}" }
- { "url": "https://example.com", "method": "HEAD" } — Check headers only`,
  inputSchema: httpFetchSchema,
  defaultConsent: "ask",

  getConsentPreview: (args) =>
    `${args.method || "GET"} ${args.url}`,

  buildXml: (args, isComplete) => {
    if (!args.url) return undefined;
    if (isComplete) return undefined;
    return `<vibes-http-fetch method="${escapeXmlAttr(args.method || "GET")}" url="${escapeXmlAttr(args.url)}">Realizando petición...</vibes-http-fetch>`;
  },

  execute: async (args, ctx: AgentContext) => {
    const method = args.method || "GET";
    logger.log(`Executing HTTP ${method} ${args.url}`);

    const startTime = Date.now();

    try {
      const fetchOptions: RequestInit = {
        method,
        signal: AbortSignal.timeout(args.timeout_ms),
        redirect: "follow",
      };

      if (args.headers) {
        fetchOptions.headers = args.headers as Record<string, string>;
      }

      if (args.body && ["POST", "PUT", "PATCH"].includes(method)) {
        fetchOptions.body = args.body;
      }

      const resp = await fetch(args.url, fetchOptions);
      const elapsed = Date.now() - startTime;

      // Collect relevant headers
      const interestingHeaders = [
        "content-type",
        "content-length",
        "location",
        "set-cookie",
        "access-control-allow-origin",
        "access-control-allow-methods",
        "access-control-allow-headers",
        "cache-control",
        "x-powered-by",
        "server",
      ];

      const headerLines: string[] = [];
      for (const name of interestingHeaders) {
        const value = resp.headers.get(name);
        if (value) {
          headerLines.push(`  ${name}: ${value}`);
        }
      }

      // Read body
      const maxChars = args.max_response_bytes ?? MAX_BODY_DEFAULT;
      let bodyText: string;

      const contentType = resp.headers.get("content-type") || "";
      const isBinary =
        contentType.startsWith("image/") ||
        contentType.startsWith("audio/") ||
        contentType.startsWith("video/") ||
        contentType.includes("octet-stream");

      if (isBinary) {
        const size = resp.headers.get("content-length") || "unknown";
        bodyText = `[Binary content: ${contentType}, size: ${size} bytes]`;
      } else {
        const rawBody = await resp.text();
        if (rawBody.length > maxChars) {
          bodyText = rawBody.slice(0, maxChars) + `\n\n--- Truncated (${rawBody.length} total chars, showing first ${maxChars}) ---`;
        } else {
          bodyText = rawBody;
        }
      }

      const statusEmoji = resp.ok ? "✅" : "⚠️";
      const result = [
        `${statusEmoji} HTTP ${resp.status} ${resp.statusText} (${elapsed}ms)`,
        `URL: ${resp.url}`,
        headerLines.length > 0 ? `Headers:\n${headerLines.join("\n")}` : null,
        `\nBody:\n${bodyText}`,
      ]
        .filter(Boolean)
        .join("\n");

      logger.log(
        `HTTP ${method} ${args.url} → ${resp.status} (${elapsed}ms, body: ${bodyText.length} chars)`,
      );

      ctx.onXmlComplete(
        `<vibes-http-fetch method="${escapeXmlAttr(method)}" url="${escapeXmlAttr(args.url)}" status="${resp.status}" time="${elapsed}ms">${escapeXmlContent(
          `${resp.status} ${resp.statusText}`,
        )}</vibes-http-fetch>`,
      );

      return result;
    } catch (err: any) {
      const elapsed = Date.now() - startTime;
      const errorMsg =
        err.name === "TimeoutError"
          ? `Request timed out after ${args.timeout_ms}ms`
          : err.code === "ECONNREFUSED"
            ? `Connection refused at ${args.url}`
            : err.message ?? String(err);

      const result = `❌ HTTP ${method} ${args.url} failed (${elapsed}ms): ${errorMsg}`;
      logger.warn(result);

      ctx.onXmlComplete(
        `<vibes-http-fetch method="${escapeXmlAttr(method)}" url="${escapeXmlAttr(args.url)}" status="error" time="${elapsed}ms">${escapeXmlContent(errorMsg)}</vibes-http-fetch>`,
      );

      return result;
    }
  },
};
