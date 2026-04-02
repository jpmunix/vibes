import { and, asc, desc, eq } from "drizzle-orm";
import { dialog } from "electron";
import path from "path";
import log from "electron-log";
import { logChatInfo } from "../utils/chat_logger";
import { DEFAULT_STANDARD_MODEL } from "../../lib/schemas";
import { getRemoteDb } from "../../db/remote";
import * as remoteSchema from "../../db/remote-schema";
import { getVibesAppPath } from "../../paths/paths";
import { todoContracts, todoAttachmentContracts } from "../types/todo";
import { getCurrentCommitHash } from "../utils/git_utils";
import { createTypedHandler } from "./base";
import { openRouterCompletion } from "../utils/openrouter";
import fs from "fs/promises";

const logger = log.scope("todo_handlers");

function mapTodo(todo: any) {
  return {
    ...todo,
    completed: !!todo.completed,
    checklist: Array.isArray(todo.checklist) ? todo.checklist : (typeof todo.checklist === "string" ? JSON.parse(todo.checklist) : []),
    attachments: Array.isArray(todo.attachments) ? todo.attachments : (typeof todo.attachments === "string" ? JSON.parse(todo.attachments) : []),
  };
}

export function registerTodoHandlers() {
  createTypedHandler(todoContracts.getTodosByApp, async (_, appId, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    const todos = await db.query.todos.findMany({
      where: and(eq(remoteSchema.todos.appId, appId), eq(remoteSchema.todos.userId, context.userId!)),
      orderBy: [asc(remoteSchema.todos.order), asc(remoteSchema.todos.createdAt)],
    });
    return todos.map(mapTodo);
  });

  createTypedHandler(todoContracts.getTodos, async (_, __, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    const todos = await db.query.todos.findMany({
      where: eq(remoteSchema.todos.userId, context.userId!),
      orderBy: [asc(remoteSchema.todos.createdAt)],
    });
    return todos.map(mapTodo);
  });

  createTypedHandler(todoContracts.getTodoSectionsByApp, async (_, appId, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    return await db.query.todoSections.findMany({
      where: and(eq(remoteSchema.todoSections.appId, appId), eq(remoteSchema.todoSections.userId, context.userId!)),
      orderBy: [asc(remoteSchema.todoSections.order)],
    });
  });

  createTypedHandler(todoContracts.createTodoSection, async (_, params, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    const { appId, title } = params;
    const existing = await db.query.todoSections.findMany({
      where: and(eq(remoteSchema.todoSections.appId, appId), eq(remoteSchema.todoSections.userId, context.userId!)),
    });
    const maxOrder =
      existing.length > 0 ? Math.max(...existing.map((s) => s.order)) : -1;

    const [section] = await db
      .insert(remoteSchema.todoSections)
      .values({
        appId,
        userId: context.userId!,
        title,
        order: maxOrder + 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return section;
  });

  createTypedHandler(todoContracts.updateTodoSection, async (_, params, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    const { sectionId, title, order } = params;
    const [section] = await db
      .update(remoteSchema.todoSections)
      .set({
        ...(title !== undefined && { title }),
        ...(order !== undefined && { order }),
        updatedAt: new Date(),
      })
      .where(and(eq(remoteSchema.todoSections.id, sectionId), eq(remoteSchema.todoSections.userId, context.userId!)))
      .returning();

    return section;
  });

  createTypedHandler(todoContracts.deleteTodoSection, async (_, sectionId, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    // Security: ensure the section belongs to the user
    const section = await db.query.todoSections.findFirst({
      where: and(eq(remoteSchema.todoSections.id, sectionId), eq(remoteSchema.todoSections.userId, context.userId!)),
    });
    if (!section) throw new Error("Section not found or unauthorized");

    // Delete all todos in this section first
    await db.delete(remoteSchema.todos).where(and(eq(remoteSchema.todos.sectionId, sectionId), eq(remoteSchema.todos.userId, context.userId!)));
    // Then delete the section
    await db.delete(remoteSchema.todoSections).where(and(eq(remoteSchema.todoSections.id, sectionId), eq(remoteSchema.todoSections.userId, context.userId!)));
  });

  createTypedHandler(todoContracts.createTodo, async (_, params, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    const { appId, content, sectionId } = params;

    const existingTodos = await db.query.todos.findMany({
      where: sectionId
        ? and(eq(remoteSchema.todos.appId, appId), eq(remoteSchema.todos.sectionId, sectionId), eq(remoteSchema.todos.userId, context.userId!))
        : and(eq(remoteSchema.todos.appId, appId), eq(remoteSchema.todos.userId, context.userId!)),
      orderBy: [asc(remoteSchema.todos.order)],
    });

    const maxOrder =
      existingTodos.length > 0
        ? Math.max(...existingTodos.map((t) => t.order))
        : -1;

    const [todo] = await db
      .insert(remoteSchema.todos)
      .values({
        appId,
        userId: context.userId!,
        sectionId: sectionId ?? null,
        content,
        description: params.description,
        prompt: params.prompt,
        completed: params.completed ? 1 : 0,
        checklist: params.checklist ? JSON.stringify(params.checklist) : null,
        order: maxOrder + 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    logger.info("Created todo:", todo.id, "for app:", appId);
    return mapTodo(todo);
  });

  createTypedHandler(todoContracts.updateTodo, async (_, params, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    const { todoId, sectionId, content, completed, order } = params;
    const updateData: any = {
      updatedAt: new Date(),
    };

    if (content !== undefined) updateData.content = content;
    if (sectionId !== undefined) updateData.sectionId = sectionId;
    if (params.description !== undefined)
      updateData.description = params.description;
    if (params.prompt !== undefined) updateData.prompt = params.prompt;
    if (completed !== undefined) updateData.completed = completed ? 1 : 0;
    if (order !== undefined) updateData.order = order;
    if (params.developmentSummary !== undefined)
      updateData.developmentSummary = params.developmentSummary;
    if (params.checklist !== undefined)
      updateData.checklist = params.checklist ? JSON.stringify(params.checklist) : null;

    const [todo] = await db
      .update(remoteSchema.todos)
      .set(updateData)
      .where(and(eq(remoteSchema.todos.id, todoId), eq(remoteSchema.todos.userId, context.userId!)))
      .returning();

    if (!todo) throw new Error("Todo not found");

    logger.info("Updated todo:", todoId);
    return mapTodo(todo);
  });

  createTypedHandler(todoContracts.deleteTodo, async (_, todoId, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    await db.delete(remoteSchema.todos).where(and(eq(remoteSchema.todos.id, todoId), eq(remoteSchema.todos.userId, context.userId!)));
    logger.info("Deleted todo:", todoId);
  });

  createTypedHandler(todoContracts.reorderTodos, async (_, params, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    const { appId, sectionId, todoIds } = params;

    for (let i = 0; i < todoIds.length; i++) {
      await db
        .update(remoteSchema.todos)
        .set({ order: i, sectionId: sectionId ?? null })
        .where(and(eq(remoteSchema.todos.id, todoIds[i]), eq(remoteSchema.todos.appId, appId), eq(remoteSchema.todos.userId, context.userId!)));
    }

    logger.info("Reordered todos for app/section:", appId, sectionId);
  });

  createTypedHandler(todoContracts.reorderTodoSections, async (_, params, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    const { appId, sectionIds } = params;

    for (let i = 0; i < sectionIds.length; i++) {
      await db
        .update(remoteSchema.todoSections)
        .set({ order: i })
        .where(
          and(
            eq(remoteSchema.todoSections.id, sectionIds[i]),
            eq(remoteSchema.todoSections.appId, appId),
            eq(remoteSchema.todoSections.userId, context.userId!),
          ),
        );
    }

    logger.info("Reordered sections for app:", appId);
  });

  // Keep existing developTodo and refineTodoPrompt handlers as they are
  createTypedHandler(todoContracts.developTodo, async (_, params, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    const { todoId } = params;

    const todo = await db.query.todos.findFirst({
      where: and(eq(remoteSchema.todos.id, todoId), eq(remoteSchema.todos.userId, context.userId!)),
    });

    if (!todo) throw new Error("Todo not found");

    const app = await db.query.apps.findFirst({
      where: and(eq(remoteSchema.apps.id, todo.appId), eq(remoteSchema.apps.userId, context.userId!)),
      columns: { id: true, path: true, name: true },
    });

    if (!app) throw new Error("App not found");

    let initialCommitHash = null;
    try {
      initialCommitHash = await getCurrentCommitHash({
        path: getVibesAppPath(app.path),
      });
    } catch (error) {
      logger.error("Error getting git revision:", error);
    }

    const [chat] = await db
      .insert(remoteSchema.chats)
      .values({
        appId: app.id,
        userId: context.userId!,
        todoId: todo.id,
        initialCommitHash,
        title: `Desarrollar: ${todo.content.slice(0, 50)}`,
        createdAt: new Date(),
      })
      .returning();

    const initialContent = params.prompt || todo.prompt || todo.content;

    await db.insert(remoteSchema.messages).values({
      chatId: chat.id,
      userId: context.userId!,
      role: "user",
      content: initialContent,
      createdAt: new Date(),
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

  createTypedHandler(todoContracts.refineTodoPrompt, async (_, params, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    logger.info("refineTodoPrompt called with params:", params);
    const { todoId } = params;

    const todo = await db.query.todos.findFirst({
      where: and(eq(remoteSchema.todos.id, todoId), eq(remoteSchema.todos.userId, context.userId!)),
    });

    if (!todo) {
      logger.error("Todo not found:", todoId);
      throw new Error("Todo not found");
    }

    const { readSettings } = await import("../../main/settings");
    const settings = readSettings();
    const model =
      settings.standardModeModel || DEFAULT_STANDARD_MODEL;

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
      settings.standardModeModel || DEFAULT_STANDARD_MODEL;

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
  createTypedHandler(todoContracts.generateTodoSummary, async (_, todoId, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    logger.info("generateTodoSummary called for todoId:", todoId);
    const todo = await db.query.todos.findFirst({
      where: and(eq(remoteSchema.todos.id, todoId), eq(remoteSchema.todos.userId, context.userId!)),
    });
    if (!todo) throw new Error("Todo not found");

    // Find the last chat associated with this todo
    const chat = await db.query.chats.findFirst({
      where: and(eq(remoteSchema.chats.todoId, todoId), eq(remoteSchema.chats.userId, context.userId!)),
      orderBy: [desc(remoteSchema.chats.createdAt)],
      with: {
        messages: {
          orderBy: [asc(remoteSchema.messages.createdAt)],
        },
      },
    });

    if (!chat || !chat.messages.length) {
      return "No hay conversación para resumir.";
    }

    const { readSettings } = await import("../../main/settings");
    const settings = readSettings();
    const model =
      settings.standardModeModel || DEFAULT_STANDARD_MODEL;

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
        .update(remoteSchema.todos)
        .set({ developmentSummary: newSummary, updatedAt: new Date() })
        .where(and(eq(remoteSchema.todos.id, todoId), eq(remoteSchema.todos.userId, context.userId!)));

      return newSummary;
    } catch (error) {
      logger.error("Error generating todo summary:", error);
      throw new Error("Error al generar el resumen de desarrollo");
    }
  });

  // ─── Attachment Upload/Remove Handlers ───

  createTypedHandler(todoAttachmentContracts.uploadFile, async (_, params, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    const { todoId, fileName, data, contentType } = params;

    // Verify todo belongs to user
    const todo = await db.query.todos.findFirst({
      where: and(eq(remoteSchema.todos.id, todoId), eq(remoteSchema.todos.userId, context.userId!)),
    });
    if (!todo) throw new Error("Todo not found");

    // Build safe file name
    const ext = fileName.includes(".") ? "." + fileName.split(".").pop() : "";
    const baseName = fileName.replace(ext, "");
    const safeName = baseName.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    const uniqueFileName = `${safeName}-${Date.now()}${ext}`;
    const uploadPath = `user_files/${context.userId}/${uniqueFileName}`;
    const uploadUrl = `https://storage.bunnycdn.com/minube-vibes/${uploadPath}`;

    // Upload to Bunny Storage
    const BUNNY_STORAGE_API_KEY = "d77a3ad3-1def-4842-b4b2bda55195-7dd9-4647";

    let body: Buffer | string = data;
    if (typeof data === "string" && data.includes(";base64,")) {
      body = Buffer.from(data.split(";base64,")[1], "base64");
    } else if (typeof data === "string") {
      if (data.length > 0 && /^[A-Za-z0-9+/=]+$/.test(data)) {
        try { body = Buffer.from(data, "base64"); } catch { body = data; }
      }
    }

    const fetchBody: BodyInit = typeof body === "string" ? body : new Uint8Array(body as Buffer);
    const response = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "AccessKey": BUNNY_STORAGE_API_KEY,
        "Content-Type": contentType || "application/octet-stream",
      },
      body: fetchBody,
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`Bunny Storage upload failed: ${response.status}`, errorText);
      throw new Error(`Upload failed: ${response.statusText}`);
    }

    const cdnUrl = `https://minube-vibes.b-cdn.net/${uploadPath}`;
    logger.info(`Uploaded todo attachment. CDN URL: ${cdnUrl}`);

    // Update attachments in DB
    const existing: string[] = Array.isArray(todo.attachments)
      ? todo.attachments as string[]
      : typeof todo.attachments === "string"
        ? JSON.parse(todo.attachments as string)
        : [];
    const newAttachments = [...existing, cdnUrl];

    await db
      .update(remoteSchema.todos)
      .set({ attachments: JSON.stringify(newAttachments), updatedAt: new Date() })
      .where(and(eq(remoteSchema.todos.id, todoId), eq(remoteSchema.todos.userId, context.userId!)));

    return { url: cdnUrl };
  });

  createTypedHandler(todoAttachmentContracts.removeAttachment, async (_, params, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    const { todoId, url } = params;

    const todo = await db.query.todos.findFirst({
      where: and(eq(remoteSchema.todos.id, todoId), eq(remoteSchema.todos.userId, context.userId!)),
    });
    if (!todo) throw new Error("Todo not found");

    const existing: string[] = Array.isArray(todo.attachments)
      ? todo.attachments as string[]
      : typeof todo.attachments === "string"
        ? JSON.parse(todo.attachments as string)
        : [];
    const newAttachments = existing.filter((u) => u !== url);

    await db
      .update(remoteSchema.todos)
      .set({ attachments: JSON.stringify(newAttachments), updatedAt: new Date() })
      .where(and(eq(remoteSchema.todos.id, todoId), eq(remoteSchema.todos.userId, context.userId!)));

    // Try to delete from Bunny Storage (best effort)
    try {
      const BUNNY_STORAGE_API_KEY = "d77a3ad3-1def-4842-b4b2bda55195-7dd9-4647";
      const storagePath = url.replace("https://minube-vibes.b-cdn.net/", "");
      const deleteUrl = `https://storage.bunnycdn.com/minube-vibes/${storagePath}`;
      await fetch(deleteUrl, {
        method: "DELETE",
        headers: { "AccessKey": BUNNY_STORAGE_API_KEY },
      });
      logger.info(`Deleted attachment from Bunny Storage: ${storagePath}`);
    } catch (err) {
      logger.warn("Failed to delete attachment from storage (best effort):", err);
    }
  });

  logger.debug("Registered todo IPC handlers");
}
