import { z } from "zod";
import { defineContract, createClient } from "../contracts/core";

// =============================================================================
// Memory System Schemas
// =============================================================================

export const MemoryTypeSchema = z.enum([
    "session",
    "preference",
    "issue",
]);
export type MemoryType = z.infer<typeof MemoryTypeSchema>;

export const MemorySourceSchema = z.enum([
    "auto",
    "manual",
]);
export type MemorySource = z.infer<typeof MemorySourceSchema>;

export const IssueStatusSchema = z.enum([
    "active",
    "fix_attempted",
    "suspected_resolved",
    "resolved",
    "deprecated",
]);
export type IssueStatus = z.infer<typeof IssueStatusSchema>;

/**
 * Schema for a Memory Entry object.
 */
export const MemoryEntrySchema = z.object({
    id: z.number(),
    appId: z.number(),
    type: MemoryTypeSchema,
    key: z.string().nullable(),
    content: z.string(),
    importance: z.number(),     // 0.0–1.0
    status: IssueStatusSchema.nullable().optional(),
    source: MemorySourceSchema,
    sourceChatId: z.number().nullable().optional(),
    enabled: z.boolean(),
    createdAt: z.union([z.date(), z.string()]),
    updatedAt: z.union([z.date(), z.string()]),
    lastUsed: z.union([z.date(), z.string()]).nullable().optional(),
});

export type MemoryEntry = z.infer<typeof MemoryEntrySchema>;

/**
 * Schema for creating a memory.
 */
export const CreateMemoryParamsSchema = z.object({
    appId: z.number(),
    type: MemoryTypeSchema,
    key: z.string().nullable().optional(),
    content: z.string(),
    importance: z.number().optional(),
    status: IssueStatusSchema.nullable().optional(),
    source: MemorySourceSchema.optional(),
    sourceChatId: z.number().nullable().optional(),
});

export type CreateMemoryParams = z.infer<typeof CreateMemoryParamsSchema>;

/**
 * Schema for updating a memory.
 */
export const UpdateMemoryParamsSchema = z.object({
    id: z.number(),
    type: MemoryTypeSchema.optional(),
    key: z.string().nullable().optional(),
    content: z.string().optional(),
    importance: z.number().optional(),
    status: IssueStatusSchema.nullable().optional(),
    enabled: z.boolean().optional(),
});

export type UpdateMemoryParams = z.infer<typeof UpdateMemoryParamsSchema>;

/**
 * Schema for extraction params (post-chat-cycle).
 */
export const ExtractMemoriesParamsSchema = z.object({
    appId: z.number(),
    chatId: z.number(),
    userPrompt: z.string(),
    assistantResponse: z.string(),
});

export type ExtractMemoriesParams = z.infer<typeof ExtractMemoriesParamsSchema>;

// =============================================================================
// Memory System Contracts (Invoke/Response)
// =============================================================================

export const memoryContracts = {
    getMemories: defineContract({
        channel: "get-memories",
        input: z.number(), // appId
        output: z.array(MemoryEntrySchema),
    }),

    createMemory: defineContract({
        channel: "create-memory",
        input: CreateMemoryParamsSchema,
        output: z.number(), // memoryId
    }),

    updateMemory: defineContract({
        channel: "update-memory",
        input: UpdateMemoryParamsSchema,
        output: z.void(),
    }),

    deleteMemory: defineContract({
        channel: "delete-memory",
        input: z.number(), // memoryId
        output: z.void(),
    }),

    /** Get formatted memory context for injection into agent instructions */
    getMemoryContext: defineContract({
        channel: "get-memory-context",
        input: z.number(), // appId
        output: z.string(), // formatted memory block
    }),

    /** Trigger extraction of memories from a chat cycle (user + assistant) */
    extractMemories: defineContract({
        channel: "extract-memories",
        input: ExtractMemoriesParamsSchema,
        output: z.array(MemoryEntrySchema),
    }),

    /** Decay importance of stale auto-extracted memories */
    decayMemories: defineContract({
        channel: "decay-memories",
        input: z.number(), // appId
        output: z.number(), // number of decayed entries
    }),

    /** Get ALL memories for the current user (for global stats) */
    getAllMemories: defineContract({
        channel: "get-all-memories",
        input: z.void(),
        output: z.array(MemoryEntrySchema),
    }),

    /** Delete ALL memories for a specific app */
    deleteAllMemories: defineContract({
        channel: "delete-all-memories",
        input: z.number(), // appId
        output: z.number(), // number of deleted entries
    }),

    /** Get memory telemetry stats (last 30 days) */
    getMemoryTelemetryStats: defineContract({
        channel: "get-memory-telemetry-stats",
        input: z.number().optional(), // appId (optional, 0 = all apps)
        output: z.array(z.object({
            action: z.string(),
            count: z.number(),
        })),
    }),

    /** Get recent telemetry events (last 50) for the MemoryAnalyzer UI */
    getMemoryTelemetryRecent: defineContract({
        channel: "get-memory-telemetry-recent",
        input: z.number().optional(), // appId (optional, 0 = all apps)
        output: z.array(z.object({
            action: z.string(),
            reason: z.string().nullable(),
            extractedKeys: z.string().nullable(),
            createdAt: z.string(),
        })),
    }),

    /** Get raw pipeline logs with full payloads */
    getPipelineLogs: defineContract({
        channel: "get-pipeline-logs",
        input: z.object({
            appId: z.number().optional(),
            stage: z.string().optional(),
            limit: z.number().optional(),
        }),
        output: z.array(z.object({
            id: z.number(),
            appId: z.number(),
            chatId: z.number().nullable(),
            stage: z.string(),
            model: z.string().nullable(),
            systemPrompt: z.string().nullable(),
            userMessage: z.string().nullable(),
            rawResponse: z.string().nullable(),
            parsedResult: z.string().nullable(),
            resultCount: z.number(),
            durationMs: z.number().nullable(),
            success: z.number(),
            error: z.string().nullable(),
            createdAt: z.string(),
        })),
    }),

    /** Purge ALL memory stats: telemetry + pipeline logs */
    purgeAllMemoryStats: defineContract({
        channel: "purge-all-memory-stats",
        input: z.void(),
        output: z.object({
            telemetryDeleted: z.number(),
            pipelineLogsDeleted: z.number(),
        }),
    }),

    /** Get apps that have telemetry or pipeline log data */
    getAppsWithAnalyzerData: defineContract({
        channel: "get-apps-with-analyzer-data",
        input: z.void(),
        output: z.array(z.object({
            id: z.number(),
            name: z.string(),
        })),
    }),

    /** Manually trigger memory bootstrap for a project (cold start) */
    bootstrapProjectMemories: defineContract({
        channel: "bootstrap-project-memories",
        input: z.object({ appId: z.number() }),
        output: z.object({
            phase1Count: z.number(),
            phase2Count: z.number(),
        }),
    }),

    /** Get debug logs (complete markdown files from memory pipeline runs) */
    getDebugLogs: defineContract({
        channel: "get-debug-logs",
        input: z.object({
            appId: z.number().optional(),
            limit: z.number().optional(),
        }),
        output: z.array(z.object({
            id: z.number(),
            appId: z.number(),
            appName: z.string(),
            filename: z.string(),
            contentMd: z.string(),
            createdAt: z.string(),
        })),
    }),

    /** Purge debug logs older than 180 days */
    purgeDebugLogs: defineContract({
        channel: "purge-debug-logs",
        input: z.void(),
        output: z.number(), // number deleted
    }),
} as const;

// =============================================================================
// Memory Client
// =============================================================================

/**
 * Type-safe client for Memory System IPC operations.
 * Auto-generated from contracts.
 *
 * @example
 * const memories = await memoryClient.getMemories(appId);
 * const context = await memoryClient.getMemoryContext(appId);
 */
export const memoryClient = createClient(memoryContracts);
