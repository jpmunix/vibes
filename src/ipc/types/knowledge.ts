import { z } from "zod";
import { defineContract, createClient } from "../contracts/core";

// =============================================================================
// Knowledge Base Schemas
// =============================================================================

export const KnowledgeCategorySchema = z.enum([
    "convention",
    "pattern",
    "preference",
    "rule",
    "component",
]);
export type KnowledgeCategory = z.infer<typeof KnowledgeCategorySchema>;

export const KnowledgeSourceSchema = z.enum([
    "manual",
    "auto-extracted",
    "inferred",
]);
export type KnowledgeSource = z.infer<typeof KnowledgeSourceSchema>;

/**
 * Schema for a Knowledge Entry object.
 */
export const KnowledgeEntrySchema = z.object({
    id: z.number(),
    appId: z.number(),
    category: KnowledgeCategorySchema,
    content: z.string(),
    source: KnowledgeSourceSchema,
    confidence: z.number(),
    enabled: z.boolean(),
    createdAt: z.union([z.date(), z.string()]),
    updatedAt: z.union([z.date(), z.string()]),
});

export type KnowledgeEntry = z.infer<typeof KnowledgeEntrySchema>;

/**
 * Schema for creating a knowledge entry.
 */
export const CreateKnowledgeEntryParamsSchema = z.object({
    appId: z.number(),
    category: KnowledgeCategorySchema,
    content: z.string(),
    source: KnowledgeSourceSchema.optional(),
    confidence: z.number().optional(),
});

export type CreateKnowledgeEntryParams = z.infer<
    typeof CreateKnowledgeEntryParamsSchema
>;

/**
 * Schema for updating a knowledge entry.
 */
export const UpdateKnowledgeEntryParamsSchema = z.object({
    id: z.number(),
    category: KnowledgeCategorySchema.optional(),
    content: z.string().optional(),
    confidence: z.number().optional(),
    enabled: z.boolean().optional(),
});

export type UpdateKnowledgeEntryParams = z.infer<
    typeof UpdateKnowledgeEntryParamsSchema
>;

/**
 * Schema for batch auto-extraction params (after chat stream).
 */
export const ExtractKnowledgeParamsSchema = z.object({
    appId: z.number(),
    chatId: z.number(),
    assistantResponse: z.string(),
    userPrompt: z.string(),
});

export type ExtractKnowledgeParams = z.infer<
    typeof ExtractKnowledgeParamsSchema
>;

// =============================================================================
// Knowledge Base Contracts (Invoke/Response)
// =============================================================================

export const knowledgeContracts = {
    getKnowledgeEntries: defineContract({
        channel: "get-knowledge-entries",
        input: z.number(), // appId
        output: z.array(KnowledgeEntrySchema),
    }),

    createKnowledgeEntry: defineContract({
        channel: "create-knowledge-entry",
        input: CreateKnowledgeEntryParamsSchema,
        output: z.number(), // entryId
    }),

    updateKnowledgeEntry: defineContract({
        channel: "update-knowledge-entry",
        input: UpdateKnowledgeEntryParamsSchema,
        output: z.void(),
    }),

    deleteKnowledgeEntry: defineContract({
        channel: "delete-knowledge-entry",
        input: z.number(), // entryId
        output: z.void(),
    }),

    /** Get the compressed knowledge base prompt for an app */
    getKnowledgePrompt: defineContract({
        channel: "get-knowledge-prompt",
        input: z.number(), // appId
        output: z.string(), // compressed prompt string
    }),

    /** Trigger extraction of knowledge from a chat response */
    extractKnowledge: defineContract({
        channel: "extract-knowledge",
        input: ExtractKnowledgeParamsSchema,
        output: z.array(KnowledgeEntrySchema), // newly extracted entries
    }),
} as const;

// =============================================================================
// Knowledge Base Client
// =============================================================================

/**
 * Type-safe client for Knowledge Base IPC operations.
 * Auto-generated from contracts.
 *
 * @example
 * const entries = await knowledgeClient.getKnowledgeEntries(appId);
 * const prompt = await knowledgeClient.getKnowledgePrompt(appId);
 */
export const knowledgeClient = createClient(knowledgeContracts);
