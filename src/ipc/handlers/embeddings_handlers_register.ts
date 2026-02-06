/**
 * Register embeddings IPC handlers
 */

import { ipcMain } from "electron";
import { embeddingsContracts } from "../types/embeddings";
import {
  handleGetEmbeddings,
  handleSearchSimilarFiles,
  handleGetIndexStats,
  handleIndexAllFiles,
} from "./embeddings_handlers";

export function registerEmbeddingsHandlers() {
  ipcMain.handle(
    embeddingsContracts.getEmbeddings.channel,
    async (event, input) => {
      const validated = embeddingsContracts.getEmbeddings.input.parse(input);
      const result = await handleGetEmbeddings(event, validated);
      return embeddingsContracts.getEmbeddings.output.parse(result);
    },
  );

  ipcMain.handle(
    embeddingsContracts.searchSimilarFiles.channel,
    async (event, input) => {
      const validated =
        embeddingsContracts.searchSimilarFiles.input.parse(input);
      const result = await handleSearchSimilarFiles(event, validated);
      return embeddingsContracts.searchSimilarFiles.output.parse(result);
    },
  );

  ipcMain.handle(
    embeddingsContracts.getIndexStats.channel,
    async (event, input) => {
      const validated = embeddingsContracts.getIndexStats.input.parse(input);
      const result = await handleGetIndexStats(event, validated);
      return embeddingsContracts.getIndexStats.output.parse(result);
    },
  );

  ipcMain.handle(
    embeddingsContracts.indexAllFiles.channel,
    async (event, input) => {
      const validated = embeddingsContracts.indexAllFiles.input.parse(input);
      const result = await handleIndexAllFiles(event, validated);
      return embeddingsContracts.indexAllFiles.output.parse(result);
    },
  );
}
