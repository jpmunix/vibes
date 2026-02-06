import { parentPort } from "node:worker_threads";
import log from "electron-log";
import type {
  ContextWorkerInput,
  ContextWorkerOutput,
} from "../../shared/context_types";
import { extractCodebase, CodebaseFile } from "../../src/utils/codebase";
import { getSemanticContext } from "../../src/ipc/utils/semantic_context";
import {
  rankFilesLocally,
  buildCodebaseXml,
} from "../../src/ipc/utils/local_ranker";

const logger = log.scope("context_worker");

if (!parentPort) {
  throw new Error("This file must be run as a Worker");
}

parentPort.on("message", async (input: ContextWorkerInput) => {
  try {
    logger.log(
      `[CONTEXT WORKER] Starting context analysis for ${input.appPath}`,
    );
    const startTime = Date.now();

    // Step 1: Extract codebase
    logger.log(`[CONTEXT WORKER] Extracting codebase...`);
    const { formattedOutput: initialCodebaseInfo, files: extractedFiles } =
      await extractCodebase({
        appPath: input.appPath,
        chatContext: input.chatContext,
      });
    logger.log(`[CONTEXT WORKER] Extracted ${extractedFiles.length} files`);

    let finalFiles: CodebaseFile[] = extractedFiles;
    let finalCodebaseInfo = initialCodebaseInfo;

    // Step 2: Apply smart context if needed
    if (input.useSemanticSearch && extractedFiles.length > input.maxFiles) {
      logger.log(
        `[CONTEXT WORKER] Applying semantic search (max ${input.maxFiles} files)...`,
      );

      try {
        const rankedFiles = await getSemanticContext({
          appPath: input.appPath,
          prompt: input.prompt,
          files: extractedFiles,
          maxFiles: input.maxFiles,
          useSemanticSearch: true,
          buildIndexIfNeeded: true,
        });

        finalFiles = rankedFiles;
        finalCodebaseInfo = buildCodebaseXml(rankedFiles);
        logger.log(
          `[CONTEXT WORKER] Semantic search completed: ${rankedFiles.length} files selected`,
        );
      } catch (error) {
        logger.error(
          `[CONTEXT WORKER] Semantic search failed, falling back to keyword ranking:`,
          error,
        );

        // Fallback to keyword ranking
        const rankedFiles = rankFilesLocally({
          prompt: input.prompt,
          files: extractedFiles,
          maxResults: input.maxFiles,
        });

        finalFiles = rankedFiles;
        finalCodebaseInfo = buildCodebaseXml(rankedFiles);
        logger.log(
          `[CONTEXT WORKER] Keyword ranking fallback: ${rankedFiles.length} files selected`,
        );
      }
    }

    const endTime = Date.now();
    logger.log(
      `[CONTEXT WORKER] Context analysis completed in ${endTime - startTime}ms`,
    );

    const output: ContextWorkerOutput = {
      success: true,
      data: {
        codebaseInfo: finalCodebaseInfo,
        files: finalFiles,
      },
    };

    parentPort!.postMessage(output);
  } catch (error) {
    logger.error("[CONTEXT WORKER] Error during context analysis:", error);

    const output: ContextWorkerOutput = {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };

    parentPort!.postMessage(output);
  }
});
