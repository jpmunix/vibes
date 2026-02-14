import { z } from "zod";
import {
    defineContract,
    defineStream,
    createClient,
    createStreamClient,
} from "../contracts/core";

// =============================================================================
// Dossier Schemas
// =============================================================================

export const DossierGenerateParamsSchema = z.object({
    appId: z.number(),
    sessionId: z.string(),
    forceRegenerate: z.boolean().optional(),
});

export type DossierGenerateParams = z.infer<typeof DossierGenerateParamsSchema>;

export const DossierCheckExistingParamsSchema = z.object({
    appId: z.number(),
});

export type DossierCheckExistingParams = z.infer<typeof DossierCheckExistingParamsSchema>;

export const DossierCheckExistingResultSchema = z.object({
    exists: z.boolean(),
    zipPath: z.string().optional(),
});

export type DossierCheckExistingResult = z.infer<typeof DossierCheckExistingResultSchema>;

export const DossierDownloadParamsSchema = z.object({
    appId: z.number(),
});

export const DossierDownloadResultSchema = z.object({
    zipBase64: z.string(),
    fileName: z.string(),
});

export type DossierDownloadResult = z.infer<typeof DossierDownloadResultSchema>;

// Stream event schemas
export const DossierChunkSchema = z.object({
    sessionId: z.string(),
    message: z.string(),
    phase: z.enum(["analyzing", "tutorial", "memoria", "docx", "zip", "done"]),
});

export type DossierChunk = z.infer<typeof DossierChunkSchema>;

export const DossierEndSchema = z.object({
    sessionId: z.string(),
    zipBase64: z.string(),
    fileName: z.string(),
});

export type DossierEnd = z.infer<typeof DossierEndSchema>;

export const DossierErrorSchema = z.object({
    sessionId: z.string(),
    error: z.string(),
});

// =============================================================================
// Dossier Contracts
// =============================================================================

export const dossierContracts = {
    generate: defineContract({
        channel: "dossier:generate",
        input: DossierGenerateParamsSchema,
        output: z.object({ ok: z.literal(true) }),
    }),

    cancel: defineContract({
        channel: "dossier:cancel",
        input: z.string(), // sessionId
        output: z.object({ ok: z.literal(true) }),
    }),

    checkExisting: defineContract({
        channel: "dossier:check-existing",
        input: DossierCheckExistingParamsSchema,
        output: DossierCheckExistingResultSchema,
    }),

    download: defineContract({
        channel: "dossier:download",
        input: DossierDownloadParamsSchema,
        output: DossierDownloadResultSchema,
    }),
} as const;

// =============================================================================
// Dossier Stream Contract
// =============================================================================

export const dossierStreamContract = defineStream({
    channel: "dossier:generate",
    input: DossierGenerateParamsSchema,
    keyField: "sessionId",
    events: {
        chunk: {
            channel: "dossier:response:chunk",
            payload: DossierChunkSchema,
        },
        end: {
            channel: "dossier:response:end",
            payload: DossierEndSchema,
        },
        error: {
            channel: "dossier:response:error",
            payload: DossierErrorSchema,
        },
    },
});

// =============================================================================
// Dossier Clients
// =============================================================================

export const dossierClient = createClient(dossierContracts);
export const dossierStreamClient = createStreamClient(dossierStreamContract);
