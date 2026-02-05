import { z } from "zod";
import { defineContract, createClient } from "../contracts/core";

// =============================================================================
// Note Schemas
// =============================================================================

/**
 * Schema for a Note object.
 */
export const NoteSchema = z.object({
  id: z.number(),
  title: z.string(),
  content: z.string(),
  createdAt: z.union([z.date(), z.string()]),
  updatedAt: z.union([z.date(), z.string()]),
});

export type Note = z.infer<typeof NoteSchema>;

/**
 * Schema for note summary (list view).
 */
export const NoteSummarySchema = z.object({
  id: z.number(),
  title: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type NoteSummary = z.infer<typeof NoteSummarySchema>;

/**
 * Schema for update note params.
 */
export const UpdateNoteParamsSchema = z.object({
  noteId: z.number(),
  title: z.string().optional(),
  content: z.string().optional(),
});

export type UpdateNoteParams = z.infer<typeof UpdateNoteParamsSchema>;

// =============================================================================
// Note Contracts (Invoke/Response)
// =============================================================================

export const noteContracts = {
  getNote: defineContract({
    channel: "get-note",
    input: z.number(), // noteId
    output: NoteSchema,
  }),

  getNotes: defineContract({
    channel: "get-notes",
    input: z.void(),
    output: z.array(NoteSummarySchema),
  }),

  createNote: defineContract({
    channel: "create-note",
    input: z.void(),
    output: z.number(), // noteId
  }),

  updateNote: defineContract({
    channel: "update-note",
    input: UpdateNoteParamsSchema,
    output: z.void(),
  }),

  deleteNote: defineContract({
    channel: "delete-note",
    input: z.number(), // noteId
    output: z.void(),
  }),
} as const;

// =============================================================================
// Note Client
// =============================================================================

/**
 * Type-safe client for note IPC operations.
 * Auto-generated from contracts.
 *
 * @example
 * const note = await noteClient.getNote(noteId);
 * const noteId = await noteClient.createNote();
 */
export const noteClient = createClient(noteContracts);
