import { z } from "zod";
import { defineContract, createClient } from "../contracts/core";

export const TokenStatEntrySchema = z.object({
  chatId: z.number(),
  messageId: z.number(),
  totalTokens: z.number(),
  promptTokens: z.number().optional(),
  completionTokens: z.number().optional(),
  model: z.string().nullable().optional(),
  timestamp: z.number(),
  appId: z.number().nullable().optional(),
  filesSent: z.array(z.string()).optional(),
  toolsUsed: z.array(z.string()).optional(),
});

export type TokenStatEntry = z.infer<typeof TokenStatEntrySchema>;

export const tokenStatsContracts = {
  getTokenStats: defineContract({
    channel: "token-stats:get",
    input: z.void(),
    output: z.array(TokenStatEntrySchema),
  }),
} as const;

export const tokenStatsClient = createClient(tokenStatsContracts);
