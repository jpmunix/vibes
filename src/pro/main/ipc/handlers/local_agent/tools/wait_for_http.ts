/**
 * wait_for_http tool — Smoke check for HTTP services.
 *
 * Polls a URL until it responds with the expected status code or times out.
 * Useful for verifying that a dev server is up and running after start_process.
 */

import { z } from "zod";
import log from "electron-log";
import {
    ToolDefinition,
    AgentContext,
    escapeXmlAttr,
    escapeXmlContent,
} from "./types";

const logger = log.scope("wait_for_http");

// ============================================================================
// Schema
// ============================================================================

const waitForHttpSchema = z.object({
    url: z
        .string()
        .url()
        .describe("The URL to poll (e.g. 'http://localhost:5173')."),
    timeout_ms: z
        .number()
        .int()
        .positive()
        .default(30_000)
        .describe("Maximum time to wait in milliseconds (default: 30s)."),
    expected_status: z
        .number()
        .int()
        .optional()
        .default(200)
        .describe("Expected HTTP status code (default: 200)."),
    interval_ms: z
        .number()
        .int()
        .positive()
        .default(1_000)
        .describe("Polling interval in milliseconds (default: 1s)."),
});

type WaitForHttpArgs = z.infer<typeof waitForHttpSchema>;

// ============================================================================
// Tool Definition
// ============================================================================

export const waitForHttpTool: ToolDefinition<WaitForHttpArgs> = {
    name: "wait_for_http",
    description: `Wait for an HTTP endpoint to become available.

Polls the URL at the specified interval until it responds with the expected status code, or until the timeout is reached.

Use this after start_process to verify the dev server is running.

EXAMPLES:
- { "url": "http://localhost:5173" }
- { "url": "http://localhost:3001/health", "expected_status": 200, "timeout_ms": 15000 }`,
    inputSchema: waitForHttpSchema,
    defaultConsent: "always",

    getConsentPreview: (args) =>
        `Esperando respuesta HTTP de ${args.url}`,

    buildXml: (args, isComplete) => {
        if (!args.url) return undefined;
        if (isComplete) return undefined;
        return `<vibes-wait-http url="${escapeXmlAttr(args.url)}">Esperando...</vibes-wait-http>`;
    },

    execute: async (args, ctx: AgentContext) => {
        logger.log(
            `Waiting for ${args.url} (expected: ${args.expected_status}, timeout: ${args.timeout_ms}ms)`,
        );

        const deadline = Date.now() + args.timeout_ms;
        let lastError: string | null = null;
        let attempts = 0;

        while (Date.now() < deadline) {
            attempts++;
            try {
                const resp = await fetch(args.url, {
                    signal: AbortSignal.timeout(5000),
                    redirect: "follow",
                });

                if (resp.status === args.expected_status) {
                    const responseTimeMs = Date.now() - (deadline - args.timeout_ms);
                    const result = `✅ ${args.url} responded with status ${resp.status} after ${attempts} attempts (${responseTimeMs}ms)`;

                    logger.log(result);
                    ctx.onXmlComplete(
                        `<vibes-wait-http url="${escapeXmlAttr(args.url)}" status="ok" http-status="${resp.status}" attempts="${attempts}" response-time="${responseTimeMs}ms">${escapeXmlContent(result)}</vibes-wait-http>`,
                    );

                    return result;
                }

                // Got a response but wrong status
                lastError = `HTTP ${resp.status} (expected ${args.expected_status})`;
            } catch (err: any) {
                lastError =
                    err.name === "TimeoutError"
                        ? "Request timed out"
                        : err.code === "ECONNREFUSED"
                            ? "Connection refused"
                            : err.message ?? String(err);
            }

            // Wait before next attempt
            await new Promise((resolve) =>
                setTimeout(resolve, args.interval_ms),
            );
        }

        const result = `⏱ Timeout waiting for ${args.url} after ${attempts} attempts (${args.timeout_ms}ms). Last error: ${lastError}`;
        logger.warn(result);

        ctx.onXmlComplete(
            `<vibes-wait-http url="${escapeXmlAttr(args.url)}" status="timeout" attempts="${attempts}">${escapeXmlContent(result)}</vibes-wait-http>`,
        );

        return result;
    },
};
