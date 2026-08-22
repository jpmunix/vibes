import { z } from "zod";
import { defineContract, createClient } from "../contracts/core";

// =============================================================================
// App Folder Schemas (multi-proyecto workspace, card #95)
// =============================================================================
// Cada app (workspace) tiene N carpetas vinculadas. La primaria (isPrimary=true)
// es el app.path original; las extras son paths arbitrarios del disco.
// El chat hereda los folders del app para montar el runtime multi-root.

/**
 * Schema for a linked app folder row.
 */
export const AppFolderSchema = z.object({
  id: z.number(),
  appId: z.number(),
  path: z.string(),
  label: z.string(),
  language: z.string().nullable(),
  projectType: z.string().nullable(),
  isPrimary: z.boolean(),
  createdAt: z.date(),
});

export type AppFolder = z.infer<typeof AppFolderSchema>;

/**
 * Schema for list-app-folders params.
 */
export const ListAppFoldersParamsSchema = z.object({
  appId: z.number(),
});

export const ListAppFoldersResponseSchema = z.object({
  folders: z.array(AppFolderSchema),
});

/**
 * Schema for add-app-folder params.
 * `path` is an absolute directory path chosen by the picker (selectAppLocation).
 * `label` is optional; if absent, the basename of `path` is used.
 */
export const AddAppFolderParamsSchema = z.object({
  appId: z.number(),
  path: z.string().min(1),
  label: z.string().optional(),
});

export const AddAppFolderResultSchema = AppFolderSchema;

/**
 * Schema for remove-app-folder params.
 * The primary folder (isPrimary=true) cannot be removed.
 */
export const RemoveAppFolderParamsSchema = z.object({
  appId: z.number(),
  folderId: z.number(),
});

/**
 * Schema for update-app-folder-label params.
 * Only the `label` is editable; path/language/projectType are set at creation.
 */
export const UpdateAppFolderLabelParamsSchema = z.object({
  appId: z.number(),
  folderId: z.number(),
  label: z.string().min(1),
});

// =============================================================================
// App Folder Contracts
// =============================================================================

export const appFolderContracts = {
  listAppFolders: defineContract({
    channel: "list-app-folders",
    input: ListAppFoldersParamsSchema,
    output: ListAppFoldersResponseSchema,
  }),

  addAppFolder: defineContract({
    channel: "add-app-folder",
    input: AddAppFolderParamsSchema,
    output: AddAppFolderResultSchema,
  }),

  removeAppFolder: defineContract({
    channel: "remove-app-folder",
    input: RemoveAppFolderParamsSchema,
    output: z.void(),
  }),

  updateAppFolderLabel: defineContract({
    channel: "update-app-folder-label",
    input: UpdateAppFolderLabelParamsSchema,
    output: z.void(),
  }),
} as const;

// =============================================================================
// App Folder Client
// =============================================================================

export const appFolderClient = createClient(appFolderContracts);

// =============================================================================
// Type Exports
// =============================================================================

export type ListAppFoldersParams = z.infer<typeof ListAppFoldersParamsSchema>;
export type ListAppFoldersResponse = z.infer<typeof ListAppFoldersResponseSchema>;
export type AddAppFolderParams = z.infer<typeof AddAppFolderParamsSchema>;
export type AddAppFolderResult = z.infer<typeof AddAppFolderResultSchema>;
export type RemoveAppFolderParams = z.infer<typeof RemoveAppFolderParamsSchema>;
export type UpdateAppFolderLabelParams = z.infer<
  typeof UpdateAppFolderLabelParamsSchema
>;
