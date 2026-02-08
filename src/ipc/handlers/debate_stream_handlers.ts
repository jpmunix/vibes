import { ipcMain } from "electron";
import { db } from "../../db";
import { debates, debateMessages } from "../../db/schema";
import { eq } from "drizzle-orm";
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
                            "Eres un asistente de debate experto en el módulo 'mini ChatGPT'. Ayuda a los usuarios a explorar diferentes perspectivas sobre un tema de manera objetiva, crítica y constructiva. Utiliza el contexto inyectado (chats, notas, tareas) si es relevante para enriquecer el debate. Mantén un tono profesional y fluido.",
                    },
                    ...history,
                    { role: "user", content: userPrompt },
                ],
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
