import { z } from "zod";
import {
  defineContract,
  defineStream,
  createClient,
  createStreamClient,
} from "../contracts/core";

// =============================================================================
// Debate Schemas
// =============================================================================

export const InjectedItemSchema = z.object({
  type: z.enum(["chat", "note", "todo"]),
  id: z.number(),
  title: z.string(),
  content: z.string(),
  fragment: z.string().optional(),
});

export type InjectedItem = z.infer<typeof InjectedItemSchema>;

export const DebateMessageSchema = z.object({
  id: z.number(),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  injectedItems: z.array(InjectedItemSchema).nullable().optional(),
  isSummary: z.boolean().optional(),
  createdAt: z.union([z.date(), z.string()]).optional(),
});

export type DebateMessage = z.infer<typeof DebateMessageSchema>;

export const DebateTagSchema = z.object({
  id: z.number(),
  name: z.string(),
  color: z.string().nullable().optional(),
});

export type DebateTag = z.infer<typeof DebateTagSchema>;

export const DebateSchema = z.object({
  id: z.number(),
  title: z.string(),
  summary: z.string().nullable().optional(),
  messages: z.array(DebateMessageSchema),
  tags: z.array(DebateTagSchema),
  createdAt: z.union([z.date(), z.string()]),
  updatedAt: z.union([z.date(), z.string()]),
});

export type Debate = z.infer<typeof DebateSchema>;

// =============================================================================
// Debate Contracts
// =============================================================================

export const debateContracts = {
  getDebates: defineContract({
    channel: "debate:get-all",
    input: z.void(),
    output: z.array(
      z.object({
        id: z.number(),
        title: z.string(),
        summary: z.string().nullable().optional(),
        createdAt: z.union([z.date(), z.string()]),
        updatedAt: z.union([z.date(), z.string()]),
        tags: z.array(DebateTagSchema),
      }),
    ),
  }),

  getDebate: defineContract({
    channel: "debate:get",
    input: z.number(),
    output: DebateSchema,
  }),

  createDebate: defineContract({
    channel: "debate:create",
    input: z.object({
      title: z.string(),
      tagIds: z.array(z.number()).optional(),
    }),
    output: z.number(),
  }),

  updateDebate: defineContract({
    channel: "debate:update",
    input: z.object({
      id: z.number(),
      title: z.string().optional(),
      summary: z.string().optional(),
    }),
    output: z.void(),
  }),

  deleteDebate: defineContract({
    channel: "debate:delete",
    input: z.number(),
    output: z.void(),
  }),

  deleteMessage: defineContract({
    channel: "debate:delete-message",
    input: z.number(),
    output: z.void(),
  }),

  updateMessage: defineContract({
    channel: "debate:update-message",
    input: z.object({
      id: z.number(),
      content: z.string(),
      injectedItems: z.array(InjectedItemSchema).optional(),
    }),
    output: z.void(),
  }),

  getTags: defineContract({
    channel: "debate:get-tags",
    input: z.void(),
    output: z.array(DebateTagSchema),
  }),

  createTag: defineContract({
    channel: "debate:create-tag",
    input: z.object({
      name: z.string(),
      color: z.string().optional(),
    }),
    output: DebateTagSchema,
  }),

  addTagToDebate: defineContract({
    channel: "debate:add-tag",
    input: z.object({
      debateId: z.number(),
      tagId: z.number(),
    }),
    output: z.void(),
  }),

  removeTagFromDebate: defineContract({
    channel: "debate:remove-tag",
    input: z.object({
      debateId: z.number(),
      tagId: z.number(),
    }),
    output: z.void(),
  }),

  summarizeDebate: defineContract({
    channel: "debate:summarize",
    input: z.number(),
    output: z.string(), // Returns the summary
  }),
} as const;

// =============================================================================
// Debate Stream Contract
// =============================================================================

export const debateStreamContract = defineStream({
  channel: "debate:stream",
  input: z.object({
    debateId: z.number(),
    prompt: z.string(),
    injectedItems: z.array(InjectedItemSchema).optional(),
    appId: z.number().optional(),
  }),
  keyField: "debateId",
  events: {
    chunk: {
      channel: "debate:response:chunk",
      payload: z.object({
        debateId: z.number(),
        messages: z.array(DebateMessageSchema),
      }),
    },
    end: {
      channel: "debate:response:end",
      payload: z.object({
        debateId: z.number(),
        summary: z.string().optional(),
      }),
    },
    error: {
      channel: "debate:response:error",
      payload: z.object({
        debateId: z.number(),
        error: z.string(),
      }),
    },
    titleUpdated: {
      channel: "debate:title:updated",
      payload: z.object({
        debateId: z.number(),
        title: z.string(),
      }),
    },
  },
});

// =============================================================================
// Debate Clients
// =============================================================================

export const debateClient = createClient(debateContracts);
export const debateStreamClient = createStreamClient(debateStreamContract);
