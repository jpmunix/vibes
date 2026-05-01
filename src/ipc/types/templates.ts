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



// =============================================================================
// Template/Theme Contracts
// =============================================================================

export const templateContracts = {
  getTemplates: defineContract({
    channel: "get-templates",
    input: z.void(),
    output: z.array(TemplateSchema),
  }),


} as const;

// =============================================================================
// Template Client
// =============================================================================

export const templateClient = createClient(templateContracts);
