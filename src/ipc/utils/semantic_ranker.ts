import log from "electron-log";
import type { CodebaseFile } from "@/utils/codebase";
import {
    generateEmbedding,
    generateEmbeddingsBatched,
    cosineSimilarity,
    getEmbeddingModel,
    getConfiguredDims,
    isEmbeddingsAvailable,
} from "./embeddings_service";
import {
    getCachedEmbedding,
    setCachedEmbedding,
    computeContentHash,
    getAllCachedEmbeddings,
} from "./embeddings_cache";

const logger = log.scope("semantic_ranker");

export interface SemanticRankedFile extends CodebaseFile {
    keywordScore: number;
    semanticScore: number;
    hybridScore: number;
}

/**
 * Re-rank files using a hybrid approach: keyword score + semantic similarity.
 *
 * Flow:
 * 1. Generate embedding for the user prompt
 * 2. For each file, get or create a cached embedding
 * 3. Compute cosine similarity between prompt and each file embedding
 * 4. Combine keyword score (from local_ranker) with semantic score
 * 5. Sort by hybrid score and return top results
 *
 * @param prompt - The user's prompt text
 * @param files - Files already ranked by keyword (with `score` property)
 * @param appId - Database app ID for cache scoping
 * @param maxResults - Maximum number of files to return
 * @param keywordWeight - Weight for the keyword score (0-1), default 0.3
 * @param semanticWeight - Weight for the semantic score (0-1), default 0.7
 * @param signal - Optional AbortSignal to cancel the operation
 */
export async function semanticRerank(
    prompt: string,
    files: Array<CodebaseFile & { score: number }>,
    appId: number,
    maxResults = 60,
    keywordWeight = 0.3,
    semanticWeight = 0.7,
    signal?: AbortSignal,
): Promise<SemanticRankedFile[]> {
    if (!isEmbeddingsAvailable()) {
        logger.log("[SEMANTIC] Embeddings not available, skipping semantic ranking");
        return files.slice(0, maxResults).map((f) => ({
            ...f,
            keywordScore: f.score,
            semanticScore: 0,
            hybridScore: f.score,
        }));
    }

    if (files.length === 0) {
        return [];
    }

    const model = getEmbeddingModel();
    const dims = getConfiguredDims();
    const startTime = Date.now();

    try {
        // Step 1: Generate embedding for the prompt
        logger.log(`[SEMANTIC] Generating prompt embedding with model ${model}...`);
        const promptEmbedding = await generateEmbedding(prompt, signal);

        // Step 2: Get/create embeddings for each file
        const filesToEmbed: { index: number; content: string }[] = [];
        const fileEmbeddings: (number[] | null)[] = new Array(files.length).fill(
            null,
        );

        // Check cache first
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const contentHash = computeContentHash(file.content);
            const cached = await getCachedEmbedding(
                "file",
                appId,
                file.path,
                contentHash,
                model,
            );

            if (cached) {
                fileEmbeddings[i] = cached;
            } else {
                // Need to generate embedding for this file
                filesToEmbed.push({
                    index: i,
                    content: `File: ${file.path}\n${file.content.slice(0, 8000)}`, // Limit content for embedding
                });
            }
        }

        logger.log(
            `[SEMANTIC] Cache: ${files.length - filesToEmbed.length}/${files.length} hits, ${filesToEmbed.length} to generate`,
        );

        // Step 3: Batch generate missing embeddings
        if (filesToEmbed.length > 0) {
            if (signal?.aborted) {
                throw new Error("Semantic ranking aborted");
            }

            const newEmbeddings = await generateEmbeddingsBatched(
                filesToEmbed.map((f) => f.content),
                5, // chunk size
                50, // delay between chunks
                signal,
            );

            // Store results and cache them
            for (let i = 0; i < filesToEmbed.length; i++) {
                const { index } = filesToEmbed[i];
                const file = files[index];
                const embedding = newEmbeddings[i];
                fileEmbeddings[index] = embedding;

                // Cache the embedding
                const contentHash = computeContentHash(file.content);
                void setCachedEmbedding(
                    "file",
                    appId,
                    file.path,
                    contentHash,
                    embedding,
                    model,
                    dims,
                );
            }
        }

        // Step 4: Compute hybrid scores
        // Normalize keyword scores to [0, 1]
        const maxKeywordScore = Math.max(...files.map((f) => f.score), 1);

        const ranked: SemanticRankedFile[] = files.map((file, i) => {
            const embedding = fileEmbeddings[i];
            const normalizedKeyword = file.score / maxKeywordScore;

            let semanticScore = 0;
            if (embedding) {
                // Cosine similarity is in [-1, 1], normalize to [0, 1]
                const raw = cosineSimilarity(promptEmbedding, embedding);
                semanticScore = (raw + 1) / 2;
            }

            const hybridScore =
                keywordWeight * normalizedKeyword + semanticWeight * semanticScore;

            return {
                ...file,
                keywordScore: file.score,
                semanticScore,
                hybridScore,
            };
        });

        // Step 5: Sort by hybrid score and return top results
        ranked.sort((a, b) => b.hybridScore - a.hybridScore);

        const elapsed = Date.now() - startTime;
        logger.log(
            `[SEMANTIC] Ranking complete in ${elapsed}ms: ${ranked.length} files → top ${maxResults}`,
        );

        return ranked.slice(0, maxResults);
    } catch (error) {
        logger.error("[SEMANTIC] Semantic ranking failed, falling back to keyword ranking:", error);
        // Graceful fallback: return keyword-ranked files unchanged
        return files.slice(0, maxResults).map((f) => ({
            ...f,
            keywordScore: f.score,
            semanticScore: 0,
            hybridScore: f.score,
        }));
    }
}
