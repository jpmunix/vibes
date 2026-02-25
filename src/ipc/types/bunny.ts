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
} as const;

// =============================================================================
// Bunny.net Client
// =============================================================================

export const bunnyClient = createClient(bunnyContracts);
