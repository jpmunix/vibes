/**
 * Incremental file watcher for automatic index updates
 * Watches for file changes and updates the vector index in background
 */

import type { FSWatcher } from "chokidar";
import chokidar from "chokidar";
import log from "electron-log";
import { LocalVectorIndex } from "./vector_index";
import { readFileWithCache } from "@/utils/codebase";
import path from "node:path";

const logger = log.scope("file_watcher");

/**
 * Manages incremental indexing of files as they change
 */
export class IncrementalIndexer {
  private watcher: FSWatcher | null = null;
  private index: LocalVectorIndex;
  private pendingFiles: Set<string> = new Set();
  private indexTimer: NodeJS.Timeout | null = null;
  private isIndexing: boolean = false;
  private appPath: string;

  constructor(appPath: string) {
    this.appPath = appPath;
    this.index = new LocalVectorIndex(appPath);
  }

  /**
   * Start watching for file changes
   */
  start(): void {
    if (this.watcher) {
      logger.warn("File watcher already started");
      return;
    }

    logger.info(`Starting file watcher for ${this.appPath}`);

    this.watcher = chokidar.watch(this.appPath, {
      ignored: [
        /(^|[/\\])\../, // dot files
        "**/node_modules/**",
        "**/.git/**",
        "**/dist/**",
        "**/build/**",
        "**/.next/**",
        "**/.venv/**",
        "**/venv/**",
        "**/.dyad/**", // Don't watch our own index
      ],
      persistent: true,
      ignoreInitial: true, // Don't trigger for existing files
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
    });

    // Handle file changes
    this.watcher.on("change", (filePath: string) => {
      this.onFileChange(filePath);
    });

    this.watcher.on("add", (filePath: string) => {
      this.onFileChange(filePath);
    });

    this.watcher.on("unlink", (filePath: string) => {
      this.onFileDelete(filePath);
    });

    this.watcher.on("error", (error: unknown) => {
      logger.error("File watcher error:", error);
    });

    logger.info("File watcher started successfully");
  }

  /**
   * Stop watching for file changes
   */
  async stop(): Promise<void> {
    if (this.indexTimer) {
      clearTimeout(this.indexTimer);
      this.indexTimer = null;
    }

    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
      logger.info("File watcher stopped");
    }
  }

  /**
   * Handle file change event
   */
  private onFileChange(filePath: string): void {
    // Only index allowed extensions
    const ext = path.extname(filePath).toLowerCase();
    const allowedExtensions = [
      ".ts",
      ".tsx",
      ".js",
      ".jsx",
      ".mjs",
      ".cjs",
      ".mts",
      ".cts",
      ".css",
      ".html",
      ".md",
      ".astro",
      ".vue",
      ".svelte",
      ".json",
      ".py",
      ".php",
    ];

    if (!allowedExtensions.includes(ext)) {
      return;
    }

    logger.debug(`File changed: ${filePath}`);
    this.pendingFiles.add(filePath);
    this.scheduleIndex();
  }

  /**
   * Handle file deletion event
   */
  private onFileDelete(filePath: string): void {
    logger.debug(`File deleted: ${filePath}`);

    // Remove from pending files
    this.pendingFiles.delete(filePath);

    // Note: We don't remove from index immediately as it might be a rename/move
    // The file will be naturally removed when index is rebuilt or cleaned
  }

  /**
   * Schedule index update (debounced)
   */
  private scheduleIndex(): void {
    if (this.indexTimer) {
      clearTimeout(this.indexTimer);
    }

    // Wait 2 seconds after last change before indexing
    this.indexTimer = setTimeout(() => {
      this.processQueue();
    }, 2000);
  }

  /**
   * Process all pending file changes
   */
  private async processQueue(): Promise<void> {
    if (this.isIndexing || this.pendingFiles.size === 0) {
      return;
    }

    this.isIndexing = true;
    const files = Array.from(this.pendingFiles);
    this.pendingFiles.clear();

    logger.info(`Processing ${files.length} changed files...`);

    try {
      for (const filePath of files) {
        try {
          const relativePath = path.relative(this.appPath, filePath);
          const content = await readFileWithCache(filePath);

          if (content != null && content.length > 0) {
            await this.index.addFile(relativePath, content);
          }
        } catch (error) {
          logger.error(`Error indexing file ${filePath}:`, error);
        }
      }

      logger.info(`Finished processing ${files.length} files`);
    } finally {
      this.isIndexing = false;

      // Check if more files were added while we were processing
      if (this.pendingFiles.size > 0) {
        this.scheduleIndex();
      }
    }
  }

  /**
   * Get the underlying vector index
   */
  getIndex(): LocalVectorIndex {
    return this.index;
  }

  /**
   * Index all existing files in the app directory
   * This is useful for initial indexing or re-indexing
   */
  async indexAllFiles(): Promise<number> {
    logger.info(`Starting full indexing for ${this.appPath}...`);

    // Check if appPath exists
    const fs = await import("fs/promises");
    try {
      const stats = await fs.stat(this.appPath);
      logger.info(
        `AppPath exists: ${this.appPath}, isDirectory: ${stats.isDirectory()}`,
      );
    } catch (error) {
      logger.error(
        `AppPath does not exist or is inaccessible: ${this.appPath}`,
        error,
      );
      return 0;
    }

    const { glob } = await import("glob");
    const allowedExtensions = [
      ".ts",
      ".tsx",
      ".js",
      ".jsx",
      ".mjs",
      ".cjs",
      ".mts",
      ".cts",
      ".css",
      ".html",
      ".md",
      ".astro",
      ".vue",
      ".svelte",
      ".json",
      ".py",
      ".php",
    ];

    // Find all matching files
    const patterns = allowedExtensions.map((ext) => `**/*${ext}`);
    let allFiles: string[] = [];

    for (const pattern of patterns) {
      logger.debug(`Searching for pattern ${pattern} in ${this.appPath}`);
      const files = await glob(pattern, {
        cwd: this.appPath,
        absolute: true,
        ignore: [
          "**/node_modules/**",
          "**/.git/**",
          "**/dist/**",
          "**/build/**",
          "**/.next/**",
          "**/.venv/**",
          "**/venv/**",
          "**/.dyad/**",
        ],
      });
      logger.debug(`Pattern ${pattern} found ${files.length} files`);
      allFiles = allFiles.concat(files);
    }

    logger.info(`Found ${allFiles.length} files to index`);

    if (allFiles.length === 0) {
      logger.warn(`No files found to index in ${this.appPath}`);
      return 0;
    }

    // Process files in batches with small delays to keep UI responsive
    const batchSize = 5;
    let indexedCount = 0;

    for (let i = 0; i < allFiles.length; i += batchSize) {
      const batch = allFiles.slice(i, i + batchSize);

      const results = await Promise.allSettled(
        batch.map(async (filePath) => {
          try {
            const relativePath = path.relative(this.appPath, filePath);
            const content = await readFileWithCache(filePath);

            if (content != null && content.length > 0) {
              await this.index.addFile(relativePath, content);
              return true;
            }
            return false;
          } catch (error) {
            logger.error(`Error indexing file ${filePath}:`, error);
            return false;
          }
        }),
      );

      indexedCount += results.filter(
        (r) => r.status === "fulfilled" && r.value === true,
      ).length;

      logger.debug(
        `Indexed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(allFiles.length / batchSize)} (${indexedCount}/${allFiles.length} files processed)`,
      );

      // Small delay between batches to allow event loop to process other events
      // This prevents completely blocking the main thread
      if (i + batchSize < allFiles.length) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    }

    logger.info(
      `Finished full indexing: ${indexedCount} files indexed out of ${allFiles.length} found`,
    );
    return indexedCount;
  }

  /**
   * Get stats about pending and processed files
   */
  getStats(): {
    pendingFiles: number;
    isIndexing: boolean;
    indexStats: ReturnType<LocalVectorIndex["getStats"]>;
  } {
    return {
      pendingFiles: this.pendingFiles.size,
      isIndexing: this.isIndexing,
      indexStats: this.index.getStats(),
    };
  }
}

// Global registry of watchers per app path
const watchers = new Map<string, IncrementalIndexer>();

/**
 * Get or create an incremental indexer for an app
 */
export function getIncrementalIndexer(appPath: string): IncrementalIndexer {
  let indexer = watchers.get(appPath);

  if (!indexer) {
    indexer = new IncrementalIndexer(appPath);
    indexer.start();
    watchers.set(appPath, indexer);
    logger.info(`Created new incremental indexer for ${appPath}`);
  }

  return indexer;
}

/**
 * Stop and remove an incremental indexer for an app
 */
export async function stopIncrementalIndexer(appPath: string): Promise<void> {
  const indexer = watchers.get(appPath);

  if (indexer) {
    await indexer.stop();
    watchers.delete(appPath);
    logger.info(`Stopped incremental indexer for ${appPath}`);
  }
}

/**
 * Stop all incremental indexers
 */
export async function stopAllIncrementalIndexers(): Promise<void> {
  logger.info("Stopping all incremental indexers...");

  const promises = Array.from(watchers.values()).map((indexer) =>
    indexer.stop(),
  );

  await Promise.all(promises);
  watchers.clear();

  logger.info("All incremental indexers stopped");
}
