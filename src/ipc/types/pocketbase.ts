import { z } from "zod";
import { defineContract, createClient } from "../contracts/core";

export const PocketBaseConfigSchema = z.object({
    url: z.string().min(1),
    adminEmail: z.string().min(1),
    adminPassword: z.string().min(1),
});

export type PocketBaseConfig = z.infer<typeof PocketBaseConfigSchema>;

export const pocketbaseContracts = {
    getConfig: defineContract({
        channel: "pocketbase:get-config",
        input: z.object({ appId: z.number() }),
        output: PocketBaseConfigSchema.nullable(),
    }),

    setConfig: defineContract({
        channel: "pocketbase:set-config",
        input: z.object({
            appId: z.number(),
            config: PocketBaseConfigSchema,
        }),
        output: z.void(),
    }),

    clearConfig: defineContract({
        channel: "pocketbase:clear-config",
        input: z.object({ appId: z.number() }),
        output: z.void(),
    }),

    listTables: defineContract({
        channel: "pocketbase:list-tables",
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
        channel: "pocketbase:query-table",
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
        channel: "pocketbase:execute-query",
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
        channel: "pocketbase:insert-row",
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
        channel: "pocketbase:update-row",
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
        channel: "pocketbase:delete-rows",
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

export const pocketbaseClient = createClient(pocketbaseContracts);
