/**
 * Contratos IPC para el módulo de TODOs.
 *
 * NOTA (deuda de typecheck #232): el backend del módulo de TODOs fue retirado
 * (commits 56b3c9a5 / 61de547a / 7accec58 — "add TODOs module"), pero la UI
 * (MessagesList.tsx) sigue llamando `ipc.todo.*` con `chat.todoId`. Este
 * contrato existe para tipar la frontera y que el typecheck pase. Sin handler
 * registrado, cualquier llamada en runtime fallará explícitamente (no hay
 * implementación). Si se recupera el módulo, añadir handlers aquí o en su
 * archivo propio.
 */
import { z } from "zod";
import { defineContract, createClient } from "../contracts/core";

export const TodoDtoSchema = z.object({
  id: z.number(),
  title: z.string().optional(),
  description: z.string().nullable().optional(),
  completed: z.boolean(),
});

export type TodoDto = z.infer<typeof TodoDtoSchema>;

export const todoContracts = {
  getTodosByApp: defineContract({
    channel: "todos:by-app",
    input: z.number(), // appId
    output: z.array(TodoDtoSchema),
  }),

  updateTodo: defineContract({
    channel: "todos:update",
    input: z.object({
      todoId: z.number(),
      completed: z.boolean().optional(),
      title: z.string().optional(),
      description: z.string().nullable().optional(),
    }),
    output: z.void(),
  }),

  generateTodoSummary: defineContract({
    channel: "todos:generate-summary",
    input: z.number(), // todoId
    output: z.void(),
  }),
};

export const todoClient = createClient(todoContracts);
