import { z } from "zod";
import { createClient, defineContract } from "../contracts/core";

// =============================================================================
// Todo Schemas
// =============================================================================

/**
 * Schema for a Todo object.
 */
export const TodoSchema = z.object({
  id: z.number(),
  appId: z.number(),
  content: z.string(),
  completed: z.boolean(),
  order: z.number(),
  createdAt: z.union([z.date(), z.string()]),
  updatedAt: z.union([z.date(), z.string()]),
});

export type Todo = z.infer<typeof TodoSchema>;

/**
 * Schema for create todo params.
 */
export const CreateTodoParamsSchema = z.object({
  appId: z.number(),
  content: z.string(),
});

export type CreateTodoParams = z.infer<typeof CreateTodoParamsSchema>;

/**
 * Schema for update todo params.
 */
export const UpdateTodoParamsSchema = z.object({
  todoId: z.number(),
  content: z.string().optional(),
  completed: z.boolean().optional(),
});

export type UpdateTodoParams = z.infer<typeof UpdateTodoParamsSchema>;

/**
 * Schema for reorder todos params.
 */
export const ReorderTodosParamsSchema = z.object({
  appId: z.number(),
  todoIds: z.array(z.number()),
});

export type ReorderTodosParams = z.infer<typeof ReorderTodosParamsSchema>;

/**
 * Schema for develop todo params.
 */
export const DevelopTodoParamsSchema = z.object({
  todoId: z.number(),
});

export type DevelopTodoParams = z.infer<typeof DevelopTodoParamsSchema>;

/**
 * Schema for develop todo response.
 */
export const DevelopTodoResponseSchema = z.object({
  chatId: z.number(),
});

export type DevelopTodoResponse = z.infer<typeof DevelopTodoResponseSchema>;

// =============================================================================
// Todo Contracts (Invoke/Response)
// =============================================================================

export const todoContracts = {
  getTodosByApp: defineContract({
    channel: "get-todos-by-app",
    input: z.number(), // appId
    output: z.array(TodoSchema),
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

  developTodo: defineContract({
    channel: "develop-todo",
    input: DevelopTodoParamsSchema,
    output: DevelopTodoResponseSchema,
  }),
} as const;

// =============================================================================
// Todo Client
// =============================================================================

/**
 * Type-safe client for todo IPC operations.
 * Auto-generated from contracts.
 *
 * @example
 * const todos = await todoClient.getTodosByApp(appId);
 * const todo = await todoClient.createTodo({ appId, content: "New task" });
 */
export const todoClient = createClient(todoContracts);
