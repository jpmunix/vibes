import { ipcMain } from "electron";
import { db } from "../../db";
import { debates, debateMessages, todos, notes, chats, apps, messages } from "../../db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import log from "electron-log";
import { readSettings } from "../../main/settings";
import { getModelClient } from "../utils/get_model_client";
import { streamText } from "ai";
import { safeSend } from "../utils/safe_sender";

const logger = log.scope("debate_stream_handlers");

export function registerDebateStreamHandlers() {
    ipcMain.handle("debate:stream", async (event, req) => {
        const { debateId, prompt, injectedItems } = req;
        try {
            // Notify renderer that stream is starting
            safeSend(event.sender, "debate:stream:start", { debateId });

            // Get the debate
            const debate = await db.query.debates.findFirst({
                where: eq(debates.id, debateId),
                with: {
                    messages: {
                        orderBy: (messages, { asc }) => [asc(messages.createdAt)],
                    },
                },
            });

            if (!debate) throw new Error("Debate not found");

            // Construct history
            const history = (debate.messages || []).map((m) => ({
                role: m.role as "user" | "assistant" | "system",
                content: m.content,
            }));

            // Construct injected content string
            let injectedContent = "";
            if (injectedItems && injectedItems.length > 0) {
                injectedContent = "\n\n--- CONTEXTO INYECTADO ---\n";
                injectedItems.forEach((item: any) => {
                    injectedContent += `[${item.type.toUpperCase()}] ${item.title}:\n${item.fragment || item.content}\n\n`;
                });
            }

            const userPrompt = prompt + injectedContent;

            // Save user message
            await db.insert(debateMessages).values({
                debateId,
                role: "user",
                content: userPrompt,
                injectedItems: injectedItems || [],
            });

            // Fetch all messages including the new user message
            const messagesAfterUser = await db.query.debateMessages.findMany({
                where: eq(debateMessages.debateId, debateId),
                orderBy: (messages, { asc }) => [asc(messages.createdAt)],
            });

            // Send updated messages to frontend
            safeSend(event.sender, "debate:response:chunk", {
                debateId,
                messages: messagesAfterUser,
            });

            const settings = readSettings();
            let selectedModel = settings.selectedModel;

            if (settings.debateModel && settings.debateModel !== "SAME_AS_CHAT") {
                const { getLanguageModelProviders, getLanguageModels } = await import("../shared/language_model_helpers");
                const allModels = await getLanguageModels({ providerId: "openrouter" });
                const found = allModels.find(m => m.apiName === settings.debateModel);
                if (found) {
                    selectedModel = {
                        name: found.apiName,
                        provider: "openrouter"
                    };
                }
            }

            const { modelClient } = await getModelClient(selectedModel, settings);

            // Create placeholder assistant message
            const [assistantMsg] = await db
                .insert(debateMessages)
                .values({
                    debateId,
                    role: "assistant",
                    content: "",
                })
                .returning();

            let fullResponse = "";

            const result = await streamText({
                model: modelClient.model,
                messages: [
                    {
                        role: "system",
                        content:
                            `Eres un asistente de debate experto en el módulo 'mini ChatGPT'. Ayuda a los usuarios a explorar diferentes perspectivas sobre un tema de manera objetiva, crítica y constructiva. Utiliza el contexto inyectado (chats, notas, tareas) si es relevante para enriquecer el debate. Mantén un tono profesional y fluido.

                            Tienes acceso a herramientas para crear tareas, notas o iniciar el desarrollo de una funcionalidad. Úsalas SOLO cuando el usuario te lo pida explícitamente.
                            - Para "crear una tarea" o "añadir a todos", usa 'create_todo'.
                            - Para "crear una nota" o "guardar resumen", usa 'create_note'.
                            - Para "mandar a desarrollar", "implementar esto" o "empezar a programar", usa 'start_development'.`,
                    },
                    ...history,
                    { role: "user", content: userPrompt },
                ],
                tools: {
                    create_todo: {
                        description: "Crear una nueva tarea en la lista de todos",
                        parameters: z.object({
                            content: z.string().describe("El contenido o título de la tarea"),
                            description: z.string().optional().describe("Descripción detallada de la tarea"),
                        }),
                        execute: async ({ content, description }) => {
                            if (!req.appId) return "Error: No hay una aplicación seleccionada para crear la tarea.";
                            try {
                                const [todo] = await db.insert(todos).values({
                                    appId: req.appId,
                                    content,
                                    description: description,
                                    completed: false,
                                    createdAt: new Date(),
                                    updatedAt: new Date(),
                                }).returning();
                                safeSend(event.sender, "ipc-event", { channel: "todos:updated", payload: { appId: req.appId } }); // Notify frontend
                                return `Tarea creada: "${content}" (ID: ${todo.id})`;
                            } catch (e: any) {
                                return `Error al crear tarea: ${e.message}`;
                            }
                        },
                    },
                    create_note: {
                        description: "Crear una nueva nota",
                        parameters: z.object({
                            title: z.string().describe("El título de la nota"),
                            content: z.string().describe("El contenido de la nota"),
                        }),
                        execute: async ({ title, content }) => {
                            try {
                                const [note] = await db.insert(notes).values({
                                    title,
                                    content,
                                }).returning();
                                safeSend(event.sender, "ipc-event", { channel: "notes:updated" }); // Notify frontend (if listener exists)
                                return `Nota creada: "${title}" (ID: ${note.id})`;
                            } catch (e: any) {
                                return `Error al crear nota: ${e.message}`;
                            }
                        },
                    },
                    start_development: {
                        description: "Iniciar el desarrollo de una funcionalidad creando un nuevo chat de desarrollo",
                        parameters: z.object({
                            title: z.string().describe("Título breve de la funcionalidad a desarrollar"),
                            description: z.string().describe("Descripción técnica detallada de lo que se debe implementar"),
                        }),
                        execute: async ({ title, description }) => {
                            if (!req.appId) return "Error: No hay una aplicación seleccionada para iniciar el desarrollo.";
                            try {
                                // 1. Create a logical Todo for tracking (optional but good for consistency)
                                const [todo] = await db.insert(todos).values({
                                    appId: req.appId,
                                    content: title,
                                    description: description,
                                    completed: false,
                                }).returning();

                                // 2. Get App Info for path (needed for git commit hash)
                                const app = await db.query.apps.findFirst({
                                    where: eq(apps.id, req.appId),
                                });
                                if (!app) return "Error: Aplicación no encontrada.";

                                // 3. Get generic git revision
                                let initialCommitHash = null;
                                try {
                                    const { getDyadAppPath } = await import("../../paths/paths");
                                    const { getCurrentCommitHash } = await import("../utils/git_utils");
                                    initialCommitHash = await getCurrentCommitHash({
                                        path: getDyadAppPath(app.path),
                                    });
                                } catch (error) {
                                    logger.warn("Could not get git hash for new chat", error);
                                }

                                // 4. Create Chat
                                const [chat] = await db.insert(chats).values({
                                    appId: req.appId,
                                    todoId: todo.id,
                                    title: `Desarrollar: ${title}`,
                                    initialCommitHash,
                                }).returning();

                                // 5. Add initial system/user message to the chat
                                await db.insert(messages).values({
                                    chatId: chat.id,
                                    role: "user",
                                    content: `Quiero desarrollar la siguiente funcionalidad:\n\n**${title}**\n\n${description}\n\nPor favor, analiza los archivos necesarios y propón un plan de implementación.`,
                                });

                                safeSend(event.sender, "ipc-event", { channel: "chats:updated", payload: { appId: req.appId } });
                                safeSend(event.sender, "ipc-event", { channel: "todos:updated", payload: { appId: req.appId } });

                                return `Desarrollo iniciado. Se ha creado el chat "${chat.title}" y la tarea asociada.`;
                            } catch (e: any) {
                                return `Error al iniciar desarrollo: ${e.message}`;
                            }
                        },
                    },
                },
            });

            for await (const delta of result.textStream) {
                fullResponse += delta;

                // Send chunk to frontend
                safeSend(event.sender, "debate:response:chunk", {
                    debateId,
                    messages: [...messagesAfterUser, { ...assistantMsg, content: fullResponse }],
                });
            }

            // Final update
            await db
                .update(debateMessages)
                .set({ content: fullResponse })
                .where(eq(debateMessages.id, assistantMsg.id));
            await db
                .update(debates)
                .set({ updatedAt: new Date() })
                .where(eq(debates.id, debateId));

            safeSend(event.sender, "debate:response:end", {
                debateId,
            });
        } catch (e: any) {
            logger.error("Error in debate stream", e);
            safeSend(event.sender, "debate:response:error", {
                debateId: debateId,
                error: e.message,
            });
        }
    });
}
