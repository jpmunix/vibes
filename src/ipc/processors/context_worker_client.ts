import * as path from "node:path";
import { Worker } from "node:worker_threads";
import log from "electron-log";
import type {
  ContextWorkerInput,
  ContextWorkerOutput,
} from "../../../shared/context_types";
import type { CodebaseFile } from "@/utils/codebase";
import type { AppChatContext } from "@/lib/schemas";

const logger = log.scope("context_worker_client");

export interface AnalyzeContextParams {
  appPath: string;
  chatContext: AppChatContext;
  prompt: string;
  useSemanticSearch: boolean;
  maxFiles: number;
}

export interface AnalyzeContextResult {
  codebaseInfo: string;
  files: CodebaseFile[];
}

/**
 * Analyze context in a worker thread to avoid blocking the main thread
 * This prevents the UI from becoming unresponsive during context analysis
 */
export async function analyzeContextInWorker(
  params: AnalyzeContextParams,
): Promise<AnalyzeContextResult> {
  return new Promise((resolve, reject) => {
    // Determine the worker script path
    const workerPath = path.join(__dirname, "context_worker.js");

    logger.log(
      `[CONTEXT CLIENT] Starting context worker for app ${params.appPath}`,
    );

    // Create the worker
    const worker = new Worker(workerPath);

    // Handle worker messages
    worker.on("message", (output: ContextWorkerOutput) => {
      worker.terminate();

      if (output.success && output.data) {
        logger.log(
          `[CONTEXT CLIENT] Context worker completed successfully: ${output.data.files.length} files`,
        );
        resolve(output.data);
      } else {
        logger.error(`[CONTEXT CLIENT] Context worker failed: ${output.error}`);
        reject(new Error(output.error || "Unknown worker error"));
      }
    });

    // Handle worker errors
    worker.on("error", (error) => {
      logger.error(`[CONTEXT CLIENT] Context worker error:`, error);
      worker.terminate();
      reject(error);
    });

    // Handle worker exit
    worker.on("exit", (code) => {
      if (code !== 0) {
        logger.error(
          `[CONTEXT CLIENT] Context worker exited with code ${code}`,
        );
        reject(new Error(`Worker exited with code ${code}`));
      }
    });

    // Send input to worker
    const input: ContextWorkerInput = {
      appPath: params.appPath,
      chatContext: params.chatContext,
      prompt: params.prompt,
      useSemanticSearch: params.useSemanticSearch,
      maxFiles: params.maxFiles,
    };

    logger.log(`[CONTEXT CLIENT] Sending input to context worker`);
    worker.postMessage(input);
  });
}
