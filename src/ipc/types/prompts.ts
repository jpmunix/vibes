import { z } from "zod";
import { defineContract, createClient } from "../contracts/core";

// =============================================================================
// Prompt Schemas
// =============================================================================

export const PromptDtoSchema = z.object({
  id: z.number(),
  categoryId: z.number().nullable().optional(),
  systemId: z.string().nullable().optional(),
  title: z.string(),
  description: z.string().nullable(),
  content: z.string(),
  enabled: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const PromptCategoryDtoSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
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
});

export type CreatePromptParamsDto = z.infer<typeof CreatePromptParamsDtoSchema>;

export const UpdatePromptParamsDtoSchema = z.object({
  id: z.number(),
  categoryId: z.number().nullable().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  content: z.string().optional(),
  enabled: z.boolean().optional(),
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
} as const;

// =============================================================================
// Prompt Client
// =============================================================================

export const promptClient = createClient(promptContracts);
