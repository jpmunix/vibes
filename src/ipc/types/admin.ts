/**
 * Admin IPC contracts — all admin actions require server-side privilege check.
 */
import { z } from "zod";
import { defineContract, createClient } from "../contracts/core";

// =============================================================================
// Schemas
// =============================================================================

export const AdminUserSchema = z.object({
    id: z.string(),
    email: z.string(),
    displayName: z.string(),
    photoUrl: z.string().nullable(),
    createdAt: z.number(),
    lastLoginAt: z.number().nullable(),
});

export type AdminUser = z.infer<typeof AdminUserSchema>;

// =============================================================================
// Contracts
// =============================================================================

export const adminContracts = {
    listUsers: defineContract({
        channel: "admin:list-users",
        input: z.object({}),
        output: z.object({ users: z.array(AdminUserSchema) }),
    }),

    createUser: defineContract({
        channel: "admin:create-user",
        input: z.object({
            email: z.string().min(1),
            displayName: z.string().min(1),
            password: z.string().min(6),
        }),
        output: AdminUserSchema,
    }),

    updateUser: defineContract({
        channel: "admin:update-user",
        input: z.object({
            userId: z.string(),
            email: z.string().optional(),
            displayName: z.string().optional(),
        }),
        output: AdminUserSchema,
    }),

    resetPassword: defineContract({
        channel: "admin:reset-password",
        input: z.object({
            userId: z.string(),
            newPassword: z.string().min(6),
        }),
        output: z.object({ success: z.boolean() }),
    }),

    listApps: defineContract({
        channel: "admin:list-apps",
        input: z.object({}),
        output: z.object({
            apps: z.array(z.object({
                id: z.number(),
                userId: z.string(),
                name: z.string(),
                path: z.string(),
                createdAt: z.number(),
                updatedAt: z.number(),
                primaryLanguage: z.string().nullable(),
                projectType: z.string().nullable(),
                githubOrg: z.string().nullable(),
                githubRepo: z.string().nullable(),
            })),
            users: z.array(AdminUserSchema),
        }),
    }),
} as const;

// =============================================================================
// Client
// =============================================================================

export const adminClient = createClient(adminContracts);
