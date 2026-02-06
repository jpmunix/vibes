/**
 * Semantic context retrieval using local vector search
 * Provides intelligent file selection based on query understanding
 */

import log from "electron-log";
import { CodebaseFile } from "@/utils/codebase";
import { getIncrementalIndexer } from "./file_watcher";
import { rankFilesLocally } from "./local_ranker";

const logger = log.scope("semantic_context");

export interface SemanticContextOptions {
  /** Maximum number of files to return */
  maxFiles?: number;
  /** If true, use semantic search. If false, fall back to keyword search */
  useSemanticSearch?: boolean;
  /** If true, build index if it doesn't exist */
  buildIndexIfNeeded?: boolean;
}

/**
 * Get smart context using semantic search (vector embeddings)
 * Falls back gracefully to keyword search if vector index isn't ready
 *
 * This is a CONSERVATIVE implementation that:
 * 1. Falls back to existing rankFilesLocally if semantic search fails
 * 2. Doesn't break existing functionality
 * 3. Can be enabled/disabled via settings
 */
export async function getSemanticContext({
  appPath,
  prompt,
  files,
  maxFiles = 15,
  useSemanticSearch = true,
  buildIndexIfNeeded = true,
}: {
  appPath: string;
  prompt: string;
  files: CodebaseFile[];
} & SemanticContextOptions): Promise<CodebaseFile[]> {
  // If semantic search is disabled, use existing keyword ranking
  if (!useSemanticSearch) {
    logger.debug("Semantic search disabled, using keyword ranking");
    return rankFilesLocally({ prompt, files, maxResults: maxFiles });
  }

  try {
    // Get or create the incremental indexer for this app
    const indexer = getIncrementalIndexer(appPath);
    const index = indexer.getIndex();

    // Check if index has any content
    const stats = index.getStats();

    if (stats.totalFiles === 0 && buildIndexIfNeeded) {
      // Index is empty, need to build it
      logger.info(
        `Vector index empty for ${appPath}, building full initial index...`,
      );

      // Build index in background (don't block the request)
      // Use indexAllFiles to scan the entire project, not just files in memory
      // Next requests will benefit from the index
      indexer
        .indexAllFiles()
        .then((filesIndexed) => {
          const newStats = index.getStats();
          logger.info(
            `Initial vector index build complete: ${filesIndexed} files indexed, ${newStats.totalChunks} chunks`,
          );
        })
        .catch((error) => {
          logger.error("Error building initial vector index:", error);
        });

      // Fall back to keyword ranking for this request
      logger.debug(
        "Full index building in background, using keyword ranking for this request",
      );
      return rankFilesLocally({ prompt, files, maxResults: maxFiles });
    }

    // Search the vector index
    logger.debug(
      `Searching vector index with ${stats.totalFiles} files, ${stats.totalChunks} chunks`,
    );

    const relevantPaths = await index.search(prompt, maxFiles);

    if (relevantPaths.length === 0) {
      // No results from semantic search, fall back to keyword
      logger.warn(
        "No results from semantic search, falling back to keyword ranking",
      );
      return rankFilesLocally({ prompt, files, maxResults: maxFiles });
    }

    // Convert paths to CodebaseFile objects
    const pathsSet = new Set(relevantPaths);
    const relevantFiles = files.filter((file) => pathsSet.has(file.path));

    // If semantic search returned fewer files than expected, supplement with keyword ranking
    if (relevantFiles.length < maxFiles) {
      const remainingSlots = maxFiles - relevantFiles.length;
      const existingPaths = new Set(relevantFiles.map((f) => f.path));

      const supplemental = rankFilesLocally({
        prompt,
        files: files.filter((f) => !existingPaths.has(f.path)),
        maxResults: remainingSlots,
      });

      relevantFiles.push(...supplemental);
    }

    logger.info(
      `Semantic search returned ${relevantFiles.length} files (requested ${maxFiles})`,
    );

    return relevantFiles.slice(0, maxFiles);
  } catch (error) {
    // If anything goes wrong, fall back gracefully to keyword ranking
    logger.error("Error in semantic search, falling back to keyword:", error);
    return rankFilesLocally({ prompt, files, maxResults: maxFiles });
  }
}

/**
 * Preload vector index for an app (call when app is opened)
 * This ensures the index is ready for fast searches
 */
export async function preloadVectorIndex(
  appPath: string,
  files: CodebaseFile[],
): Promise<void> {
  try {
    const indexer = getIncrementalIndexer(appPath);
    const index = indexer.getIndex();
    const stats = index.getStats();

    // If index is empty or very small, build it by scanning the entire project
    if (stats.totalFiles < files.length * 0.5) {
      logger.info(
        `Preloading vector index for ${appPath} (scanning entire project)...`,
      );

      await indexer.indexAllFiles();

      logger.info(
        `Vector index preloaded: ${index.getStats().totalFiles} files indexed`,
      );
    } else {
      logger.debug(
        `Vector index already loaded for ${appPath} (${stats.totalFiles} files)`,
      );
    }
  } catch (error) {
    logger.error("Error preloading vector index:", error);
    // Don't throw - this is a non-critical optimization
  }
}

/**
 * Get stats about semantic search capability for an app
 */
export function getSemanticSearchStats(appPath: string): {
  isAvailable: boolean;
  totalFiles: number;
  totalChunks: number;
  indexSize: number;
} {
  try {
    const indexer = getIncrementalIndexer(appPath);
    const stats = indexer.getStats();

    return {
      isAvailable: stats.indexStats.totalFiles > 0,
      totalFiles: stats.indexStats.totalFiles,
      totalChunks: stats.indexStats.totalChunks,
      indexSize: stats.indexStats.indexSize,
    };
  } catch (error) {
    logger.error("Error getting semantic search stats:", error);
    return {
      isAvailable: false,
      totalFiles: 0,
      totalChunks: 0,
      indexSize: 0,
    };
  }
}
