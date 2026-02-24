import { z } from "zod";
import { defineContract, createClient } from "../contracts/core";

// =============================================================================
// Auth Schemas
// =============================================================================

export const VibesUserSchema = z.object({
    id: z.string(),
    email: z.string(),
    displayName: z.string(),
    photoUrl: z.string().nullable(),
    createdAt: z.number(),
});

export type VibesUserDto = z.infer<typeof VibesUserSchema>;

export const AuthResultSchema = z.object({
    user: VibesUserSchema,
    sessionToken: z.string(),
    needsMigration: z.boolean(),
});

export type AuthResult = z.infer<typeof AuthResultSchema>;

// =============================================================================
// Auth Contracts
// =============================================================================

export const authContracts = {
    register: defineContract({
        channel: "auth:register",
        input: z.object({
            email: z.string().min(1),
            password: z.string().min(6),
            displayName: z.string().optional(),
        }),
        output: AuthResultSchema,
    }),

    login: defineContract({
        channel: "auth:login",
        input: z.object({
            email: z.string().min(1),
            password: z.string().min(1),
        }),
        output: AuthResultSchema,
    }),

    verifySession: defineContract({
        channel: "auth:verify-session",
        input: z.object({
            userId: z.string(),
            sessionToken: z.string(),
        }),
        output: z.object({
            valid: z.boolean(),
            user: VibesUserSchema.nullable(),
            needsMigration: z.boolean(),
        }),
    }),

    updateProfile: defineContract({
        channel: "auth:update-profile",
        input: z.object({
            userId: z.string(),
            displayName: z.string().optional(),
            photoUrl: z.string().nullable().optional(),
        }),
        output: VibesUserSchema,
    }),

    changePassword: defineContract({
        channel: "auth:change-password",
        input: z.object({
            userId: z.string(),
            currentPassword: z.string(),
            newPassword: z.string().min(6),
        }),
        output: z.object({ success: z.boolean() }),
    }),

    logout: defineContract({
        channel: "auth:logout",
        input: z.object({
            userId: z.string(),
        }),
        output: z.void(),
    }),
} as const;

// =============================================================================
// Auth Client
// =============================================================================

export const authClient = createClient(authContracts);
