import log from "electron-log";
import { readSettings } from "../../main/settings";
import { openRouterRequest, hasOpenRouterApiKey } from "./openrouter";
import {
    EMBEDDING_MODELS,
    DEFAULT_EMBEDDING_MODEL,
    getEmbeddingModelDims,
} from "../shared/embedding_model_constants";

const logger = log.scope("embeddings_service");

/**
 * Check if embeddings are available (feature enabled + API key present).
 */
export function isEmbeddingsAvailable(): boolean {
    const settings = readSettings();
    return Boolean(settings.embeddingsEnabled) && hasOpenRouterApiKey();
}

/**
 * Get the configured embedding model ID from settings, falling back to default.
 */
export function getEmbeddingModel(): string {
    const settings = readSettings();
    const model = settings.embeddingsModel || DEFAULT_EMBEDDING_MODEL;
    // Validate it's a known model
    const isKnown = EMBEDDING_MODELS.some((m) => m.id === model);
    return isKnown ? model : DEFAULT_EMBEDDING_MODEL;
}

/**
 * Get the dimensions for the currently configured embedding model.
 */
export function getConfiguredDims(): number {
    const model = getEmbeddingModel();
    return getEmbeddingModelDims(model) ?? 1536;
}

/**
 * Generate a single embedding for the given text.
 * Uses the OpenRouter /api/v1/embeddings endpoint.
 */
export async function generateEmbedding(
    text: string,
    signal?: AbortSignal,
): Promise<number[]> {
    const model = getEmbeddingModel();

    const response = await openRouterRequest("/embeddings", {
        method: "POST",
        body: JSON.stringify({
            model,
            input: text,
        }),
        signal,
    });

    const data = await response.json();

    if (!data?.data?.[0]?.embedding) {
        throw new Error(
            `Invalid embedding response from model ${model}: ${JSON.stringify(data).slice(0, 200)}`,
        );
    }

    return data.data[0].embedding;
}

/**
 * Generate embeddings for multiple texts in batched chunks.
 * Processes in small chunks (default 5) to avoid blocking the event loop
 * or overwhelming the API, preserving UI fluidity.
 *
 * @param texts - Array of texts to embed
 * @param chunkSize - Number of texts per API call (default 5)
 * @param delayBetweenChunksMs - Delay between chunks in ms (default 50)
 * @param signal - Optional AbortSignal to cancel the operation
 * @returns Array of embeddings in the same order as input texts
 */
export async function generateEmbeddingsBatched(
    texts: string[],
    chunkSize = 5,
    delayBetweenChunksMs = 50,
    signal?: AbortSignal,
): Promise<number[][]> {
    if (texts.length === 0) return [];

    const model = getEmbeddingModel();
    const results: number[][] = [];

    for (let i = 0; i < texts.length; i += chunkSize) {
        if (signal?.aborted) {
            throw new Error("Embedding generation aborted");
        }

        const chunk = texts.slice(i, i + chunkSize);
        logger.log(
            `[EMBEDDINGS] Processing chunk ${Math.floor(i / chunkSize) + 1}/${Math.ceil(texts.length / chunkSize)} (${chunk.length} texts)`,
        );

        let retries = 0;
        const maxRetries = 3;

        while (retries < maxRetries) {
            try {
                const response = await openRouterRequest("/embeddings", {
                    method: "POST",
                    body: JSON.stringify({
                        model,
                        input: chunk,
                    }),
                    signal,
                });

                const data = await response.json();

                if (!data?.data || !Array.isArray(data.data)) {
                    throw new Error(
                        `Invalid batch embedding response: ${JSON.stringify(data).slice(0, 200)}`,
                    );
                }

                // Sort by index to ensure correct order
                const sorted = data.data.sort(
                    (a: { index: number }, b: { index: number }) => a.index - b.index,
                );
                for (const item of sorted) {
                    results.push(item.embedding);
                }

                break; // Success, exit retry loop
            } catch (error) {
                retries++;
                if (retries >= maxRetries) {
                    throw error;
                }
                // Exponential backoff: 200ms, 400ms, 800ms
                const backoffMs = 200 * Math.pow(2, retries - 1);
                logger.warn(
                    `[EMBEDDINGS] Retry ${retries}/${maxRetries} after ${backoffMs}ms`,
                );
                await sleep(backoffMs);
            }
        }

        // Small delay between chunks to avoid hogging the event loop
        if (i + chunkSize < texts.length) {
            await sleep(delayBetweenChunksMs);
        }
    }

    return results;
}

/**
 * Calculate cosine similarity between two vectors.
 * Returns a value between -1 and 1 (1 = identical, 0 = orthogonal, -1 = opposite).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
        throw new Error(
            `Vector dimension mismatch: ${a.length} vs ${b.length}`,
        );
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 0;

    return dotProduct / denominator;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
