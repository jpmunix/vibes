import { and, asc, eq } from "drizzle-orm";
import log from "electron-log";
import { db } from "../../db";
import { apps, chats, messages, todos } from "../../db/schema";
import { getDyadAppPath } from "../../paths/paths";
import { todoContracts } from "../types/todo";
import { getCurrentCommitHash } from "../utils/git_utils";
import { createTypedHandler } from "./base";

const logger = log.scope("todo_handlers");

export function registerTodoHandlers() {
  createTypedHandler(todoContracts.getTodosByApp, async (_, appId) => {
    const allTodos = await db.query.todos.findMany({
      where: eq(todos.appId, appId),
      orderBy: [asc(todos.order), asc(todos.createdAt)],
    });

    return allTodos;
  });

  createTypedHandler(todoContracts.createTodo, async (_, params) => {
    const { appId, content } = params;

    // Get the max order for this app
    const existingTodos = await db.query.todos.findMany({
      where: eq(todos.appId, appId),
      orderBy: [asc(todos.order)],
    });

    const maxOrder = existingTodos.length > 0 
      ? Math.max(...existingTodos.map(t => t.order))
      : -1;

    const [todo] = await db
      .insert(todos)
      .values({
        appId,
        content,
        order: maxOrder + 1,
      })
      .returning();

    logger.info("Created todo:", todo.id, "for app:", appId);
    return todo;
  });

  createTypedHandler(todoContracts.updateTodo, async (_, params) => {
    const { todoId, content, completed } = params;
    const updateData: Partial<{ content: string; completed: boolean }> = {};

    if (content !== undefined) {
      updateData.content = content;
    }
    if (completed !== undefined) {
      updateData.completed = completed;
    }

    const [todo] = await db
      .update(todos)
      .set(updateData)
      .where(eq(todos.id, todoId))
      .returning();

    if (!todo) {
      throw new Error("Todo not found");
    }

    logger.info("Updated todo:", todoId);
    return todo;
  });

  createTypedHandler(todoContracts.deleteTodo, async (_, todoId) => {
    await db.delete(todos).where(eq(todos.id, todoId));
    logger.info("Deleted todo:", todoId);
  });

  createTypedHandler(todoContracts.reorderTodos, async (_, params) => {
    const { appId, todoIds } = params;

    // Update the order of each todo
    for (let i = 0; i < todoIds.length; i++) {
      await db
        .update(todos)
        .set({ order: i })
        .where(and(eq(todos.id, todoIds[i]), eq(todos.appId, appId)));
    }

    logger.info("Reordered todos for app:", appId);
  });

  createTypedHandler(todoContracts.developTodo, async (_, params) => {
    const { todoId } = params;

    // Get the todo
    const todo = await db.query.todos.findFirst({
      where: eq(todos.id, todoId),
    });

    if (!todo) {
      throw new Error("Todo not found");
    }

    // Get the app
    const app = await db.query.apps.findFirst({
      where: eq(apps.id, todo.appId),
      columns: {
        id: true,
        path: true,
        name: true,
      },
    });

    if (!app) {
      throw new Error("App not found");
    }

    // Get current git commit hash
    let initialCommitHash = null;
    try {
      initialCommitHash = await getCurrentCommitHash({
        path: getDyadAppPath(app.path),
      });
    } catch (error) {
      logger.error("Error getting git revision:", error);
    }

    // Create a new chat
    const [chat] = await db
      .insert(chats)
      .values({
        appId: app.id,
        initialCommitHash,
        title: `Desarrollar: ${todo.content.slice(0, 50)}`,
      })
      .returning();

    // Create the initial message with the todo content
    await db.insert(messages).values({
      chatId: chat.id,
      role: "user",
      content: `Desarrollar la siguiente tarea: ${todo.content}`,
    });

    logger.info(
      "Created chat:",
      chat.id,
      "from todo:",
      todoId,
      "for app:",
      app.id
    );

    return { chatId: chat.id };
  });

  logger.debug("Registered todo IPC handlers");
}
