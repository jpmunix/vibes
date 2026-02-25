/**
 * Centralized message persistence for the Local Agent.
 * All database operations on messages are routed through this module
 * to eliminate scattered db.update calls and duplicated error handling.
 */

import log from "electron-log";
import { eq } from "drizzle-orm";
import { getRemoteDb } from "@/db/remote";
import * as remoteSchema from "@/db/remote-schema";
import type { AiMessagesJsonV6 } from "@/db/remote-schema";

const logger = log.scope("message_persistence");

/**
 * Initialize message status as incomplete (non-blocking).
 * Called at the start of a stream.
 */
export function initMessageStatus(
    messageId: number,
    previousResponseId: number | null,
): void {
    void getRemoteDb()
        .update(remoteSchema.messages)
        .set({ previousResponseId, status: "incomplete" })
        .where(eq(remoteSchema.messages.id, messageId))
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
    await getRemoteDb()
        .update(remoteSchema.messages)
        .set({ content })
        .where(eq(remoteSchema.messages.id, messageId))
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
    await getRemoteDb()
        .update(remoteSchema.messages)
        .set({ maxTokensUsed, status: "completed" })
        .where(eq(remoteSchema.messages.id, messageId))
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
    await getRemoteDb()
        .update(remoteSchema.messages)
        .set({ approvalState: "approved", status: "completed" })
        .where(eq(remoteSchema.messages.id, messageId))
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
    await getRemoteDb()
        .update(remoteSchema.messages)
        .set({
            content: `${partialContent}\n\n[Response cancelled by user]`,
            status: "incomplete",
        })
        .where(eq(remoteSchema.messages.id, messageId))
        .catch((err) => logger.error("Failed to mark cancelled", err));
}

/**
 * Mark message as failed.
 */
export async function markFailed(messageId: number): Promise<void> {
    await getRemoteDb()
        .update(remoteSchema.messages)
        .set({ status: "failed" } as any)
        .where(eq(remoteSchema.messages.id, messageId))
        .catch((err) => logger.error("Failed to set failed status", err));
}

/**
 * Save AI SDK messages JSON for multi-turn tool call preservation.
 */
export async function saveAiMessagesJson(
    messageId: number,
    aiMessagesJson: AiMessagesJsonV6,
): Promise<void> {
    await getRemoteDb()
        .update(remoteSchema.messages)
        .set({ aiMessagesJson: JSON.stringify(aiMessagesJson) })
        .where(eq(remoteSchema.messages.id, messageId))
        .catch((err) => logger.error("Failed to save AI messages JSON", err));
}

/**
 * Save commit hash on the message.
 */
export async function saveCommitHash(
    messageId: number,
    commitHash: string,
): Promise<void> {
    await getRemoteDb()
        .update(remoteSchema.messages)
        .set({ commitHash })
        .where(eq(remoteSchema.messages.id, messageId))
        .catch((err) => logger.error("Failed to save commit hash", err));
}
