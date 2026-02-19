/**
 * Centralized message persistence for the Local Agent.
 * All database operations on messages are routed through this module
 * to eliminate scattered db.update calls and duplicated error handling.
 */

import log from "electron-log";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { messages, type AiMessagesJsonV6 } from "@/db/schema";

const logger = log.scope("message_persistence");

/**
 * Initialize message status as incomplete (non-blocking).
 * Called at the start of a stream.
 */
export function initMessageStatus(
    messageId: number,
    previousResponseId: number | null,
): void {
    void db
        .update(messages)
        .set({ previousResponseId, status: "incomplete" })
        .where(eq(messages.id, messageId))
        .catch((err) =>
            logger.error("Failed to set initial message status/context", err),
        );
}

/**
 * Update message content (streaming chunks).
 * Called frequently during streaming — errors are swallowed.
 */
export async function updateMessageContent(
    messageId: number,
    content: string,
): Promise<void> {
    await db
        .update(messages)
        .set({ content })
        .where(eq(messages.id, messageId))
        .catch((err) => logger.error("Failed to update message content", err));
}

/**
 * Mark message as completed with token count.
 * Called in onFinish when token stats are available.
 */
export async function markCompleted(
    messageId: number,
    maxTokensUsed: number,
): Promise<void> {
    await db
        .update(messages)
        .set({ maxTokensUsed, status: "completed" })
        .where(eq(messages.id, messageId))
        .catch((err) =>
            logger.error("Failed to save token count/status", err),
        );
}

/**
 * Mark message as approved and completed.
 * Safety net called at the end of the stream.
 */
export async function markApprovedAndCompleted(
    messageId: number,
): Promise<void> {
    await db
        .update(messages)
        .set({ approvalState: "approved", status: "completed" })
        .where(eq(messages.id, messageId))
        .catch((err) =>
            logger.error("Failed to mark approved/completed", err),
        );
}

/**
 * Mark message as cancelled (incomplete) with partial content.
 */
export async function markCancelled(
    messageId: number,
    partialContent: string,
): Promise<void> {
    await db
        .update(messages)
        .set({
            content: `${partialContent}\n\n[Response cancelled by user]`,
            status: "incomplete",
        })
        .where(eq(messages.id, messageId))
        .catch((err) => logger.error("Failed to mark cancelled", err));
}

/**
 * Mark message as failed.
 */
export async function markFailed(messageId: number): Promise<void> {
    await db
        .update(messages)
        .set({ status: "failed" } as any)
        .where(eq(messages.id, messageId))
        .catch((err) => logger.error("Failed to set failed status", err));
}

/**
 * Save AI SDK messages JSON for multi-turn tool call preservation.
 */
export async function saveAiMessagesJson(
    messageId: number,
    aiMessagesJson: AiMessagesJsonV6,
): Promise<void> {
    await db
        .update(messages)
        .set({ aiMessagesJson })
        .where(eq(messages.id, messageId))
        .catch((err) => logger.error("Failed to save AI messages JSON", err));
}

/**
 * Save commit hash on the message.
 */
export async function saveCommitHash(
    messageId: number,
    commitHash: string,
): Promise<void> {
    await db
        .update(messages)
        .set({ commitHash })
        .where(eq(messages.id, messageId))
        .catch((err) => logger.error("Failed to save commit hash", err));
}
