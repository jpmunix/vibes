/**
 * Register embeddings IPC handlers
 */

import { ipcMain } from "electron";
import { embeddingsContracts } from "../types/embeddings";
import {
  handleClearAndReindex,
  handleClearIndex,
  handleGetEmbeddings,
  handleGetIndexStats,
  handleIndexAllFiles,
  handleSearchSimilarFiles,
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

  ipcMain.handle(
    embeddingsContracts.clearIndex.channel,
    async (event, input) => {
      const validated = embeddingsContracts.clearIndex.input.parse(input);
      const result = await handleClearIndex(event, validated);
      return embeddingsContracts.clearIndex.output.parse(result);
    },
  );

  ipcMain.handle(
    embeddingsContracts.clearAndReindex.channel,
    async (event, input) => {
      const validated = embeddingsContracts.clearAndReindex.input.parse(input);
      const result = await handleClearAndReindex(event, validated);
      return embeddingsContracts.clearAndReindex.output.parse(result);
    },
  );
}
