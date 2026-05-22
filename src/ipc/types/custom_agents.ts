import { z } from "zod";
import { defineContract, createClient } from "../contracts/core";

// =============================================================================
// Custom Agent Schemas
// =============================================================================

export const CustomAgentDtoSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  systemPrompt: z.string(),
  baseAgent: z.enum(["build", "plan", "explore"]),
  promptMode: z.enum(["additive", "replace"]),
  slashCommand: z.string(),
  modelSource: z.enum(["chat", "static"]),
  model: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type CustomAgentDto = z.infer<typeof CustomAgentDtoSchema>;

export const CreateCustomAgentParamsSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  systemPrompt: z.string(),
  baseAgent: z.enum(["build", "plan", "explore"]),
  promptMode: z.enum(["additive", "replace"]),
  slashCommand: z.string(),
  modelSource: z.enum(["chat", "static"]).optional(),
  model: z.string().optional().nullable(),
});

export type CreateCustomAgentParams = z.infer<typeof CreateCustomAgentParamsSchema>;

export const UpdateCustomAgentParamsSchema = z.object({
  id: z.number(),
  name: z.string().optional(),
  description: z.string().optional(),
  systemPrompt: z.string().optional(),
  baseAgent: z.enum(["build", "plan", "explore"]).optional(),
  promptMode: z.enum(["additive", "replace"]).optional(),
  slashCommand: z.string().optional(),
  modelSource: z.enum(["chat", "static"]).optional(),
  model: z.string().optional().nullable(),
});

export type UpdateCustomAgentParams = z.infer<typeof UpdateCustomAgentParamsSchema>;

// =============================================================================
// Custom Agent Contracts
// =============================================================================

export const customAgentsContracts = {
  list: defineContract({
    channel: "custom-agents:list",
    input: z.void(),
    output: z.array(CustomAgentDtoSchema),
  }),

  create: defineContract({
    channel: "custom-agents:create",
    input: CreateCustomAgentParamsSchema,
    output: CustomAgentDtoSchema,
  }),

  update: defineContract({
    channel: "custom-agents:update",
    input: UpdateCustomAgentParamsSchema,
    output: z.void(),
  }),

  delete: defineContract({
    channel: "custom-agents:delete",
    input: z.number(),
    output: z.void(),
  }),
} as const;

// =============================================================================
// Custom Agent Client
// =============================================================================

export const customAgentsClient = createClient(customAgentsContracts);
