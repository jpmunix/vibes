import { z } from "zod";
import { defineContract, createClient } from "../contracts/core";

export const backupContracts = {
    performBackup: defineContract({
        channel: "backup:perform",
        input: z.object({
            includeSettings: z.boolean(),
            includeDatabase: z.boolean(),
            includeStats: z.boolean(),
        }),
        output: z.object({
            success: z.boolean(),
            message: z.string(),
            backupData: z.array(z.object({
                name: z.string(),
                content: z.string(), // base64
                contentType: z.string(),
            })),
        }),
    }),
} as const;

export const backupClient = createClient(backupContracts);
