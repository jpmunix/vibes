import { parentPort, workerData } from "node:worker_threads";
import log from "electron-log";
import { embed, configureCacheDir } from "./embeddings_utils";

const logger = log.scope("embeddings_worker");

if (!parentPort) {
  throw new Error("This file must be run as a Worker");
}

// Configure cache directory from workerData
if (workerData?.cacheDir) {
  configureCacheDir(workerData.cacheDir);
  logger.debug(
    `[EMBEDDINGS WORKER] Cache directory set to: ${workerData.cacheDir}`,
  );
} else {
  logger.warn("[EMBEDDINGS WORKER] No cache directory provided in workerData");
}

interface EmbeddingsWorkerInput {
  type: "generateEmbeddings";
  chunks: string[];
  filePath: string;
}

interface EmbeddingsWorkerOutput {
  type: "embeddingsResult";
  embeddings: Float32Array[];
  filePath: string;
  error?: string;
}

parentPort.on("message", async (input: EmbeddingsWorkerInput) => {
  if (input.type === "generateEmbeddings") {
    try {
      logger.debug(
        `[EMBEDDINGS WORKER] Processing ${input.chunks.length} chunks for ${input.filePath}`,
      );
      const startTime = Date.now();

      // Generate embeddings for all chunks
      const embeddings: Float32Array[] = [];
      for (let i = 0; i < input.chunks.length; i++) {
        embeddings.push(await embed(input.chunks[i]));

        // Report progress every few chunks
        if ((i + 1) % 3 === 0 || i === input.chunks.length - 1) {
          logger.debug(
            `[EMBEDDINGS WORKER] Processed ${i + 1}/${input.chunks.length} chunks`,
          );
        }
      }

      const duration = Date.now() - startTime;
      logger.debug(
        `[EMBEDDINGS WORKER] Completed ${input.filePath} in ${duration}ms`,
      );

      const output: EmbeddingsWorkerOutput = {
        type: "embeddingsResult",
        embeddings,
        filePath: input.filePath,
      };

      parentPort!.postMessage(output);
    } catch (error) {
      logger.error(
        `[EMBEDDINGS WORKER] Error processing ${input.filePath}:`,
        error,
      );

      const output: EmbeddingsWorkerOutput = {
        type: "embeddingsResult",
        embeddings: [],
        filePath: input.filePath,
        error: error instanceof Error ? error.message : String(error),
      };

      parentPort!.postMessage(output);
    }
  }
});

logger.log("[EMBEDDINGS WORKER] Worker initialized and ready");
