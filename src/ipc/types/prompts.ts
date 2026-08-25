import { z } from "zod";
import { defineContract, createClient } from "../contracts/core";

// =============================================================================
// Prompt Schemas
// =============================================================================

export const PromptDtoSchema = z.object({
  // null => prompt del sistema sin override del usuario (se usa DEFAULT_PROMPTS del código).
  // En cuanto el usuario lo edita/habilita/cambia scope se crea la fila y pasa a tener id.
  id: z.number().nullable(),
  categoryId: z.number().nullable().optional(),
  systemId: z.string().nullable().optional(),
  title: z.string(),
  description: z.string().nullable(),
  content: z.string(),
  enabled: z.boolean(),
  scope: z.string().default("all"),
  // Restore-defaults: si hay un default de fábrica y difiere del actual
  hasDefault: z.boolean().optional(),
  isModified: z.boolean().optional(),
  // Card #195: grupo de la jerarquía a 2 niveles bajo "Prompts del sistema"
  // (core | titles | git | memory | vision). Metadato de código; null para
  // prompts custom.
  groupKey: z.string().nullable().optional(),
  createdAt: z.date().nullable().optional(),
  updatedAt: z.date().nullable().optional(),
});

export const PromptCategoryDtoSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  // i18n: clave de traducción para categorías del sistema. Si viene, la UI
  // resuelve el nombre visible con t() en lugar del name de la DB.
  nameKey: z.string().nullable().optional(),
  isSystem: z.boolean().optional(),
});

export type PromptCategoryDto = z.infer<typeof PromptCategoryDtoSchema>;

export type PromptDto = z.infer<typeof PromptDtoSchema>;

export const CreatePromptParamsDtoSchema = z.object({
  title: z.string(),
  categoryId: z.number().optional(),
  systemId: z.string().optional(),
  description: z.string().optional(),
  content: z.string(),
  enabled: z.boolean().optional(),
  scope: z.string().optional(),
});

export type CreatePromptParamsDto = z.infer<typeof CreatePromptParamsDtoSchema>;

export const UpdatePromptParamsDtoSchema = z.object({
  id: z.number(),
  categoryId: z.number().nullable().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  content: z.string().optional(),
  enabled: z.boolean().optional(),
  scope: z.string().optional(),
});

export type UpdatePromptParamsDto = z.infer<typeof UpdatePromptParamsDtoSchema>;

// =============================================================================
// Prompt Contracts
// =============================================================================

export const promptContracts = {
  list: defineContract({
    channel: "prompts:list",
    input: z.void(),
    output: z.array(PromptDtoSchema),
  }),

  create: defineContract({
    channel: "prompts:create",
    input: CreatePromptParamsDtoSchema,
    output: PromptDtoSchema,
  }),

  update: defineContract({
    channel: "prompts:update",
    input: UpdatePromptParamsDtoSchema,
    output: z.void(),
  }),

  delete: defineContract({
    channel: "prompts:delete",
    input: z.number(), // id
    output: z.void(),
  }),

  // Categories
  listCategories: defineContract({
    channel: "prompts:categories:list",
    input: z.void(),
    output: z.array(PromptCategoryDtoSchema),
  }),

  createCategory: defineContract({
    channel: "prompts:categories:create",
    input: z.object({
      name: z.string(),
      description: z.string().optional(),
    }),
    output: PromptCategoryDtoSchema,
  }),

  updateCategory: defineContract({
    channel: "prompts:categories:update",
    input: z.object({
      id: z.number(),
      name: z.string().optional(),
      description: z.string().optional(),
    }),
    output: z.void(),
  }),

  deleteCategory: defineContract({
    channel: "prompts:categories:delete",
    input: z.number(), // id
    output: z.void(),
  }),

  // Restore default de fábrica de un prompt del sistema
  restoreDefault: defineContract({
    channel: "prompts:restoreDefault",
    input: z.object({
      id: z.number(), // id del prompt del usuario
      systemId: z.string(),
    }),
    output: z.void(),
  }),
} as const;

// =============================================================================
// Prompt Client
// =============================================================================

export const promptClient = createClient(promptContracts);
