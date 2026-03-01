import { z } from "zod";
import { defineContract, createClient } from "../contracts/core";

// =============================================================================
// Bunny.net Schemas
// =============================================================================

export const BunnyDatabaseEntrySchema = z.object({
    name: z.string().min(1),
    databaseUrl: z.string().min(1),
    fullAccessToken: z.string().min(1),
    readOnlyToken: z.string(),
});

export type BunnyDatabaseEntry = z.infer<typeof BunnyDatabaseEntrySchema>;

export const BunnyStorageZoneEntrySchema = z.object({
    name: z.string().min(1),
    hostname: z.string().min(1),
    username: z.string().min(1),
    password: z.string().min(1),
    readonlyPassword: z.string(),
});

export type BunnyStorageZoneEntry = z.infer<typeof BunnyStorageZoneEntrySchema>;

export const BunnyConfigSchema = z.object({
    databases: z.array(BunnyDatabaseEntrySchema),
    storageZones: z.array(BunnyStorageZoneEntrySchema),
});

export type BunnyConfig = z.infer<typeof BunnyConfigSchema>;

// =============================================================================
// Bunny.net Contracts
// =============================================================================

export const bunnyContracts = {
    getConfig: defineContract({
        channel: "bunny:get-config",
        input: z.object({ appId: z.number() }),
        output: BunnyConfigSchema.nullable(),
    }),

    setConfig: defineContract({
        channel: "bunny:set-config",
        input: z.object({
            appId: z.number(),
            config: BunnyConfigSchema,
        }),
        output: z.void(),
    }),

    clearConfig: defineContract({
        channel: "bunny:clear-config",
        input: z.object({ appId: z.number() }),
        output: z.void(),
    }),

    uploadAvatar: defineContract({
        channel: "bunny:upload-avatar",
        input: z.object({
            fileName: z.string(),
            data: z.any(),
            contentType: z.string().optional(),
        }),
        output: z.string(),
    }),

    // Database viewer
    listTables: defineContract({
        channel: "bunny:list-tables",
        input: z.object({ appId: z.number() }),
        output: z.object({
            tables: z.array(z.object({
                name: z.string(),
                rowCount: z.number(),
                columns: z.array(z.object({
                    name: z.string(),
                    type: z.string(),
                    nullable: z.boolean(),
                    defaultValue: z.any().nullable(),
                    isPrimaryKey: z.boolean(),
                })),
            })),
        }),
    }),

    queryTable: defineContract({
        channel: "bunny:query-table",
        input: z.object({
            appId: z.number(),
            table: z.string(),
            page: z.number().optional(),
            pageSize: z.number().optional(),
            orderBy: z.string().optional(),
            orderDir: z.enum(["asc", "desc"]).optional(),
            filters: z.array(z.object({
                column: z.string(),
                operator: z.string(),
                value: z.any().optional(),
            })).optional(),
        }),
        output: z.object({
            rows: z.array(z.any()),
            totalCount: z.number(),
            columns: z.array(z.string()),
        }),
    }),

    executeQuery: defineContract({
        channel: "bunny:execute-query",
        input: z.object({
            appId: z.number(),
            query: z.string(),
        }),
        output: z.object({
            rows: z.array(z.any()),
            columns: z.array(z.string()),
            rowCount: z.number(),
            error: z.string().optional(),
        }),
    }),

    insertRow: defineContract({
        channel: "bunny:insert-row",
        input: z.object({
            appId: z.number(),
            table: z.string(),
            data: z.record(z.string(), z.any()),
        }),
        output: z.object({
            success: z.boolean(),
            row: z.any().optional(),
        }),
    }),

    updateRow: defineContract({
        channel: "bunny:update-row",
        input: z.object({
            appId: z.number(),
            table: z.string(),
            primaryKey: z.record(z.string(), z.any()),
            data: z.record(z.string(), z.any()),
        }),
        output: z.object({
            success: z.boolean(),
        }),
    }),

    deleteRows: defineContract({
        channel: "bunny:delete-rows",
        input: z.object({
            appId: z.number(),
            table: z.string(),
            primaryKeys: z.array(z.record(z.string(), z.any())),
        }),
        output: z.object({
            deletedCount: z.number(),
        }),
    }),
} as const;

// =============================================================================
// Bunny.net Client
// =============================================================================

export const bunnyClient = createClient(bunnyContracts);
