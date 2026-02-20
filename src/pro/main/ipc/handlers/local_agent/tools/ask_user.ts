/**
 * ask_user — Agent tool for requesting user input/decisions.
 *
 * When the agent is blocked or needs clarification, it can use this tool
 * to pause execution and ask the user a question. The agent's execution
 * is suspended until the user responds.
 *
 * Uses the same IPC Promise-based waiting pattern as the consent system.
 */

import { z } from "zod";
import crypto from "node:crypto";
import {
    type ToolDefinition,
    type AgentContext,
    type ToolResult,
    ToolError,
    escapeXmlAttr,
} from "./types";

// ============================================================================
// Schema
// ============================================================================

const askUserSchema = z.object({
    question: z
        .string()
        .describe("The question to ask the user. Be clear and specific about what you need."),
    options: z
        .array(z.string())
        .optional()
        .describe("Optional list of predefined options the user can choose from. If not provided, the user can type a free-form response."),
    context: z
        .string()
        .optional()
        .describe("Optional additional context explaining why you need this information."),
});

type AskUserInput = z.infer<typeof askUserSchema>;

// ============================================================================
// Pending Response Management
// ============================================================================

interface PendingAskUserEntry {
    chatId: number;
    resolve: (response: string) => void;
}

const pendingAskUserResolvers = new Map<string, PendingAskUserEntry>();

/**
 * Wait for the user to respond to an ask_user request.
 * Returns a Promise that resolves with the user's response string.
 */
export function waitForAskUserResponse(
    requestId: string,
    chatId: number,
): Promise<string> {
    return new Promise((resolve) => {
        pendingAskUserResolvers.set(requestId, { chatId, resolve });
    });
}

/**
 * Resolve a pending ask_user request with the user's response.
 * Called by the IPC handler when the renderer sends a response.
 */
export function resolveAskUserResponse(
    requestId: string,
    response: string,
): void {
    const entry = pendingAskUserResolvers.get(requestId);
    if (entry) {
        pendingAskUserResolvers.delete(requestId);
        entry.resolve(response);
    }
}

/**
 * Clean up all pending ask_user requests for a given chat.
 * Called when a stream is cancelled/aborted to prevent orphaned promises.
 */
export function clearPendingAskUsersForChat(chatId: number): void {
    for (const [requestId, entry] of pendingAskUserResolvers) {
        if (entry.chatId === chatId) {
            pendingAskUserResolvers.delete(requestId);
            // Resolve with empty string so the tool execution fails gracefully
            entry.resolve("");
        }
    }
}

// ============================================================================
// Tool Definition
// ============================================================================

export const askUserTool: ToolDefinition<AskUserInput> = {
    name: "ask_user",
    description: `Ask the user a question and wait for their response.

Use this tool when you need clarification, a decision, or specific input from the user before proceeding.
Examples:
- Choosing between multiple valid approaches
- Confirming a potentially destructive action
- Getting specific values or preferences (colors, names, etc.)
- Clarifying ambiguous requirements

If you provide 'options', the user will see clickable buttons to choose from.
If you don't provide options, the user can type a free-form response.

IMPORTANT RULES:
- Only use this tool when you are genuinely blocked. Do NOT use it for trivial decisions you can make yourself.
- If you need to ask follow-up questions after receiving a response, you MUST use this tool again. NEVER ask questions in plain text — the user cannot respond to plain text questions.
- Prefer using 'options' when there are a finite set of valid choices.`,

    inputSchema: askUserSchema,
    defaultConsent: "always",
    modifiesState: false,

    getConsentPreview: (args) => {
        const preview = `Pregunta: "${args.question}"`;
        if (args.options?.length) {
            return `${preview} (opciones: ${args.options.join(", ")})`;
        }
        return preview;
    },

    buildXml: (args, isComplete) => {
        if (!args.question) return undefined;
        const attrs = [`question="${escapeXmlAttr(args.question)}"`];

        if (args.options?.length) {
            attrs.push(`options="${escapeXmlAttr(args.options.join("|"))}"`);
        }
        if (args.context) {
            attrs.push(`context="${escapeXmlAttr(args.context)}"`);
        }

        if (!isComplete) {
            return `<dyad-ask-user ${attrs.join(" ")}>`;
        }
        // Return undefined on isComplete — keep the tag OPEN (pending).
        // The closing tag is emitted by execute() after the user responds.
        // This keeps the streaming loader showing "Esperando respuesta..." while waiting.
        return undefined;
    },

    execute: async (args, ctx: AgentContext): Promise<ToolResult> => {
        try {
            const requestId = `ask-user:${crypto.randomUUID()}`;

            // Build the closing XML to emit after the user responds
            const closeAttrs = [`question="${escapeXmlAttr(args.question)}"`];
            if (args.options?.length) {
                closeAttrs.push(`options="${escapeXmlAttr(args.options.join("|"))}"`);
            }
            if (args.context) {
                closeAttrs.push(`context="${escapeXmlAttr(args.context)}"`);
            }

            // Emit IPC event to renderer to show the ask_user UI
            (ctx.event.sender as any).send("agent-tool:ask-user-request", {
                requestId,
                chatId: ctx.chatId,
                question: args.question,
                options: args.options ?? null,
                context: args.context ?? null,
            });

            // Wait for user response (execution is paused here)
            const response = await waitForAskUserResponse(requestId, ctx.chatId);

            // Now emit the closing tag (the tag was open the whole time)
            ctx.onXmlComplete(`<dyad-ask-user ${closeAttrs.join(" ")}>${escapeXmlAttr(response)}</dyad-ask-user>`);

            if (!response) {
                throw new ToolError("The user did not provide a response (stream was cancelled).", {
                    retryable: false,
                });
            }

            return `The user answered: "${response}". Proceed with the task using this answer. If you still need more information from the user, you MUST call ask_user again — do NOT write questions in plain text because the user cannot respond to them.`;
        } catch (error) {
            if (error instanceof ToolError) throw error;
            const msg = error instanceof Error ? error.message : String(error);
            throw new ToolError(`ask_user failed: ${msg}`, {
                retryable: false,
                hint: "The ask_user tool encountered an unexpected error.",
            });
        }
    },
};
