import { createHash } from "node:crypto";
import log from "electron-log";
import { getRemoteDb } from "../../db/remote";
import { embeddingsCache } from "../../db/remote-schema";
import { eq, and } from "drizzle-orm";

const logger = log.scope("embeddings_cache");

/**
 * Compute a SHA-256 hash for content, used to detect changes and invalidate cache.
 */
export function computeContentHash(content: string): string {
    return createHash("sha256").update(content).digest("hex");
}

/**
 * Get a cached embedding for a specific scope + source + content key.
 * Returns null if not found or if the content has changed (hash mismatch).
 */
export async function getCachedEmbedding(
    scope: string,
    sourceId: number,
    contentKey: string,
    currentContentHash: string,
    model: string,
    userId: string,
): Promise<number[] | null> {
    try {
        const db = getRemoteDb();
        const rows = await db
            .select()
            .from(embeddingsCache)
            .where(
                and(
                    eq(embeddingsCache.scope, scope),
                    eq(embeddingsCache.sourceId, sourceId),
                    eq(embeddingsCache.contentKey, contentKey),
                    eq(embeddingsCache.model, model),
                    eq(embeddingsCache.userId, userId),
                ),
            );

        if (rows.length === 0) return null;

        const row = rows[0];

        // Check if content has changed (hash mismatch = stale cache)
        if (row.contentHash !== currentContentHash) {
            logger.log(
                `[CACHE] Stale embedding for ${scope}:${sourceId}:${contentKey} — hash mismatch`,
            );
            return null;
        }

        return JSON.parse(row.embedding) as number[];
    } catch (error) {
        logger.error("[CACHE] Error reading cached embedding:", error);
        return null;
    }
}

/**
 * Store an embedding in the cache.
 * Uses INSERT OR REPLACE to handle upserts for the unique constraint.
 */
export async function setCachedEmbedding(
    scope: string,
    sourceId: number,
    contentKey: string,
    contentHash: string,
    embedding: number[],
    model: string,
    dimensions: number,
    userId: string,
): Promise<void> {
    try {
        const db = getRemoteDb();

        await db
            .insert(embeddingsCache)
            .values({
                userId,
                scope,
                sourceId,
                contentKey,
                contentHash,
                embedding: JSON.stringify(embedding),
                model,
                dimensions,
                createdAt: new Date(),
            })
            .onConflictDoUpdate({
                target: [embeddingsCache.scope, embeddingsCache.sourceId, embeddingsCache.contentKey, embeddingsCache.model, embeddingsCache.userId],
                set: {
                    contentHash,
                    embedding: JSON.stringify(embedding),
                    dimensions,
                    createdAt: new Date(),
                }
            });
    } catch (error) {
        logger.error("[CACHE] Error storing embedding:", error);
    }
}

/**
 * Clear all cached embeddings for a given scope and source.
 * Useful when re-indexing an entire app or debate.
 */
export async function clearScope(
    scope: string,
    sourceId: number,
    userId: string,
): Promise<void> {
    try {
        const db = getRemoteDb();
        await db.delete(embeddingsCache)
            .where(
                and(
                    eq(embeddingsCache.scope, scope),
                    eq(embeddingsCache.sourceId, sourceId),
                    eq(embeddingsCache.userId, userId),
                ),
            );
        logger.log(`[CACHE] Cleared all ${scope} embeddings for source ${sourceId}`);
    } catch (error) {
        logger.error("[CACHE] Error clearing scope:", error);
    }
}

/**
 * Get all cached embeddings for a scope + source.
 * Returns an array of { contentKey, embedding, contentHash } objects.
 * Useful for bulk similarity calculations.
 */
export async function getAllCachedEmbeddings(
    scope: string,
    sourceId: number,
    model: string,
    userId: string,
): Promise<
    { contentKey: string; embedding: number[]; contentHash: string }[]
> {
    try {
        const db = getRemoteDb();
        const rows = await db
            .select({
                contentKey: embeddingsCache.contentKey,
                embedding: embeddingsCache.embedding,
                contentHash: embeddingsCache.contentHash,
            })
            .from(embeddingsCache)
            .where(
                and(
                    eq(embeddingsCache.scope, scope),
                    eq(embeddingsCache.sourceId, sourceId),
                    eq(embeddingsCache.model, model),
                    eq(embeddingsCache.userId, userId),
                ),
            );

        return rows.map((row) => ({
            contentKey: row.contentKey,
            embedding: JSON.parse(row.embedding) as number[],
            contentHash: row.contentHash,
        }));
    } catch (error) {
        logger.error("[CACHE] Error reading all cached embeddings:", error);
        return [];
    }
}

/**
 * Count how many embeddings are cached for a given scope + source.
 */
export async function getCachedCount(
    scope: string,
    sourceId: number,
    model: string,
    userId: string,
): Promise<number> {
    try {
        const db = getRemoteDb();
        const rows = await db
            .select({ contentKey: embeddingsCache.contentKey })
            .from(embeddingsCache)
            .where(
                and(
                    eq(embeddingsCache.scope, scope),
                    eq(embeddingsCache.sourceId, sourceId),
                    eq(embeddingsCache.model, model),
                    eq(embeddingsCache.userId, userId),
                ),
            );
        return rows.length;
    } catch (error) {
        logger.error("[CACHE] Error counting cached embeddings:", error);
        return 0;
    }
}
