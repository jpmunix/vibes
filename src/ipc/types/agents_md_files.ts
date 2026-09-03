import { z } from "zod";
import { defineContract, createClient } from "../contracts/core";

// =============================================================================
// AGENTS.md detection schema (workspace settings page, card #234)
// =============================================================================
// Para cada carpeta vinculada al app listamos los AGENTS.md encontrados
// hasta una profundidad de 3 niveles (raíz + 2 subniveles, igual que la lógica
// que ya inyecta el system prompt vía agents_md_context.findAgentsMdFiles).
//
// La página /app-settings consume esto para mostrar la tabla agrupada por
// carpeta que da visibilidad al usuario sobre qué directrices se están
// enviando al modelo en cada sesión.

/**
 * One detected AGENTS.md file, scoped to its parent folder.
 *
 * - `folderId` / `folderLabel` / `folderPath`: the linked folder it belongs to
 *   (so the UI can group the table by folder without having to resolve paths).
 * - `relativePath`: the path of the AGENTS.md relative to `folderPath`, used
 *   to render the row and to disambiguate two AGENTS.md living in different
 *   subdirectories of the same folder.
 * - `absolutePath`: full disk path; used by future "open file" actions but
 *   not rendered in v1.
 */
export const AgentsMdFileSchema = z.object({
  folderId: z.number(),
  folderLabel: z.string(),
  folderPath: z.string(),
  relativePath: z.string(),
  absolutePath: z.string(),
});

export type AgentsMdFile = z.infer<typeof AgentsMdFileSchema>;

/**
 * One folder plus the AGENTS.md files detected inside it. The UI renders
 * one of these per linked folder (or one synthetic "empty" entry for folders
 * with no AGENTS.md, so the user knows the search ran).
 */
export const AgentsMdFolderScanSchema = z.object({
  folderId: z.number(),
  folderLabel: z.string(),
  folderPath: z.string(),
  isPrimary: z.boolean(),
  /** Files found inside this folder (may be empty). */
  files: z.array(AgentsMdFileSchema),
});

export type AgentsMdFolderScan = z.infer<typeof AgentsMdFolderScanSchema>;

/**
 * Schema for list-agents-md-files params. Same shape as list-app-folders:
 * the app is the source of truth for which folders to scan.
 */
export const ListAgentsMdFilesParamsSchema = z.object({
  appId: z.number(),
});

/**
 * Schema for list-agents-md-files response. One entry per linked folder,
 * ordered the same way list-app-folders returns (primary first, then by id).
 */
export const ListAgentsMdFilesResponseSchema = z.object({
  folders: z.array(AgentsMdFolderScanSchema),
});

/**
 * Read one AGENTS.md file by absolute path. The handler validates that the
 * path belongs to one of the app's linked folders (and is an AGENTS.md the
 * scan would have found), so this channel can't be used as a generic file
 * reader by a compromised renderer.
 */
export const ReadAgentsMdFileParamsSchema = z.object({
  appId: z.number(),
  absolutePath: z.string().min(1),
});

export const ReadAgentsMdFileResponseSchema = z.object({
  content: z.string().nullable(),
});

// =============================================================================
// AGENTS.md Files Contracts
// =============================================================================

export const agentsMdFileContracts = {
  listAgentsMdFiles: defineContract({
    channel: "list-agents-md-files",
    input: ListAgentsMdFilesParamsSchema,
    output: ListAgentsMdFilesResponseSchema,
  }),
  readAgentsMdFile: defineContract({
    channel: "read-agents-md-file",
    input: ReadAgentsMdFileParamsSchema,
    output: ReadAgentsMdFileResponseSchema,
  }),
} as const;

// =============================================================================
// AGENTS.md Files Client
// =============================================================================

export const agentsMdFileClient = createClient(agentsMdFileContracts);

// =============================================================================
// Type Exports
// =============================================================================

export type ListAgentsMdFilesParams = z.infer<
  typeof ListAgentsMdFilesParamsSchema
>;
export type ListAgentsMdFilesResponse = z.infer<
  typeof ListAgentsMdFilesResponseSchema
>;
export type ReadAgentsMdFileParams = z.infer<
  typeof ReadAgentsMdFileParamsSchema
>;
export type ReadAgentsMdFileResponse = z.infer<
  typeof ReadAgentsMdFileResponseSchema
>;
