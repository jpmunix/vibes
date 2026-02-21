import { and, asc, desc, eq } from "drizzle-orm";
import { dialog } from "electron";
import path from "path";
import log from "electron-log";
import { logChatInfo } from "../utils/chat_logger";
import { db } from "../../db";
import { apps, chats, messages, todos, todoSections } from "../../db/schema";
import { getDyadAppPath } from "../../paths/paths";
import { todoContracts } from "../types/todo";
import { getCurrentCommitHash } from "../utils/git_utils";
import { createTypedHandler } from "./base";
import { openRouterCompletion } from "../utils/openrouter";
import fs from "fs/promises";

const logger = log.scope("todo_handlers");

export function registerTodoHandlers() {
  createTypedHandler(todoContracts.getTodosByApp, async (_, appId) => {
    return await db.query.todos.findMany({
      where: eq(todos.appId, appId),
      orderBy: [asc(todos.order), asc(todos.createdAt)],
    });
  });

  createTypedHandler(todoContracts.getTodos, async () => {
    return await db.query.todos.findMany({
      orderBy: [asc(todos.createdAt)],
    });
  });

  createTypedHandler(todoContracts.getTodoSectionsByApp, async (_, appId) => {
    return await db.query.todoSections.findMany({
      where: eq(todoSections.appId, appId),
      orderBy: [asc(todoSections.order)],
    });
  });

  createTypedHandler(todoContracts.createTodoSection, async (_, params) => {
    const { appId, title } = params;
    const existing = await db.query.todoSections.findMany({
      where: eq(todoSections.appId, appId),
    });
    const maxOrder =
      existing.length > 0 ? Math.max(...existing.map((s) => s.order)) : -1;

    const [section] = await db
      .insert(todoSections)
      .values({
        appId,
        title,
        order: maxOrder + 1,
      })
      .returning();

    return section;
  });

  createTypedHandler(todoContracts.updateTodoSection, async (_, params) => {
    const { sectionId, title, order } = params;
    const [section] = await db
      .update(todoSections)
      .set({
        ...(title !== undefined && { title }),
        ...(order !== undefined && { order }),
        updatedAt: new Date(),
      })
      .where(eq(todoSections.id, sectionId))
      .returning();

    return section;
  });

  createTypedHandler(todoContracts.deleteTodoSection, async (_, sectionId) => {
    // Delete all todos in this section first
    await db.delete(todos).where(eq(todos.sectionId, sectionId));
    // Then delete the section
    await db.delete(todoSections).where(eq(todoSections.id, sectionId));
  });

  createTypedHandler(todoContracts.createTodo, async (_, params) => {
    const { appId, content, sectionId } = params;

    const existingTodos = await db.query.todos.findMany({
      where: sectionId
        ? and(eq(todos.appId, appId), eq(todos.sectionId, sectionId))
        : eq(todos.appId, appId),
      orderBy: [asc(todos.order)],
    });

    const maxOrder =
      existingTodos.length > 0
        ? Math.max(...existingTodos.map((t) => t.order))
        : -1;

    const [todo] = await db
      .insert(todos)
      .values({
        appId,
        sectionId: sectionId ?? null,
        content,
        description: params.description,
        prompt: params.prompt,
        completed: params.completed ?? false,
        checklist: params.checklist ?? [],
        order: maxOrder + 1,
      })
      .returning();

    logger.info("Created todo:", todo.id, "for app:", appId);
    return todo;
  });

  createTypedHandler(todoContracts.updateTodo, async (_, params) => {
    const { todoId, sectionId, content, completed, order } = params;
    const updateData: any = {
      updatedAt: new Date(),
    };

    if (content !== undefined) updateData.content = content;
    if (sectionId !== undefined) updateData.sectionId = sectionId;
    if (params.description !== undefined)
      updateData.description = params.description;
    if (params.prompt !== undefined) updateData.prompt = params.prompt;
    if (completed !== undefined) updateData.completed = completed;
    if (order !== undefined) updateData.order = order;
    if (params.developmentSummary !== undefined)
      updateData.developmentSummary = params.developmentSummary;
    if (params.checklist !== undefined)
      updateData.checklist = params.checklist;

    const [todo] = await db
      .update(todos)
      .set(updateData)
      .where(eq(todos.id, todoId))
      .returning();

    if (!todo) throw new Error("Todo not found");

    logger.info("Updated todo:", todoId);
    return todo;
  });

  createTypedHandler(todoContracts.deleteTodo, async (_, todoId) => {
    await db.delete(todos).where(eq(todos.id, todoId));
    logger.info("Deleted todo:", todoId);
  });

  createTypedHandler(todoContracts.reorderTodos, async (_, params) => {
    const { appId, sectionId, todoIds } = params;

    for (let i = 0; i < todoIds.length; i++) {
      await db
        .update(todos)
        .set({ order: i, sectionId: sectionId ?? null })
        .where(and(eq(todos.id, todoIds[i]), eq(todos.appId, appId)));
    }

    logger.info("Reordered todos for app/section:", appId, sectionId);
  });

  createTypedHandler(todoContracts.reorderTodoSections, async (_, params) => {
    const { appId, sectionIds } = params;

    for (let i = 0; i < sectionIds.length; i++) {
      await db
        .update(todoSections)
        .set({ order: i })
        .where(
          and(
            eq(todoSections.id, sectionIds[i]),
            eq(todoSections.appId, appId),
          ),
        );
    }

    logger.info("Reordered sections for app:", appId);
  });

  // Keep existing developTodo and refineTodoPrompt handlers as they are
  createTypedHandler(todoContracts.developTodo, async (_, params) => {
    const { todoId } = params;

    const todo = await db.query.todos.findFirst({
      where: eq(todos.id, todoId),
    });

    if (!todo) throw new Error("Todo not found");

    const app = await db.query.apps.findFirst({
      where: eq(apps.id, todo.appId),
      columns: { id: true, path: true, name: true },
    });

    if (!app) throw new Error("App not found");

    let initialCommitHash = null;
    try {
      initialCommitHash = await getCurrentCommitHash({
        path: getDyadAppPath(app.path),
      });
    } catch (error) {
      logger.error("Error getting git revision:", error);
    }

    const [chat] = await db
      .insert(chats)
      .values({
        appId: app.id,
        todoId: todo.id,
        initialCommitHash,
        title: `Desarrollar: ${todo.content.slice(0, 50)}`,
      })
      .returning();

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
      app.id,
    );

    return { chatId: chat.id };
  });

  createTypedHandler(todoContracts.refineTodoPrompt, async (_, params) => {
    logger.info("refineTodoPrompt called with params:", params);
    const { todoId } = params;

    const todo = await db.query.todos.findFirst({
      where: eq(todos.id, todoId),
    });

    if (!todo) {
      logger.error("Todo not found:", todoId);
      throw new Error("Todo not found");
    }

    const { readSettings } = await import("../../main/settings");
    const settings = readSettings();
    const model =
      settings.standardModeModel || "openai/gpt-4.1-mini";

    try {
      const todoTitle = todo.content;
      const todoDescription = todo.description || "";
      const todoContext = `Título: ${todoTitle}\nDescripción: ${todoDescription}`;

      const { getEffectivePrompt } = await import("../../prompts");
      const systemPrompt = getEffectivePrompt("todo_refinement", settings);

      const data = await openRouterCompletion({
        model,
        title: "todo-refinement",
        temperature: 0.1, // Lower temperature for more deterministic output
        max_tokens: 1500,
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: `Tarea:\n${todoContext}`,
          },
        ],
      });

      const generatedPrompt =
        data?.choices?.[0]?.message?.content?.trim() || "";
      const usage = data?.usage;
      if (usage) {
        void logChatInfo(
          todoId,
          "token-usage",
          `Refine Todo Prompt - Total tokens: ${usage.total_tokens}`,
          {
            totalTokens: usage.total_tokens,
            inputTokens: usage.prompt_tokens,
            outputTokens: usage.completion_tokens,
            model,
            type: "refine-todo-prompt",
          },
        );
      }

      return { prompt: generatedPrompt };
    } catch (error) {
      logger.error("Error generating todo prompt:", error);
      throw new Error("Error al generar el prompt para la tarea");
    }
  });

  createTypedHandler(todoContracts.analyzeTodoFiles, async (_, params) => {
    const { appId, files } = params;
    const { readSettings } = await import("../../main/settings");
    const settings = readSettings();
    const model =
      settings.standardModeModel || "openai/gpt-4.1-mini";

    const { getEffectivePrompt } = await import("../../prompts");
    const systemPrompt = getEffectivePrompt("todo_analysis", settings);

    const messages: any[] = [{ role: "system", content: systemPrompt }];

    let userContent = "Analiza estos archivos para extraer tareas:\n\n";
    let hasImages = false;

    for (const file of files) {
      if (file.type.startsWith("image/")) {
        hasImages = true;
        messages.push({
          role: "user",
          content: [
            { type: "text", text: `Archivo: ${file.name}` },
            {
              type: "image_url",
              image_url: {
                url: `data:${file.type};base64,${file.data}`,
              },
            },
          ],
        });
      } else {
        let content = "";
        try {
          const buffer = await fs.readFile(file.path);
          if (file.name.toLowerCase().endsWith(".pdf")) {
            const pdfModule = await import("pdf-parse");
            const pdf = (pdfModule as any).default || pdfModule;
            const data = await pdf(buffer);
            content = data.text;
          } else if (file.name.toLowerCase().endsWith(".docx")) {
            const mammoth = await import("mammoth");
            const result = await mammoth.extractRawText({ buffer });
            content = result.value;
          } else {
            content = buffer.toString("utf-8");
          }
        } catch (err) {
          logger.error(`Error reading file ${file.path}:`, err);
        }
        userContent += `--- ARCHIVO: ${file.name} ---\n${content}\n\n`;
      }
    }

    if (
      !hasImages ||
      userContent.length >
      "Analiza estos archivos para extraer tareas:\n\n".length
    ) {
      messages.push({ role: "user", content: userContent });
    }

    try {
      const data = await openRouterCompletion({
        model,
        title: "todo-analysis",
        temperature: 0.1,
        messages,
        response_format: { type: "json_object" },
      });

      const responseContent = data?.choices?.[0]?.message?.content || "{}";
      const result = JSON.parse(responseContent);

      const usage = data?.usage;
      if (usage) {
        void logChatInfo(
          appId,
          "token-usage",
          `Analyze Todo Files - Total tokens: ${usage.total_tokens}`,
          {
            totalTokens: usage.total_tokens,
            inputTokens: usage.prompt_tokens,
            outputTokens: usage.completion_tokens,
            model,
            type: "analyze-todo-files",
          },
        );
      }

      return result;
    } catch (error) {
      logger.error("Error analyzing todo files:", error);
      throw new Error("Error al analizar los archivos y extraer tareas");
    }
  });

  createTypedHandler(todoContracts.selectTodoFiles, async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile", "multiSelections"],
      filters: [
        {
          name: "Archivos permitidos",
          extensions: [
            "pdf",
            "docx",
            "txt",
            "md",
            "png",
            "jpg",
            "jpeg",
            "webp",
          ],
        },
      ],
    });

    if (result.canceled) return [];

    const fileInfos = [];
    for (const filePath of result.filePaths) {
      const fileName = path.basename(filePath);
      const ext = path.extname(filePath).toLowerCase();
      let type = "text/plain";
      if ([".png", ".jpg", ".jpeg", ".webp"].includes(ext)) {
        type = `image/${ext.replace(".", "")}`;
        if (type === "image/jpg") type = "image/jpeg";
      }

      const info: any = { name: fileName, path: filePath, type };

      // If image, we need data
      if (type.startsWith("image/")) {
        const buffer = await fs.readFile(filePath);
        info.data = buffer.toString("base64");
      }

      fileInfos.push(info);
    }
    return fileInfos;
  });
  createTypedHandler(todoContracts.generateTodoSummary, async (_, todoId) => {
    logger.info("generateTodoSummary called for todoId:", todoId);
    const todo = await db.query.todos.findFirst({
      where: eq(todos.id, todoId),
    });
    if (!todo) throw new Error("Todo not found");

    // Find the last chat associated with this todo
    const chat = await db.query.chats.findFirst({
      where: eq(chats.todoId, todoId),
      orderBy: [desc(chats.createdAt)],
      with: {
        messages: {
          orderBy: [asc(messages.createdAt)],
        },
      },
    });

    if (!chat || !chat.messages.length) {
      return "No hay conversación para resumir.";
    }

    const { readSettings } = await import("../../main/settings");
    const settings = readSettings();
    const model =
      settings.standardModeModel || "openai/gpt-4.1-mini";

    const chatsContext = chat.messages
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join("\n");

    const { getEffectivePrompt } = await import("../../prompts");
    const systemPrompt = getEffectivePrompt("summarize_chat_system", settings);

    try {
      const data = await openRouterCompletion({
        model,
        title: "todo-summary",
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: `Resume el desarrollo realizado en este chat para la tarea "${todo.content}":\n\n${chatsContext}`,
          },
        ],
      });

      const summary = data?.choices?.[0]?.message?.content?.trim() || "";

      // Update the todo with the new summary
      // If there's already a summary, we could append it, but the user said "nos genere un resumen... y lo añada"
      // Let's append if it exists, or just set it.
      const newSummary = todo.developmentSummary
        ? `${todo.developmentSummary}\n\n---\n\n### Actualización de desarrollo (${new Date().toLocaleDateString()})\n\n${summary}`
        : summary;

      await db
        .update(todos)
        .set({ developmentSummary: newSummary, updatedAt: new Date() })
        .where(eq(todos.id, todoId));

      return newSummary;
    } catch (error) {
      logger.error("Error generating todo summary:", error);
      throw new Error("Error al generar el resumen de desarrollo");
    }
  });

  logger.debug("Registered todo IPC handlers");
}
