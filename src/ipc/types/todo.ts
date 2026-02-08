import { z } from "zod";
import { createClient, defineContract } from "../contracts/core";

// =============================================================================
// Todo Schemas
// =============================================================================

/**
 * Schema for a Todo Section object.
 */
export const TodoSectionSchema = z.object({
  id: z.number(),
  appId: z.number(),
  title: z.string(),
  order: z.number(),
  createdAt: z.union([z.date(), z.string()]),
  updatedAt: z.union([z.date(), z.string()]),
});

export type TodoSection = z.infer<typeof TodoSectionSchema>;

/**
 * Schema for a Todo object.
 */
export const TodoSchema = z.object({
  id: z.number(),
  appId: z.number(),
  sectionId: z.number().optional().nullable(),
  content: z.string(),
  description: z.string().optional().nullable(),
  prompt: z.string().optional().nullable(),
  completed: z.boolean(),
  order: z.number(),
  createdAt: z.union([z.date(), z.string()]),
  updatedAt: z.union([z.date(), z.string()]),
});

export type Todo = z.infer<typeof TodoSchema>;

/**
 * Schema for create todo section params.
 */
export const CreateTodoSectionParamsSchema = z.object({
  appId: z.number(),
  title: z.string(),
});

export type CreateTodoSectionParams = z.infer<typeof CreateTodoSectionParamsSchema>;

/**
 * Schema for update todo section params.
 */
export const UpdateTodoSectionParamsSchema = z.object({
  sectionId: z.number(),
  title: z.string().optional(),
  order: z.number().optional(),
});

export type UpdateTodoSectionParams = z.infer<typeof UpdateTodoSectionParamsSchema>;

/**
 * Schema for create todo params.
 */
export const CreateTodoParamsSchema = z.object({
  appId: z.number(),
  sectionId: z.number().optional(),
  content: z.string(),
  description: z.string().optional(),
  prompt: z.string().optional(),
});

export type CreateTodoParams = z.infer<typeof CreateTodoParamsSchema>;

/**
 * Schema for update todo params.
 */
export const UpdateTodoParamsSchema = z.object({
  todoId: z.number(),
  sectionId: z.number().optional().nullable(),
  content: z.string().optional(),
  description: z.string().optional().nullable(),
  prompt: z.string().optional().nullable(),
  completed: z.boolean().optional(),
  order: z.number().optional(),
});

export type UpdateTodoParams = z.infer<typeof UpdateTodoParamsSchema>;

/**
 * Schema for reorder todos params.
 */
export const ReorderTodosParamsSchema = z.object({
  appId: z.number(),
  sectionId: z.number().optional().nullable(),
  todoIds: z.array(z.number()),
});

export type ReorderTodosParams = z.infer<typeof ReorderTodosParamsSchema>;

/**
 * Schema for reorder todo sections params.
 */
export const ReorderTodoSectionsParamsSchema = z.object({
  appId: z.number(),
  sectionIds: z.array(z.number()),
});

export type ReorderTodoSectionsParams = z.infer<typeof ReorderTodoSectionsParamsSchema>;

/**
 * Schema for develop todo params.
 */
export const DevelopTodoParamsSchema = z.object({
  todoId: z.number(),
  prompt: z.string().optional(),
});

export type DevelopTodoParams = z.infer<typeof DevelopTodoParamsSchema>;

/**
 * Schema for develop todo response.
 */
export const DevelopTodoResponseSchema = z.object({
  chatId: z.number(),
});

export type DevelopTodoResponse = z.infer<typeof DevelopTodoResponseSchema>;

/**
 * Schema for refine todo prompt params.
 */
export const RefineTodoPromptParamsSchema = z.object({
  todoId: z.number(),
});

export type RefineTodoPromptParams = z.infer<typeof RefineTodoPromptParamsSchema>;

/**
 * Schema for refine todo prompt response.
 */
export const RefineTodoPromptResponseSchema = z.object({
  prompt: z.string(),
});

export type RefineTodoPromptResponse = z.infer<typeof RefineTodoPromptResponseSchema>;

/**
 * Schema for analyze todo files params.
 */
export const AnalyzeTodoFilesParamsSchema = z.object({
  appId: z.number(),
  files: z.array(z.object({
    name: z.string(),
    path: z.string(),
    type: z.string(),
    data: z.string().optional(), // Base64 data for images
  })),
});

export type AnalyzeTodoFilesParams = z.infer<typeof AnalyzeTodoFilesParamsSchema>;

/**
 * Schema for analyze todo files response.
 */
export const AnalyzeTodoFilesResponseSchema = z.object({
  listTitle: z.string(),
  tasks: z.array(z.object({
    content: z.string(),
    description: z.string().optional().nullable(),
  })),
});

export type AnalyzeTodoFilesResponse = z.infer<typeof AnalyzeTodoFilesResponseSchema>;

// =============================================================================
// Todo Contracts (Invoke/Response)
// =============================================================================

export const todoContracts = {
  getTodosByApp: defineContract({
    channel: "get-todos-by-app",
    input: z.number(), // appId
    output: z.array(TodoSchema),
  }),

  getTodoSectionsByApp: defineContract({
    channel: "get-todo-sections-by-app",
    input: z.number(), // appId
    output: z.array(TodoSectionSchema),
  }),

  createTodoSection: defineContract({
    channel: "create-todo-section",
    input: CreateTodoSectionParamsSchema,
    output: TodoSectionSchema,
  }),

  updateTodoSection: defineContract({
    channel: "update-todo-section",
    input: UpdateTodoSectionParamsSchema,
    output: TodoSectionSchema,
  }),

  deleteTodoSection: defineContract({
    channel: "delete-todo-section",
    input: z.number(), // sectionId
    output: z.void(),
  }),

  createTodo: defineContract({
    channel: "create-todo",
    input: CreateTodoParamsSchema,
    output: TodoSchema,
  }),

  updateTodo: defineContract({
    channel: "update-todo",
    input: UpdateTodoParamsSchema,
    output: TodoSchema,
  }),

  deleteTodo: defineContract({
    channel: "delete-todo",
    input: z.number(), // todoId
    output: z.void(),
  }),

  reorderTodos: defineContract({
    channel: "reorder-todos",
    input: ReorderTodosParamsSchema,
    output: z.void(),
  }),

  reorderTodoSections: defineContract({
    channel: "reorder-todo-sections",
    input: ReorderTodoSectionsParamsSchema,
    output: z.void(),
  }),

  developTodo: defineContract({
    channel: "develop-todo",
    input: DevelopTodoParamsSchema,
    output: DevelopTodoResponseSchema,
  }),

  refineTodoPrompt: defineContract({
    channel: "refine-todo-prompt",
    input: RefineTodoPromptParamsSchema,
    output: RefineTodoPromptResponseSchema,
  }),
  analyzeTodoFiles: defineContract({
    channel: "analyze-todo-files",
    input: AnalyzeTodoFilesParamsSchema,
    output: AnalyzeTodoFilesResponseSchema,
  }),
  selectTodoFiles: defineContract({
    channel: "select-todo-files",
    input: z.void(),
    output: z.array(z.object({
      name: z.string(),
      path: z.string(),
      type: z.string(),
      data: z.string().optional(),
    })),
  }),
} as const;

// =============================================================================
// Todo Client
// =============================================================================

/**
 * Type-safe client for todo IPC operations.
 * Auto-generated from contracts.
 */
export const todoClient = createClient(todoContracts);
