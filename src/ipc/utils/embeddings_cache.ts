import { createHash } from "node:crypto";
import log from "electron-log";
import { getDb } from "../../db";
import { embeddingsCache } from "../../db/schema";
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
): Promise<number[] | null> {
    try {
        const db = getDb();
        const rows = db
            .select()
            .from(embeddingsCache)
            .where(
                and(
                    eq(embeddingsCache.scope, scope),
                    eq(embeddingsCache.sourceId, sourceId),
                    eq(embeddingsCache.contentKey, contentKey),
                    eq(embeddingsCache.model, model),
                ),
            )
            .all();

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
): Promise<void> {
    try {
        const db = getDb();
        const raw = db.$client as any;

        // Use raw SQL for INSERT OR REPLACE since drizzle's onConflictDoUpdate
        // can be verbose for multi-column unique constraints
        raw
            .prepare(
                `INSERT OR REPLACE INTO embeddings_cache
         (scope, source_id, content_key, content_hash, embedding, model, dimensions, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch())`,
            )
            .run(
                scope,
                sourceId,
                contentKey,
                contentHash,
                JSON.stringify(embedding),
                model,
                dimensions,
            );
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
): Promise<void> {
    try {
        const db = getDb();
        db.delete(embeddingsCache)
            .where(
                and(
                    eq(embeddingsCache.scope, scope),
                    eq(embeddingsCache.sourceId, sourceId),
                ),
            )
            .run();
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
): Promise<
    { contentKey: string; embedding: number[]; contentHash: string }[]
> {
    try {
        const db = getDb();
        const rows = db
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
                ),
            )
            .all();

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
): Promise<number> {
    try {
        const db = getDb();
        const rows = db
            .select({ contentKey: embeddingsCache.contentKey })
            .from(embeddingsCache)
            .where(
                and(
                    eq(embeddingsCache.scope, scope),
                    eq(embeddingsCache.sourceId, sourceId),
                    eq(embeddingsCache.model, model),
                ),
            )
            .all();
        return rows.length;
    } catch (error) {
        logger.error("[CACHE] Error counting cached embeddings:", error);
        return 0;
    }
}
