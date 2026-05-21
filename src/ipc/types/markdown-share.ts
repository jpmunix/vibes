import { z } from "zod";
import { defineContract, createClient } from "../contracts/core";

// =============================================================================
// Schemas
// =============================================================================

export const MarkdownShareDocumentSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  format: z.enum(["md", "txt"]),
  share_id: z.string(),
  share_url: z.string(),
  created_at: z.number(),
});

export type MarkdownShareDocument = z.infer<typeof MarkdownShareDocumentSchema>;

// =============================================================================
// Contracts
// =============================================================================

export const markdownShareContracts = {
  /**
   * Upload a document to md.mnstatic.com.
   * Uses the current user's ID as the API key.
   */
  uploadDocument: defineContract({
    channel: "markdown-share:upload",
    input: z.object({
      id: z.string().optional(),
      title: z.string(),
      content: z.string(),
      format: z.enum(["md", "txt"]).default("md"),
    }),
    output: z.object({
      data: MarkdownShareDocumentSchema,
    }),
  }),
} as const;

// =============================================================================
// Client
// =============================================================================

export const markdownShareClient = createClient(markdownShareContracts);
