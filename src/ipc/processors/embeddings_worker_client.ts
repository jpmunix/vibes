
import * as path from "node:path";
import { Worker } from "node:worker_threads";
import log from "electron-log";
import { app } from "electron";

const logger = log.scope("embeddings_worker_client");

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

/**
 * Generate embeddings in a worker thread to avoid blocking the main thread
 * This prevents UI freezing during file indexing
 */
export async function generateEmbeddingsInWorker(
  chunks: string[],
  filePath: string,
): Promise<Float32Array[]> {
  return new Promise((resolve, reject) => {
    // Worker is built to the same directory as this file
    const workerPath = path.join(__dirname, "embeddings_worker.js");

    logger.debug(`[EMBEDDINGS CLIENT] Starting worker for ${filePath} (${chunks.length} chunks)`);
    logger.debug(`[EMBEDDINGS CLIENT] Worker path: ${workerPath}`);

    // Pass cache directory to worker via workerData
    const cacheDir = path.join(app.getPath("userData"), ".transformers-cache");

    // Create the worker
    const worker = new Worker(workerPath, {
      workerData: { cacheDir },
    });

    // Handle worker messages
    worker.on("message", (output: EmbeddingsWorkerOutput) => {
      if (output.error) {
        logger.error(`[EMBEDDINGS CLIENT] Worker error for ${filePath}:`, output.error);
        worker.terminate();
        reject(new Error(output.error));
      } else {
        logger.debug(`[EMBEDDINGS CLIENT] Worker completed for ${filePath}: ${output.embeddings.length} embeddings`);
        // Remove exit handler before terminating to avoid race condition
        worker.removeAllListeners("exit");
        worker.terminate();
        resolve(output.embeddings);
      }
    });

    // Handle worker errors
    worker.on("error", (error) => {
      logger.error(`[EMBEDDINGS CLIENT] Worker error:`, error);
      worker.removeAllListeners("exit");
      worker.terminate();
      reject(error);
    });

    // Handle worker exit (unexpected termination)
    worker.on("exit", (code) => {
      if (code !== 0) {
        logger.error(`[EMBEDDINGS CLIENT] Worker exited unexpectedly with code ${code}`);
        reject(new Error(`Worker exited unexpectedly with code ${code}`));
      }
    });

    // Send input to worker
    const input: EmbeddingsWorkerInput = {
      type: "generateEmbeddings",
      chunks,
      filePath,
    };

    worker.postMessage(input);
  });
}
