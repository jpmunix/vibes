/**
 * Incremental file watcher for automatic index updates
 * Watches for file changes and updates the vector index in background
 */

import path from "node:path";
import { readFileWithCache } from "@/utils/codebase";
import type { FSWatcher } from "chokidar";
import chokidar from "chokidar";
import log from "electron-log";
import { LocalVectorIndex } from "./vector_index";

const logger = log.scope("file_watcher");

/**
 * Manages incremental indexing of files as they change
 */
export class IncrementalIndexer {
  private watcher: FSWatcher | null = null;
  private index: LocalVectorIndex;
  private pendingFiles: Set<string> = new Set();
  private indexTimer: NodeJS.Timeout | null = null;
  private isIndexing = false;
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
      ignored: (filePath) => {
        // Exclude dotfiles
        if (/(^|[/\\])\../.test(filePath)) return true;

        // Exclude specific directories
        const excludeDirs = [
          "node_modules",
          ".git",
          ".vite",
          "dist",
          "build",
          ".next",
          ".venv",
          "venv",
          ".dyad",
        ];

        // Check if path contains any of the exclude dirs
        // matches /dir/ or /dir at the end
        const regex = new RegExp(`[\\\\/](${excludeDirs.map(d => d.replace('.', '\\.')).join('|')})([\\\\/]|$)`);
        return regex.test(filePath);
      },
      persistent: true,
      ignoreInitial: true, // Don't trigger for existing files
      ignorePermissionErrors: true,
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
   * Directories to exclude from indexing
   */
  private excludedDirs = [
    "node_modules",
    ".git",
    ".vite",
    "dist",
    "build",
    ".next",
    ".venv",
    "venv",
    ".dyad",
  ];

  /**
   * Handle file change event
   */
  private onFileChange(filePath: string): void {
    // Skip files in excluded directories
    const normalizedPath = filePath.toLowerCase();
    if (this.excludedDirs.some((dir) => normalizedPath.includes(`/${dir}/`))) {
      return;
    }

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
   * @param onProgress - Optional callback to report progress (current, total)
   */
  async indexAllFiles(
    onProgress?: (current: number, total: number) => void,
  ): Promise<number> {
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
    // Use brace expansion for a single pass
    // Remove dots from extensions for brace pattern
    const extensionsPattern = allowedExtensions.map(ext => ext.substring(1)).join(',');
    const pattern = `**/*.{${extensionsPattern}}`;
    let allFiles: string[] = [];

    // Directories to always exclude from indexing
    const excludeDirs = [
      "node_modules",
      ".git",
      ".vite",
      "dist",
      "build",
      ".next",
      ".venv",
      "venv",
      ".dyad",
    ];

    logger.debug(`Searching for pattern ${pattern} in ${this.appPath}`);

    try {
      // Use a single glob call which is much more efficient
      // Cast to any because @types/glob is v8 but glob is v11
      const files = await (glob as any)(pattern, {
        cwd: this.appPath,
        absolute: true,
        ignore: excludeDirs.map((dir) => `**/${dir}/**`),
        nodir: true,
      }) as string[];

      // Extra safety filter - ensure no excluded directories slip through
      // This is redundant if glob ignore works, but good for safety
      const filteredFiles = files.filter((file) => {
        const normalizedPath = file.toLowerCase();
        // Check if path contains any excluded directory
        // Use regex for performance similar to watcher
        const excludeRegex = new RegExp(`[\\\\/](${excludeDirs.map(d => d.replace('.', '\\.')).join('|')})([\\\\/]|$)`);
        return !excludeRegex.test(normalizedPath);
      });

      if (files.length !== filteredFiles.length) {
        logger.warn(
          `Filtered out ${files.length - filteredFiles.length} files from excluded directories`,
        );
      }

      logger.debug(
        `Found ${filteredFiles.length} files to index`,
      );
      allFiles = filteredFiles;
    } catch (error) {
      logger.error(`Error during file scan: ${error}`);
      return 0;
    }

    logger.info(`Found ${allFiles.length} files to index`);

    if (allFiles.length === 0) {
      logger.warn(`No files found to index in ${this.appPath}`);
      return 0;
    }

    // Process files one at a time with delays to keep UI responsive
    // Using sequential processing instead of parallel to avoid blocking the main thread
    let indexedCount = 0;

    for (let i = 0; i < allFiles.length; i++) {
      const filePath = allFiles[i];

      try {
        const relativePath = path.relative(this.appPath, filePath);
        const content = await readFileWithCache(filePath);

        if (content != null && content.length > 0) {
          await this.index.addFile(relativePath, content);
          indexedCount++;
        }
      } catch (error) {
        logger.error(`Error indexing file ${filePath}:`, error);
      }

      // Report progress
      if (onProgress) {
        onProgress(i + 1, allFiles.length);
      }

      // Log progress every 5 files
      if ((i + 1) % 10 === 0 || i === allFiles.length - 1) {
        logger.debug(
          `Indexed ${i + 1}/${allFiles.length} files (${indexedCount} successful)`,
        );
      }

      // Yield to event loop after every file to keep UI responsive
      // Use setTimeout with 200ms to give UI plenty of time to process events
      // This is important during app generation when the user is actively using the UI
      if (i < allFiles.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 200));
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

  /**
   * Clear the entire index and reindex from scratch
   */
  async clearAndReindex(): Promise<number> {
    logger.info(`Clearing index for ${this.appPath}...`);
    await this.index.clear();
    logger.info(`Index cleared, starting reindex...`);
    return this.indexAllFiles();
  }

  /**
   * Clear the entire index without reindexing
   */
  async clearIndex(): Promise<void> {
    logger.info(`Clearing index for ${this.appPath}...`);
    await this.index.clear();
    logger.info(`Index cleared for ${this.appPath}`);
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
