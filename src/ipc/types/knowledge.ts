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
    "stack-rules",
]);
export type KnowledgeCategory = z.infer<typeof KnowledgeCategorySchema>;

export const KnowledgeSourceSchema = z.enum([
    "manual",
    "auto-extracted",
    "inferred",
]);
export type KnowledgeSource = z.infer<typeof KnowledgeSourceSchema>;

export const KnowledgeDurabilitySchema = z.enum([
    "permanent",
    "project-phase",
    "temporary",
]);
export type KnowledgeDurability = z.infer<typeof KnowledgeDurabilitySchema>;

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
    durability: KnowledgeDurabilitySchema.nullable().optional(),
    supersededBy: z.number().nullable().optional(),
    lastConfirmedAt: z.union([z.date(), z.string(), z.null()]).optional(),
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

/**
 * Schema for bulk operations on knowledge entries.
 */
export const BulkKnowledgeParamsSchema = z.object({
    entryIds: z.array(z.number()),
});

export type BulkKnowledgeParams = z.infer<typeof BulkKnowledgeParamsSchema>;

/**
 * Schema for knowledge health analysis result.
 */
export const KnowledgeHealthResultSchema = z.object({
    noise: z.array(z.number()),
    redundant: z.array(
        z.object({
            keep: z.number(),
            remove: z.array(z.number()),
        }),
    ),
    contradictions: z.array(
        z.object({
            entryA: z.number(),
            entryB: z.number(),
        }),
    ),
});

export type KnowledgeHealthResult = z.infer<typeof KnowledgeHealthResultSchema>;

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

    /** Decay confidence of unconfirmed auto-extracted entries */
    decayKnowledge: defineContract({
        channel: "decay-knowledge",
        input: z.number(), // appId
        output: z.number(), // number of decayed entries
    }),

    /** Analyze knowledge health — identify noise, redundancies, contradictions */
    analyzeKnowledgeHealth: defineContract({
        channel: "analyze-knowledge-health",
        input: z.number(), // appId
        output: KnowledgeHealthResultSchema,
    }),

    /** Bulk disable knowledge entries by IDs */
    bulkDisableKnowledge: defineContract({
        channel: "bulk-disable-knowledge",
        input: BulkKnowledgeParamsSchema,
        output: z.number(), // number of disabled entries
    }),

    /** Bulk approve pending knowledge entries by IDs */
    bulkApproveKnowledge: defineContract({
        channel: "bulk-approve-knowledge",
        input: BulkKnowledgeParamsSchema,
        output: z.number(), // number of approved entries
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
 * const health = await knowledgeClient.analyzeKnowledgeHealth(appId);
 */
export const knowledgeClient = createClient(knowledgeContracts);
