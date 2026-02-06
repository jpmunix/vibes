/**
 * IPC handlers for embeddings playground
 */

import { IpcMainInvokeEvent } from "electron";
import { embed } from "../utils/embeddings";
import { getIncrementalIndexer } from "../utils/file_watcher";
import {
  GetEmbeddingsInput,
  GetEmbeddingsOutput,
  SearchSimilarFilesInput,
  SearchSimilarFilesOutput,
  GetIndexStatsInput,
  GetIndexStatsOutput,
  IndexAllFilesInput,
  IndexAllFilesOutput,
} from "../types/embeddings";

// =============================================================================
// Handler: Get Embeddings
// =============================================================================

export async function handleGetEmbeddings(
  _event: IpcMainInvokeEvent,
  input: GetEmbeddingsInput,
): Promise<GetEmbeddingsOutput> {
  const { text } = input;

  if (!text || text.trim().length === 0) {
    throw new Error("El texto no puede estar vacío");
  }

  try {
    const embeddings = await embed(text);
    return embeddings as Float32Array;
  } catch (error) {
    console.error("Error generando embeddings:", error);
    throw new Error(
      `Error al generar embeddings: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// =============================================================================
// Handler: Search Similar Files
// =============================================================================

export async function handleSearchSimilarFiles(
  _event: IpcMainInvokeEvent,
  input: SearchSimilarFilesInput,
): Promise<SearchSimilarFilesOutput> {
  const { appPath, query, maxResults = 10 } = input;

  if (!appPath || !query) {
    throw new Error("appPath y query son requeridos");
  }

  try {
    // Get or create indexer for this app
    const indexer = getIncrementalIndexer(appPath);
    const index = indexer.getIndex();

    // Search for similar files
    const filePaths = await index.search(query, maxResults);

    // Get file contents and create snippets
    const fs = await import("fs/promises");
    const path = await import("path");

    const results: SearchSimilarFilesOutput = [];

    for (const filePath of filePaths) {
      try {
        const fullPath = path.join(appPath, filePath);
        const content = await fs.readFile(fullPath, "utf-8");

        // Create a snippet (first 200 characters)
        const snippet =
          content.length > 200 ? content.slice(0, 200) + "..." : content;

        // Calculate similarity score (simplified - in reality would use cosine similarity)
        const queryLower = query.toLowerCase();
        const contentLower = content.toLowerCase();
        let score = 0;

        // Count term matches
        const terms = queryLower.split(/\s+/).filter(Boolean);
        for (const term of terms) {
          const matches = contentLower.split(term).length - 1;
          score += matches;
        }

        // Normalize score (0-1 range)
        score = Math.min(score / 10, 1);

        results.push({
          path: filePath,
          score,
          snippet,
        });
      } catch (error) {
        console.error(`Error leyendo archivo ${filePath}:`, error);
        // Skip files that can't be read
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    return results;
  } catch (error) {
    console.error("Error buscando archivos similares:", error);
    throw new Error(
      `Error al buscar archivos: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// =============================================================================
// Handler: Get Index Stats
// =============================================================================

export async function handleGetIndexStats(
  _event: IpcMainInvokeEvent,
  input: GetIndexStatsInput,
): Promise<GetIndexStatsOutput> {
  const { appPath } = input;

  if (!appPath) {
    throw new Error("appPath es requerido");
  }

  try {
    // Get or create indexer for this app
    const indexer = getIncrementalIndexer(appPath);
    const index = indexer.getIndex();

    // Get stats from the index
    const stats = index.getStats();

    return stats;
  } catch (error) {
    console.error("Error obteniendo estadísticas del índice:", error);
    throw new Error(
      `Error al obtener estadísticas: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// =============================================================================
// Handler: Index All Files
// =============================================================================

export async function handleIndexAllFiles(
  _event: IpcMainInvokeEvent,
  input: IndexAllFilesInput,
): Promise<IndexAllFilesOutput> {
  const { appPath } = input;

  if (!appPath) {
    throw new Error("appPath es requerido");
  }

  try {
    console.log(`[embeddings] Starting indexAllFiles for: ${appPath}`);

    // Get or create indexer for this app
    const indexer = getIncrementalIndexer(appPath);

    // Index all files - now returns count of indexed files
    const filesIndexed = await indexer.indexAllFiles();

    console.log(`[embeddings] Indexed ${filesIndexed} files`);

    // Get updated stats
    const stats = indexer.getIndex().getStats();
    console.log(
      `[embeddings] Stats: ${stats.totalFiles} files, ${stats.totalChunks} chunks`,
    );

    return {
      success: true,
      filesIndexed,
    };
  } catch (error) {
    console.error("Error indexando archivos:", error);
    throw new Error(
      `Error al indexar archivos: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
