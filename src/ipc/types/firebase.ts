import { z } from "zod";
import { defineContract, createClient } from "../contracts/core";

// =============================================================================
// Firebase Schemas
// =============================================================================

export const FirebaseProjectSchema = z.object({
    projectId: z.string(),
    displayName: z.string().optional(),
    projectNumber: z.string().optional(),
    resources: z.object({
        hostingSite: z.string().optional(),
        realtimeDatabaseInstance: z.string().optional(),
        storageBucket: z.string().optional(),
        locationId: z.string().optional(),
    }).optional(),
});

export type FirebaseProject = z.infer<typeof FirebaseProjectSchema>;

export const FirebaseWebConfigSchema = z.object({
    apiKey: z.string(),
    authDomain: z.string(),
    projectId: z.string(),
    storageBucket: z.string(),
    messagingSenderId: z.string(),
    appId: z.string(),
    measurementId: z.string().optional(),
});

export type FirebaseWebConfig = z.infer<typeof FirebaseWebConfigSchema>;

export const SetFirebaseAppProjectParamsSchema = z.object({
    appId: z.number(),
    projectId: z.string(),
    config: FirebaseWebConfigSchema,
});

export type SetFirebaseAppProjectParams = z.infer<
    typeof SetFirebaseAppProjectParamsSchema
>;

// =============================================================================
// Firebase Contracts
// =============================================================================

export const firebaseContracts = {
    listProjects: defineContract({
        channel: "firebase:list-projects",
        input: z.void(),
        output: z.array(FirebaseProjectSchema),
    }),

    getProjectWebConfig: defineContract({
        channel: "firebase:get-config",
        input: z.object({ projectId: z.string() }),
        output: FirebaseWebConfigSchema,
    }),

    setAppProject: defineContract({
        channel: "firebase:set-app-project",
        input: SetFirebaseAppProjectParamsSchema,
        output: z.void(),
    }),

    unsetAppProject: defineContract({
        channel: "firebase:unset-app-project",
        input: z.object({ appId: z.number() }),
        output: z.void(),
    }),
} as const;

// =============================================================================
// Firebase Client
// =============================================================================

export const firebaseClient = createClient(firebaseContracts);
