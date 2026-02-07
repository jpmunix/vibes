/**
 * Local embeddings using Transformers.js
 * Uses all-MiniLM-L6-v2 model (80MB, 384 dimensions)
 * Fast, local, no external API calls required
 */

import {
  pipeline,
  env,
  type FeatureExtractionPipeline,
} from "@xenova/transformers";
import log from "electron-log";
import { app } from "electron";
import path from "node:path";

const logger = log.scope("embeddings");

// Configure transformers to use local cache only (no CDN downloads during runtime)
// Models will be downloaded on first use and cached
env.cacheDir = path.join(app.getPath("userData"), ".transformers-cache");
env.allowLocalModels = true;
env.allowRemoteModels = true; // Allow initial download, then use local cache

let embedder: FeatureExtractionPipeline | null = null;
let initPromise: Promise<FeatureExtractionPipeline> | null = null;

/**
 * Initialize the embeddings model (lazy loaded)
 * Uses Xenova/all-MiniLM-L6-v2: small, fast, good quality
 * Model size: ~80MB, Dimensions: 384
 */
export async function initEmbeddings(): Promise<FeatureExtractionPipeline> {
  if (embedder) {
    return embedder;
  }

  // If already initializing, wait for that to complete
  if (initPromise) {
    return initPromise;
  }

  logger.info(
    "Initializing embeddings model (first run will download ~80MB)...",
  );

  initPromise = pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2").then(
    (model) => {
      embedder = model;
      logger.info("Embeddings model initialized successfully");
      return model;
    },
  );

  return initPromise;
}

/**
 * Generate embedding for a text string
 * @param text - Text to embed (will be truncated if too long)
 * @returns Float32Array of 384 dimensions
 */
export async function embed(text: string): Promise<Float32Array> {
  try {
    const model = await initEmbeddings();

    // Truncate text if too long (model has 512 token limit)
    // Roughly 4 chars per token, keep 2000 chars to be safe
    const truncated = text.length > 2000 ? text.slice(0, 2000) : text;

    // Generate embedding with pooling and normalization
    const output = await model(truncated, {
      pooling: "mean",
      normalize: true,
    });

    // Extract data as Float32Array
    return output.data as Float32Array;
  } catch (error) {
    logger.error("Error generating embedding:", error);
    // Return zero vector on error (384 dimensions)
    return new Float32Array(384).fill(0);
  }
}

/**
 * Calculate cosine similarity between two embeddings
 * @param a - First embedding
 * @param b - Second embedding
 * @returns Similarity score between 0 and 1 (1 = identical)
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    logger.error(`Embedding dimension mismatch: ${a.length} vs ${b.length}`);
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Batch embed multiple texts
 * @param texts - Array of texts to embed
 * @returns Array of embeddings
 */
export async function embedBatch(texts: string[]): Promise<Float32Array[]> {
  return Promise.all(texts.map((text) => embed(text)));
}
