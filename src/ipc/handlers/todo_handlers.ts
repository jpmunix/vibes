import { and, asc, eq } from "drizzle-orm";
import log from "electron-log";
import { logChatInfo } from "../utils/chat_logger";
import { db } from "../../db";
import { apps, chats, messages, todos } from "../../db/schema";
import { getDyadAppPath } from "../../paths/paths";
import { todoContracts } from "../types/todo";
import { getCurrentCommitHash } from "../utils/git_utils";
import { createTypedHandler } from "./base";
import { openRouterCompletion } from "../utils/openrouter";

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
        description: params.description,
        prompt: params.prompt,
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
    if (params.description !== undefined) {
      (updateData as any).description = params.description;
    }
    if (params.prompt !== undefined) {
      (updateData as any).prompt = params.prompt;
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
        todoId: todo.id,
        initialCommitHash,
        title: `Desarrollar: ${todo.content.slice(0, 50)}`,
      })
      .returning();

    // Create the initial message with the todo content or prompt
    const initialContent = params.prompt || todo.prompt || todo.content;

    await db.insert(messages).values({
      chatId: chat.id,
      role: "user",
      content: initialContent,
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

  createTypedHandler(
    todoContracts.refineTodoPrompt,
    async (_, params) => {
      logger.info("refineTodoPrompt called with params:", params);
      const { todoId } = params;

      // Get the todo
      const todo = await db.query.todos.findFirst({
        where: eq(todos.id, todoId),
      });

      if (!todo) {
        logger.error("Todo not found:", todoId);
        throw new Error("Todo not found");
      }

      logger.info("Found todo:", todo.id, todo.content);

      const { readSettings } = await import("../../main/settings");
      const settings = readSettings();
      if (!settings.providerSettings?.openrouter?.apiKey?.value?.trim()) {
        logger.error("OpenRouter API key not found");
        throw new Error("OpenRouter API key not found");
      }

      const model =
        settings.appTitleGenerationModel || "google/gemini-2.5-flash-lite";

      logger.info("Using model:", model);

      try {
        const todoTitle = todo.content;
        const todoDescription = todo.description || "";
        const todoContext = `Título: ${todoTitle}\nDescripción: ${todoDescription}`;

        const data = await openRouterCompletion({
          model,
          temperature: 0.7,
          max_tokens: 1000,
          messages: [
            {
              role: "system",
              content:
                "Genera un prompt para desarrollar la tarea proporcionada. Describe lo que se especifica en la tarea, sin asumir características o funcionalidades adicionales pero pensando en cómo la IA puede comprender mejor la idea del usuario que, eventualmente, puede ser vaga o imprecisa. No incluyas descripciones del rol de la IA ni instrucciones sobre cómo debe comportarse. Responde ÚNICAMENTE con el prompt generado. El idioma del prompt debe coincidir con el de la tarea.",
            },
            {
              role: "user",
              content: `Genera un prompt de desarrollo para la siguiente tarea:\n\n${todoContext}`,
            },
          ],
        });

        const generatedPrompt =
          data?.choices?.[0]?.message?.content?.trim() || "";

        // Log token usage for the refined prompt
        const usage = data?.usage;
        if (usage) {
          void logChatInfo(
            todoId, // Using todoId as a loose reference if chatId not available, but category is key
            "token-usage",
            `Refine Todo Prompt - Total tokens: ${usage.total_tokens} (input: ${usage.prompt_tokens}, output: ${usage.completion_tokens})`,
            {
              totalTokens: usage.total_tokens,
              inputTokens: usage.prompt_tokens,
              outputTokens: usage.completion_tokens,
              model,
              type: "refine-todo-prompt",
            }
          );
        }

        return { prompt: generatedPrompt };
      } catch (error) {
        logger.error("Error generating todo prompt:", error);
        throw new Error("Error al generar el prompt para la tarea");
      }
    },
  );

  logger.debug("Registered todo IPC handlers");
}
