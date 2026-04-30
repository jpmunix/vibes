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

    getUserSettings: defineContract({
        channel: "admin:get-user-settings",
        input: z.object({ userId: z.string() }),
        output: z.object({ settings: z.record(z.unknown()).nullable() }),
    }),

    getAllUsersSettings: defineContract({
        channel: "admin:get-all-users-settings",
        input: z.object({}),
        output: z.object({
            usersSettings: z.array(z.object({
                userId: z.string(),
                displayName: z.string(),
                email: z.string(),
                settings: z.record(z.unknown()).nullable(),
            })),
        }),
    }),

    /**
     * Memory stats per user — same data as MemorySettings "Memorias por aplicación"
     * Returns per-user per-app: total, enabled, disabled, auto, manual counts.
     */
    getAdminMemoryStats: defineContract({
        channel: "admin:get-memory-stats",
        input: z.object({}),
        output: z.object({
            users: z.array(z.object({
                userId: z.string(),
                displayName: z.string(),
                apps: z.array(z.object({
                    appId: z.number(),
                    appName: z.string(),
                    total: z.number(),
                    enabled: z.number(),
                    disabled: z.number(),
                    autoCount: z.number(),
                    manualCount: z.number(),
                })),
            })),
        }),
    }),

    /**
     * Analyzer data per user — same data as MemorySettings "Analizador de memoria"
     * Returns telemetry stats, recent events, and pipeline logs for a given user+app filter.
     */
    getAdminAnalyzerData: defineContract({
        channel: "admin:get-analyzer-data",
        input: z.object({
            userId: z.string(),
            appId: z.number().optional(), // 0 or omitted = all apps
        }),
        output: z.object({
            apps: z.array(z.object({
                id: z.number(),
                name: z.string(),
            })),
            stats: z.array(z.object({
                action: z.string(),
                count: z.number(),
            })),
            recent: z.array(z.object({
                action: z.string(),
                reason: z.string().nullable(),
                extractedKeys: z.string().nullable(),
                createdAt: z.string(),
            })),
            pipelineLogs: z.array(z.object({
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
    }),
} as const;

// =============================================================================
// Client
// =============================================================================

export const adminClient = createClient(adminContracts);
