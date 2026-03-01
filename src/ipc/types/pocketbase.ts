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

    listCollections: defineContract({
        channel: "pocketbase:list-collections",
        input: z.object({ appId: z.number() }),
        output: z.object({
            collections: z.array(z.object({
                id: z.string(),
                name: z.string(),
                type: z.string(),
                system: z.boolean(),
                fields: z.array(z.object({
                    name: z.string(),
                    type: z.string(),
                    required: z.boolean(),
                })),
            })),
            error: z.string().optional(),
        }),
    }),
} as const;

export const pocketbaseClient = createClient(pocketbaseContracts);
