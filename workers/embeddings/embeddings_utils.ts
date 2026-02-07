/**
 * Worker-safe embeddings utilities
 * Does not import Electron modules that are unavailable in workers
 */

import {
  pipeline,
  env,
  type FeatureExtractionPipeline,
} from "@xenova/transformers";
import log from "electron-log";

const logger = log.scope("embeddings");

let embedder: FeatureExtractionPipeline | null = null;
let initPromise: Promise<FeatureExtractionPipeline> | null = null;

/**
 * Configure transformers cache directory
 * Must be called before first embedding generation
 */
export function configureCacheDir(cacheDir: string): void {
  env.cacheDir = cacheDir;
  env.allowLocalModels = true;
  env.allowRemoteModels = true;
}

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
