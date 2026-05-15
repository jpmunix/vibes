import log from "electron-log";
import { lt, and, isNotNull, inArray } from "drizzle-orm";
import { getRemoteDb } from "@/db/remote";
import * as remoteSchema from "@/db/remote-schema";

const logger = log.scope("ai_messages_cleanup");

export const AI_MESSAGES_TTL_DAYS = 30;

/**
 * Clear ai_messages_json for messages older than TTL.
 * Run on app startup to prevent database bloat.
 * Uses batching to avoid server-side timeouts (502 errors).
 */
export async function cleanupOldAiMessagesJson() {
  const cutoffSeconds =
    Math.floor(Date.now() / 1000) - AI_MESSAGES_TTL_DAYS * 24 * 60 * 60;
  const cutoffDate = new Date(cutoffSeconds * 1000);

  try {
    const db = getRemoteDb();
    let totalAffected = 0;
    const BATCH_SIZE = 50; // Smaller batches are safer for edge DBs
    const MAX_CLEANUP_PER_RUN = 500; // Don't block background loop too long

    logger.info("Starting background cleanup of old ai_messages_json...");

    while (totalAffected < MAX_CLEANUP_PER_RUN) {
      // Find a batch of IDs that still have aiMessagesJson and are old
      const batch = await db
        .select({ id: remoteSchema.messages.id })
        .from(remoteSchema.messages)
        .where(
          and(
            lt(remoteSchema.messages.createdAt, cutoffDate),
            isNotNull(remoteSchema.messages.aiMessagesJson)
          )
        )
        .limit(BATCH_SIZE);

      if (batch.length === 0) break;

      const ids = batch.map((row) => row.id);

      // Update these specific IDs
      await db
        .update(remoteSchema.messages)
        .set({ aiMessagesJson: null })
        .where(inArray(remoteSchema.messages.id, ids));

      totalAffected += ids.length;

      // Brief pause to be nice to the network/server
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (totalAffected > 0) {
      logger.log(`Cleaned up ${totalAffected} old ai_messages_json entries`);
    } else {
      logger.debug("No old ai_messages_json entries to clean up");
    }
  } catch (err) {
    logger.warn("Failed to cleanup old ai_messages_json:", err);
  }
}
