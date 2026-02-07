/**
 * IPC contracts for embeddings playground
 */

import { z } from "zod";
import { defineContract, createClient } from "../contracts/core";

// =============================================================================
// Input/Output Schemas
// =============================================================================

const GetEmbeddingsInputSchema = z.object({
  text: z.string(),
});

const GetEmbeddingsOutputSchema = z.custom<Float32Array>(
  (val) => val instanceof Float32Array,
  "Must be a Float32Array",
);

const SearchSimilarFilesInputSchema = z.object({
  appPath: z.string(),
  query: z.string(),
  maxResults: z.number().optional(),
});

const SearchSimilarFilesOutputSchema = z.array(
  z.object({
    path: z.string(),
    score: z.number(),
    snippet: z.string(),
  }),
);

const GetIndexStatsInputSchema = z.object({
  appPath: z.string(),
});

const GetIndexStatsOutputSchema = z.object({
  totalFiles: z.number(),
  totalChunks: z.number(),
  indexSize: z.number(),
});

const IndexAllFilesInputSchema = z.object({
  appPath: z.string(),
});

const IndexAllFilesOutputSchema = z.object({
  success: z.boolean(),
  filesIndexed: z.number(),
});

// =============================================================================
// Contract Definitions
// =============================================================================

export const embeddingsContracts = {
  getEmbeddings: defineContract({
    channel: "embeddings:getEmbeddings",
    input: GetEmbeddingsInputSchema,
    output: GetEmbeddingsOutputSchema,
  }),
  searchSimilarFiles: defineContract({
    channel: "embeddings:searchSimilarFiles",
    input: SearchSimilarFilesInputSchema,
    output: SearchSimilarFilesOutputSchema,
  }),
  getIndexStats: defineContract({
    channel: "embeddings:getIndexStats",
    input: GetIndexStatsInputSchema,
    output: GetIndexStatsOutputSchema,
  }),
  indexAllFiles: defineContract({
    channel: "embeddings:indexAllFiles",
    input: IndexAllFilesInputSchema,
    output: IndexAllFilesOutputSchema,
  }),
};

// =============================================================================
// Type Exports
// =============================================================================

export type GetEmbeddingsInput = z.infer<typeof GetEmbeddingsInputSchema>;
export type GetEmbeddingsOutput = z.infer<typeof GetEmbeddingsOutputSchema>;
export type SearchSimilarFilesInput = z.infer<
  typeof SearchSimilarFilesInputSchema
>;
export type SearchSimilarFilesOutput = z.infer<
  typeof SearchSimilarFilesOutputSchema
>;
export type GetIndexStatsInput = z.infer<typeof GetIndexStatsInputSchema>;
export type GetIndexStatsOutput = z.infer<typeof GetIndexStatsOutputSchema>;
export type IndexAllFilesInput = z.infer<typeof IndexAllFilesInputSchema>;
export type IndexAllFilesOutput = z.infer<typeof IndexAllFilesOutputSchema>;

// =============================================================================
// Client Export
// =============================================================================

const baseClient = createClient(embeddingsContracts);

export const embeddingsClient = {
  getEmbeddings: (text: string) => baseClient.getEmbeddings({ text }),
  searchSimilarFiles: (params: SearchSimilarFilesInput) =>
    baseClient.searchSimilarFiles(params),
  getIndexStats: (appPath: string) => baseClient.getIndexStats({ appPath }),
  indexAllFiles: (appPath: string) => baseClient.indexAllFiles({ appPath }),
};
