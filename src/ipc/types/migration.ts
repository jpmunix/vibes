import { z } from "zod";
import { defineContract, defineEvent, createClient, createEventClient } from "../contracts/core";

// =============================================================================
// Migration Schemas
// =============================================================================

export const MigrationProgressSchema = z.object({
    phase: z.string(),
    table: z.string(),
    current: z.number(),
    total: z.number(),
    percentage: z.number(),
});

export type MigrationProgress = z.infer<typeof MigrationProgressSchema>;

// =============================================================================
// Migration Contracts
// =============================================================================

export const migrationContracts = {
    startMigration: defineContract({
        channel: "migration:start",
        input: z.object({
            userId: z.string(),
        }),
        output: z.object({
            success: z.boolean(),
            tablesProcessed: z.number(),
            totalRows: z.number(),
        }),
    }),

    getMigrationEstimate: defineContract({
        channel: "migration:estimate",
        input: z.void(),
        output: z.object({
            tables: z.array(z.object({
                name: z.string(),
                rowCount: z.number(),
            })),
            totalRows: z.number(),
        }),
    }),

    resetMigration: defineContract({
        channel: "migration:reset",
        input: z.object({
            userId: z.string(),
        }),
        output: z.object({
            success: z.boolean(),
        }),
    }),
} as const;

// =============================================================================
// Migration Events (main → renderer progress updates)
// =============================================================================

export const migrationEvents = {
    progress: defineEvent({
        channel: "migration:progress",
        payload: MigrationProgressSchema,
    }),
} as const;

// =============================================================================
// Clients
// =============================================================================

export const migrationClient = createClient(migrationContracts);
export const migrationEventClient = createEventClient(migrationEvents);
