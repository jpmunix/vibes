import { z } from "zod";
import { defineContract, createClient } from "../contracts/core";

// =============================================================================
// Template Schemas
// =============================================================================

export const TemplateSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  imageUrl: z.string().optional(),
  githubUrl: z.string().optional(),
  isOfficial: z.boolean(),
  isExperimental: z.boolean().optional(),
  requiresNeon: z.boolean().optional(),
});

export type Template = z.infer<typeof TemplateSchema>;

// Theme schema (similar structure)
export const ThemeSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  icon: z.string(),
  prompt: z.string(),
});

export type Theme = z.infer<typeof ThemeSchema>;

// =============================================================================
// Template/Theme Contracts
// =============================================================================

export const templateContracts = {
  getTemplates: defineContract({
    channel: "get-templates",
    input: z.void(),
    output: z.array(TemplateSchema),
  }),

  getThemes: defineContract({
    channel: "get-themes",
    input: z.void(),
    output: z.array(ThemeSchema),
  }),
} as const;

// =============================================================================
// Template Client
// =============================================================================

export const templateClient = createClient(templateContracts);
