import { z } from "zod";
import { defineContract, createClient } from "../contracts/core";

export const ChatLogEntrySchema = z.object({
  id: z.number().optional(),
  chatId: z.number(),
  messageId: z.number().optional().nullable(),
  level: z.enum(["debug", "info", "warn", "error"]),
  category: z.string(), // e.g., "model-selection", "context-building", "streaming", etc.
  message: z.string(),
  metadata: z.record(z.string(), z.any()).optional().nullable(),
  timestamp: z.number(),
});

export type ChatLogEntry = z.infer<typeof ChatLogEntrySchema>;

export const chatLogsContracts = {
  getChatLogs: defineContract({
    channel: "chat-logs:get",
    input: z.object({
      chatId: z.number(),
      messageId: z.number().optional(),
      limit: z.number().optional(),
    }),
    output: z.array(ChatLogEntrySchema),
  }),

  addChatLog: defineContract({
    channel: "chat-logs:add",
    input: ChatLogEntrySchema.omit({ id: true }),
    output: z.void(),
  }),

  clearChatLogs: defineContract({
    channel: "chat-logs:clear",
    input: z.object({ chatId: z.number() }),
    output: z.void(),
  }),
} as const;

export const chatLogsClient = createClient(chatLogsContracts);
