/**
 * Local vector index using SQLite for semantic code search
 * Stores file embeddings and enables fast similarity search
 */

import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import log from "electron-log";
import { embed, cosineSimilarity } from "./embeddings";
import { CodebaseFile } from "@/utils/codebase";
import { getUserDataPath } from "../../paths/paths";

const logger = log.scope("vector_index");

interface VectorSearchResult {
  path: string;
  distance: number;
  chunkIndex: number;
  totalChunks: number;
}

/**
 * Local vector index for semantic code search
 * Stores file chunks with their embeddings in SQLite
 */
export class LocalVectorIndex {
  private db: Database.Database | null = null;
  private dbInitPromise: Promise<void> | null = null;
  private appPath: string;
  private indexPath: string;

  constructor(appPath: string) {
    this.appPath = appPath;

    // Store index in userData directory to avoid polluting project directories
    // Create a hash of the app path to uniquely identify each project
    const pathHash = crypto
      .createHash("sha256")
      .update(appPath)
      .digest("hex")
      .slice(0, 16);

    const indexesDir = path.join(getUserDataPath(), "embeddings-indexes");
    if (!fs.existsSync(indexesDir)) {
      fs.mkdirSync(indexesDir, { recursive: true });
    }

    this.indexPath = path.join(indexesDir, `vector_index_${pathHash}.db`);

    // Defer DB initialization to avoid blocking on construction
    // DB will be lazily initialized when first accessed
    this.dbInitPromise = new Promise((resolve, reject) => {
      setImmediate(() => {
        try {
          this.db = new Database(this.indexPath);

          // Enable WAL mode for better concurrency
          this.db.pragma("journal_mode = WAL");

          // Create tables
          this.db.exec(`
            CREATE TABLE IF NOT EXISTS file_metadata (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              path TEXT NOT NULL,
              content_hash TEXT NOT NULL,
              last_indexed INTEGER NOT NULL,
              chunk_index INTEGER NOT NULL,
              total_chunks INTEGER NOT NULL,
              UNIQUE(path, chunk_index)
            );

            CREATE INDEX IF NOT EXISTS idx_file_path ON file_metadata(path);
            CREATE INDEX IF NOT EXISTS idx_content_hash ON file_metadata(content_hash);

            CREATE TABLE IF NOT EXISTS file_embeddings (
              file_id INTEGER NOT NULL,
              embedding BLOB NOT NULL,
              FOREIGN KEY(file_id) REFERENCES file_metadata(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_file_id ON file_embeddings(file_id);
          `);

          logger.info(`Vector index initialized at ${this.indexPath}`);

          // Clean up old .dyad directory if it exists in the project
          this.cleanupOldIndexLocation();

          resolve();
        } catch (error) {
          logger.error("Error initializing vector index:", error);
          reject(error);
        }
      });
    });
  }

  /**
   * Ensure database is initialized before using it
   */
  private async ensureDbReady(): Promise<Database.Database> {
    if (this.dbInitPromise) {
      await this.dbInitPromise;
    }
    if (!this.db) {
      throw new Error("Database initialization failed");
    }
    return this.db;
  }

  /**
   * Cleans up old index files that were stored in the project's .dyad directory
   * This is a migration from the old storage location to the new userData location
   */
  private cleanupOldIndexLocation() {
    try {
      const oldDyadDir = path.join(this.appPath, ".dyad");
      const oldIndexPath = path.join(oldDyadDir, "vector_index.db");

      if (fs.existsSync(oldIndexPath)) {
        logger.info(`Cleaning up old index at ${oldIndexPath}`);
        fs.unlinkSync(oldIndexPath);

        // Also remove WAL files if they exist
        const walPath = `${oldIndexPath}-wal`;
        const shmPath = `${oldIndexPath}-shm`;
        if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
        if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);

        // Try to remove .dyad directory if it's empty
        try {
          const files = fs.readdirSync(oldDyadDir);
          if (files.length === 0) {
            fs.rmdirSync(oldDyadDir);
            logger.info(`Removed empty .dyad directory`);
          }
        } catch {
          // Directory not empty or doesn't exist, ignore
        }
      }
    } catch (error) {
      logger.warn("Error cleaning up old index location:", error);
      // Don't throw - this is just cleanup
    }
  }

  /**
   * Chunk content into smaller pieces for better embedding quality
   * Tries to split at function/class boundaries for code
   */
  private chunkContent(content: string, maxChars: number = 1500): string[] {
    const chunks: string[] = [];

    // If content is small enough, return as single chunk
    if (content.length <= maxChars) {
      return [content];
    }

    // Try to split at function boundaries (simple heuristic)
    const lines = content.split("\n");
    let currentChunk = "";

    for (const line of lines) {
      // If adding this line would exceed limit and we have content, save chunk
      if (
        currentChunk.length + line.length > maxChars &&
        currentChunk.length > 0
      ) {
        chunks.push(currentChunk);
        currentChunk = "";
      }

      currentChunk += line + "\n";
    }

    // Add remaining content
    if (currentChunk.trim()) {
      chunks.push(currentChunk);
    }

    return chunks.length > 0 ? chunks : [content];
  }

  /**
   * Add or update a file in the index
   * If file content hasn't changed, skip re-indexing
   */
  async addFile(filePath: string, content: string): Promise<void> {
    try {
      const db = await this.ensureDbReady();
      const hash = crypto.createHash("sha256").update(content).digest("hex");

      // Check if file already indexed with same content
      const existing = db
        .prepare(
          "SELECT content_hash FROM file_metadata WHERE path = ? LIMIT 1",
        )
        .get(filePath) as { content_hash: string } | undefined;

      if (existing?.content_hash === hash) {
        // File unchanged, skip re-indexing
        return;
      }

      // Delete old entries for this file
      db.prepare("DELETE FROM file_metadata WHERE path = ?").run(filePath);

      // Chunk content for better embedding quality
      const chunks = this.chunkContent(content);

      // Generate embeddings for all chunks
      const embeddings = await Promise.all(chunks.map((chunk) => embed(chunk)));

      // Insert new entries in transaction
      const insertMetadata = db.prepare(`
        INSERT INTO file_metadata (path, content_hash, last_indexed, chunk_index, total_chunks)
        VALUES (?, ?, ?, ?, ?)
      `);

      const insertEmbedding = db.prepare(`
        INSERT INTO file_embeddings (file_id, embedding)
        VALUES (?, ?)
      `);

      db.transaction(() => {
        for (let i = 0; i < chunks.length; i++) {
          const result = insertMetadata.run(
            filePath,
            hash,
            Date.now(),
            i,
            chunks.length,
          );

          const fileId = result.lastInsertRowid;

          // Store embedding as Buffer
          const embeddingBuffer = Buffer.from(embeddings[i].buffer);
          insertEmbedding.run(fileId, embeddingBuffer);
        }
      })();

      logger.debug(
        `Indexed ${filePath} (${chunks.length} chunks, ${content.length} chars)`,
      );
    } catch (error) {
      logger.error(`Error indexing file ${filePath}:`, error);
    }
  }

  /**
   * Search for files similar to the query
   * Returns file paths sorted by relevance
   */
  async search(query: string, maxResults: number = 15): Promise<string[]> {
    try {
      const db = await this.ensureDbReady();
      // Generate query embedding
      const queryEmbedding = await embed(query);

      // Get all embeddings from database
      const rows = db
        .prepare(
          `
        SELECT
          fm.path,
          fm.chunk_index,
          fm.total_chunks,
          fe.embedding
        FROM file_embeddings fe
        JOIN file_metadata fm ON fe.file_id = fm.id
      `,
        )
        .all() as Array<{
        path: string;
        chunk_index: number;
        total_chunks: number;
        embedding: Buffer;
      }>;

      // Calculate similarities
      const results: VectorSearchResult[] = rows.map((row) => {
        const embedding = new Float32Array(row.embedding.buffer);
        const similarity = cosineSimilarity(queryEmbedding, embedding);

        // Convert similarity (0-1) to distance (smaller is better)
        const distance = 1 - similarity;

        return {
          path: row.path,
          distance,
          chunkIndex: row.chunk_index,
          totalChunks: row.total_chunks,
        };
      });

      // Group by file path and take best chunk score per file
      const fileScores = new Map<string, number>();

      for (const result of results) {
        const existingScore = fileScores.get(result.path);
        if (existingScore === undefined || result.distance < existingScore) {
          fileScores.set(result.path, result.distance);
        }
      }

      // Sort by distance (ascending) and take top results
      const sortedFiles = Array.from(fileScores.entries())
        .sort((a, b) => a[1] - b[1])
        .slice(0, maxResults)
        .map((entry) => entry[0]);

      logger.debug(
        `Search for "${query.slice(0, 50)}" returned ${sortedFiles.length} files`,
      );

      return sortedFiles;
    } catch (error) {
      logger.error("Error searching vector index:", error);
      return [];
    }
  }

  /**
   * Process files with limited concurrency to avoid CPU overload
   * @param files Files to process
   * @param concurrency Maximum number of concurrent operations
   */
  private async processFilesWithLimit(
    files: CodebaseFile[],
    concurrency: number = 3,
  ): Promise<void> {
    const queue = [...files];
    const processing: Promise<void>[] = [];

    while (queue.length > 0 || processing.length > 0) {
      // Fill up to concurrency limit
      while (processing.length < concurrency && queue.length > 0) {
        const file = queue.shift()!;
        const promise = this.addFile(file.path, file.content)
          .then(() => {
            // Remove from processing list when done
            const index = processing.indexOf(promise);
            if (index > -1) {
              processing.splice(index, 1);
            }
          })
          .catch((error) => {
            logger.error(`Error processing ${file.path}:`, error);
            // Remove from processing list even on error
            const index = processing.indexOf(promise);
            if (index > -1) {
              processing.splice(index, 1);
            }
          });

        processing.push(promise);
      }

      // Wait for at least one to complete before continuing
      if (processing.length > 0) {
        await Promise.race(processing);
      }

      // Add small delay to prevent CPU saturation
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  /**
   * Add multiple files to the index
   * Processes with limited concurrency and throttling to prevent CPU overload
   */
  async addFiles(
    files: CodebaseFile[],
    maxConcurrency: number = 3,
  ): Promise<void> {
    logger.info(
      `Indexing ${files.length} files with concurrency ${maxConcurrency}...`,
    );

    await this.processFilesWithLimit(files, maxConcurrency);

    logger.info(`Finished indexing ${files.length} files`);
  }

  /**
   * Get statistics about the index
   * Returns zeros if DB not ready yet (non-blocking)
   */
  getStats(): {
    totalFiles: number;
    totalChunks: number;
    indexSize: number;
  } {
    // Return empty stats if DB not ready (don't block)
    if (!this.db) {
      return {
        totalFiles: 0,
        totalChunks: 0,
        indexSize: 0,
      };
    }

    const fileCount = this.db
      .prepare("SELECT COUNT(DISTINCT path) as count FROM file_metadata")
      .get() as { count: number };

    const chunkCount = this.db
      .prepare("SELECT COUNT(*) as count FROM file_metadata")
      .get() as { count: number };

    let indexSize = 0;
    try {
      const stats = fs.statSync(this.indexPath);
      indexSize = stats.size;
    } catch {
      // Ignore error
    }

    return {
      totalFiles: fileCount.count,
      totalChunks: chunkCount.count,
      indexSize,
    };
  }

  /**
   * Clear the entire index
   */
  async clear(): Promise<void> {
    const db = await this.ensureDbReady();
    db.exec(`
      DELETE FROM file_embeddings;
      DELETE FROM file_metadata;
    `);
    logger.info("Vector index cleared");
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    if (this.dbInitPromise) {
      await this.dbInitPromise;
    }
    if (this.db) {
      this.db.close();
      logger.info("Vector index closed");
    }
  }
}
