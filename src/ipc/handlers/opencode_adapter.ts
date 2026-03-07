/**
 * OpenCode AI SDK Adapter
 * 
 * Integrates the OpenCode AI agent (https://opencode.ai) as a backend for
 * the minube-vibes chat system. Uses the @opencode-ai/sdk to communicate
 * with a local OpenCode server via HTTP + SSE events.
 * 
 * Architecture:
 *   Electron main process
 *     └─ opencode_adapter.ts
 *          ├─ createOpencode() — starts server + client on first use
 *          ├─ session.create() — one session per chat
 *          ├─ session.prompt() — sends user message, blocks until done
 *          └─ event.subscribe() — SSE stream for real-time updates
 *               → message.part.updated (text deltas, tool states)
 *               → file.edited
 *               → session.status (busy/idle)
 *     └─ chat_stream_handlers.ts — routes "local-agent" mode here (Agente)
 */

import log from "electron-log";
import { createOpencode, createOpencodeClient } from "@opencode-ai/sdk";
import type { IpcMainInvokeEvent } from "electron";
import { readSettings, writeSettings, decrypt } from "../../main/settings";
import { getDyadAppPath } from "../../paths/paths";
import { safeSend } from "../utils/safe_sender";
import type { ChatStreamParams } from "@/ipc/types";
import * as path from "node:path";

const logger = log.scope("opencode_adapter");

// ============================================================================
// Singleton: OpenCode server + client instance
// ============================================================================

let opencodeInstance: Awaited<ReturnType<typeof createOpencode>> | null = null;
let clientInstance: ReturnType<typeof createOpencodeClient> | null = null;
let serverUrl: string | null = null;

// Map chatId → opencode sessionId
const chatSessionMap = new Map<number, string>();

/**
 * Revert the last message in the OpenCode session for a chat (undo/retry).
 * Uses session.revert() to tell OpenCode the last work was rolled back,
 * while preserving prior conversation context.
 */
export async function revertLastOpenCodeMessage(chatId: number): Promise<void> {
    const sessionId = chatSessionMap.get(chatId);
    if (!sessionId || !clientInstance) return;

    try {
        // Get the last message ID from the session
        const msgsResult = await clientInstance.session.messages({
            path: { id: sessionId },
            query: { limit: 4 },
        });
        const messages = msgsResult.data || [];
        // Find the last assistant message to revert
        const lastAssistant = [...messages].reverse().find(
            (m: any) => m.info?.role === "assistant"
        );
        if (lastAssistant?.info?.id) {
            await clientInstance.session.revert({
                path: { id: sessionId },
                body: { messageID: lastAssistant.info.id },
            });
            logger.info(`[OpenCode] Reverted message ${lastAssistant.info.id} in session ${sessionId} for chat ${chatId}`);
        } else {
            logger.warn(`[OpenCode] No assistant message found to revert in session ${sessionId}`);
        }
    } catch (error: any) {
        logger.warn(`[OpenCode] session.revert failed for ${sessionId}: ${error.message} — dropping session`);
        chatSessionMap.delete(chatId);
    }
}

/**
 * Destroy the OpenCode session for a chat entirely (version history restore).
 * Used when jumping to an arbitrary past version where partial revert
 * would be too complex.
 */
export function destroyOpenCodeSession(chatId: number): void {
    const sessionId = chatSessionMap.get(chatId);
    if (sessionId) {
        chatSessionMap.delete(chatId);
        logger.info(`[OpenCode] Destroyed session ${sessionId} for chat ${chatId} (version restore)`);
    }
}

/**
 * Get or create the OpenCode server + client singleton.
 * The server runs on localhost and the client communicates via HTTP.
 */
async function getOpenCodeClient(appPath: string) {
    if (clientInstance && opencodeInstance) {
        return { client: clientInstance, opencode: opencodeInstance };
    }

    logger.info("[OpenCode] Starting server + client...");

    // ─── Fix PATH for Electron ─────────────────────────────
    // Electron doesn't inherit the terminal's NVM-managed PATH.
    // The SDK spawns `opencode` internally, so we must ensure
    // the binary is findable via process.env.PATH.
    const HOME = process.env.HOME || "/home/" + process.env.USER;
    const nvmDir = path.join(HOME, ".nvm/versions/node");
    const fs = require("fs");

    try {
        if (fs.existsSync(nvmDir)) {
            const versions = fs.readdirSync(nvmDir);

            // Sort versions descending (e.g., v20 > v18 > v16) so the newest Node is prioritized in PATH
            versions.sort((a: string, b: string) => {
                const numA = a.replace('v', '').split('.').map(Number);
                const numB = b.replace('v', '').split('.').map(Number);
                for (let i = 0; i < Math.max(numA.length, numB.length); i++) {
                    const partA = numA[i] || 0;
                    const partB = numB[i] || 0;
                    if (partA !== partB) return partB - partA; // Descending
                }
                return 0;
            });

            const nvmBins = versions.map((v: string) => path.join(nvmDir, v, "bin"));
            const currentPath = process.env.PATH || "";
            // Prepend NVM bins so they take priority
            process.env.PATH = [...nvmBins, currentPath].join(":");
            logger.info(`[OpenCode] Injected ${nvmBins.length} NVM bin dirs into PATH (latest: ${versions[0]})`);
        }
    } catch (e) {
        logger.warn("[OpenCode] Could not scan NVM dirs:", e);
    }

    // Build environment with API keys from Electron's secure storage
    const envVars = extractApiKeysForEnv();

    // Set API keys in the process environment before creating the instance
    for (const [key, value] of Object.entries(envVars)) {
        process.env[key] = value;
    }

    const settings = readSettings();
    const model = settings.selectedModel;

    // Determine provider/model mapping for opencode
    const providerID = mapProviderForOpenCode(model);
    const modelID = model.name;

    try {
        const opencode = await createOpencode({
            hostname: "127.0.0.1",
            port: 0, // auto-assign port
            config: {
                provider: {
                    [providerID]: {
                        ...(providerID === "openrouter" ? {
                            name: "openrouter",
                        } : {}),
                    },
                },
                model: `${providerID}/${modelID}`,
                // Use the cheap/fast standard model for lightweight tasks (titles, summaries)
                ...(settings.standardModeModel ? {
                    small_model: `${providerID}/${settings.standardModeModel}`,
                } : {}),
                // Agent-level config: reasoning effort + text verbosity
                // These extra fields are passed directly to the provider as model options
                agent: {
                    build: {
                        ...(settings.reasoningEffort && settings.reasoningEffort !== "none" ? {
                            reasoningEffort: settings.reasoningEffort === "xhigh" ? "high" : settings.reasoningEffort,
                        } : {}),
                        textVerbosity: "low",
                    },
                    // Use the cheap/fast model for context compaction summaries
                    // so we don't burn expensive tokens on housekeeping
                    ...(settings.standardModeModel ? {
                        compaction: {
                            model: `${providerID}/${settings.standardModeModel}`,
                        },
                    } : {}),
                },
                // Permissions: always allow everything to prioritize autonomy
                permission: {
                    edit: "allow",
                    bash: "allow",
                    webfetch: "allow",
                    external_directory: "allow",
                },
                // Always-on context compaction (documented at opencode.ai/docs/configuration)
                // SDK 1.2.17 types don't declare this field yet, but the binary accepts it.
                ...({ compaction: { auto: true, prune: true } } as any),
                // Disable features we don't need (reduces overhead)
                autoupdate: false,
                formatter: false,
                lsp: false,
                share: "disabled",
                // Ignore heavy directories to prevent token drain
                // (OpenCode's grep/glob use ripgrep which respects .gitignore,
                //  but watcher.ignore provides an extra safety net for projects
                //  without a proper .gitignore or not initialized as git repos)
                watcher: {
                    ignore: [
                        "node_modules/**",
                        ".vite/**",
                        "dist/**",
                        "build/**",
                        ".next/**",
                        ".nuxt/**",
                        ".output/**",
                        ".git/**",
                        ".git",
                        "*.lock",
                        "*.log",
                    ],
                },
            },
        });

        opencodeInstance = opencode;
        clientInstance = opencode.client;
        serverUrl = opencode.server.url;

        logger.info(`[OpenCode] Server running at ${serverUrl}`);
        logger.info(`[OpenCode] Client ready. Model: ${providerID}/${modelID}`);

        return { client: opencode.client, opencode };
    } catch (error: any) {
        logger.error("[OpenCode] Failed to start:", error.message);
        throw error;
    }
}

// ============================================================================
// API Key extraction from Electron safe storage
// ============================================================================

function extractApiKeysForEnv(): Record<string, string> {
    const settings = readSettings();
    const env: Record<string, string> = {};

    // Map provider settings to environment variables
    const providerKeyMap: Record<string, string> = {
        openai: "OPENAI_API_KEY",
        anthropic: "ANTHROPIC_API_KEY",
        google: "GEMINI_API_KEY",
        groq: "GROQ_API_KEY",
        openrouter: "OPENROUTER_API_KEY",
    };

    for (const [provider, envVar] of Object.entries(providerKeyMap)) {
        const providerSetting = settings.providerSettings?.[provider] as any;
        if (providerSetting?.apiKey?.value) {
            const key = providerSetting.apiKey;
            env[envVar] = key.encryptionType === "plaintext"
                ? key.value
                : decrypt(key);
        }
    }

    // Also check for OpenRouter keys array (use selectedKeyId if available)
    const openRouterSettings = settings.providerSettings?.openrouter as any;
    if (openRouterSettings?.keys?.length > 0 && !env.OPENROUTER_API_KEY) {
        const selectedKeyId = openRouterSettings.selectedKeyId;
        const selectedKey = selectedKeyId
            ? openRouterSettings.keys.find((k: any) => k.id === selectedKeyId)
            : openRouterSettings.keys[0];

        if (selectedKey?.key?.value) {
            const key = selectedKey.key;
            env.OPENROUTER_API_KEY = key.encryptionType === "plaintext"
                ? key.value
                : decrypt(key);
            logger.info(`[OpenCode] Using OpenRouter key: "${selectedKey.alias || 'unnamed'}"`);
        }
    }

    const keyNames = Object.keys(env);
    logger.info(`[OpenCode] Available API keys: ${keyNames.join(", ") || "none"}`);

    return env;
}

// ============================================================================
// Model/provider mapping
// ============================================================================

function mapProviderForOpenCode(model: { provider?: string; name: string }): string {
    const provider = (model.provider || "").toLowerCase();

    if (provider.includes("openrouter")) return "openrouter";
    if (provider.includes("anthropic")) return "anthropic";
    if (provider.includes("openai")) return "openai";
    if (provider.includes("google")) return "google";

    // Default to openrouter
    return "openrouter";
}

// ============================================================================
// Main stream handler
// ============================================================================

/**
 * Handle a chat stream using OpenCode AI SDK.
 * Creates a session, subscribes to events for real-time streaming,
 * sends the user prompt, and forwards all events to the frontend.
 */
export async function handleOpenCodeStream(
    event: IpcMainInvokeEvent,
    req: ChatStreamParams,
    abortController: AbortController,
    options: {
        placeholderMessageId: number;
        appPath: string;
        chatMessages: any[];
        /** Context instructions to inject via noReply on first interaction */
        contextInstructions?: string[];
        /** Processed attachment file paths (images/text saved to temp dir) */
        attachmentPaths?: string[];
        /** Original attachment metadata */
        attachments?: { name: string; type: string; data: string; attachmentType: string }[];
        /** Integration env vars — set in process.env so bash tool can use them */
        integrationEnvVars?: Record<string, string>;
    },
): Promise<{ fullResponse: string; success: boolean; inputTokens: number; outputTokens: number; reasoningTokens: number; cachedTokens: number }> {
    const { placeholderMessageId, appPath, chatMessages } = options;

    // Inject integration env vars into the process so OpenCode's bash can use them
    if (options.integrationEnvVars) {
        for (const [key, value] of Object.entries(options.integrationEnvVars)) {
            process.env[key] = value;
        }
        logger.info(`[OpenCode] Injected ${Object.keys(options.integrationEnvVars).length} integration env vars: ${Object.keys(options.integrationEnvVars).join(', ')}`);
    }

    // Resolve the full project directory path — this is CRITICAL for OpenCode
    const projectDir = getDyadAppPath(appPath);
    logger.info(`[OpenCode] Starting stream for chat ${req.chatId}, project: ${projectDir}`);

    // Write a .ignore file to the project dir so ripgrep skips heavy directories.
    // .ignore is a ripgrep standard file — works in ANY directory (no git required).
    // Patterns come from settings (synced via Bunny DB across devices).
    try {
        const fs = await import("fs");
        const patterns = readSettings().openCodeIgnorePatterns ?? [
            "node_modules/", ".vite/", "dist/", "build/",
            ".next/", ".nuxt/", ".output/", ".git/", ".git",
            "*.lock", "*.log",
        ];
        const ignorePath = path.join(projectDir, ".ignore");
        const header = "# Auto-generated by Vibes — ripgrep ignore patterns for OpenCode\n";
        fs.writeFileSync(ignorePath, header + patterns.join("\n") + "\n");
        logger.info(`[OpenCode] Wrote .ignore with ${patterns.length} patterns to ${projectDir}`);
    } catch (e: any) {
        logger.warn(`[OpenCode] Failed to write .ignore: ${e.message}`);
    }


    let client: ReturnType<typeof createOpencodeClient>;
    try {
        const result = await getOpenCodeClient(projectDir);
        client = result.client;
    } catch (error: any) {
        const errorMsg = `❌ Error al iniciar OpenCode: ${error.message}`;
        logger.error(errorMsg);
        return { fullResponse: errorMsg, success: false, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cachedTokens: 0 };
    }

    // Get or create session for this chat
    let sessionId = chatSessionMap.get(req.chatId);
    if (!sessionId) {
        try {
            const session = await client.session.create({
                body: { title: `Chat ${req.chatId}` },
                query: { directory: projectDir },
            });
            logger.info(`[OpenCode] Session create response: ${JSON.stringify(session)}`);
            if (!session.data?.id) {
                throw new Error(`Session creation returned no data: ${JSON.stringify(session)}`);
            }
            sessionId = session.data.id;
            chatSessionMap.set(req.chatId, sessionId);
            logger.info(`[OpenCode] Created session ${sessionId} for chat ${req.chatId} in ${projectDir}`);

            // Inject context instructions as noReply on first interaction
            // This gives OpenCode knowledge about KB rules, integrations, and language
            if (options.contextInstructions && options.contextInstructions.length > 0) {
                const contextText = options.contextInstructions.join("\n\n---\n\n");
                logger.info(`[OpenCode] Injecting ${options.contextInstructions.length} context instructions (${contextText.length} chars)`);
                try {
                    await client.session.prompt({
                        path: { id: sessionId },
                        query: { directory: projectDir },
                        body: {
                            noReply: true,
                            parts: [{ type: "text", text: contextText }],
                        },
                    });
                    logger.info(`[OpenCode] Context instructions injected successfully`);
                } catch (ctxError: any) {
                    logger.warn(`[OpenCode] Failed to inject context: ${ctxError.message}`);
                    // Non-fatal — continue without context
                }
            }
        } catch (error: any) {
            const errorMsg = `❌ Error al crear sesión: ${error.message}`;
            logger.error(errorMsg);
            return { fullResponse: errorMsg, success: false, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cachedTokens: 0 };
        }
    }



    // Subscribe to events for real-time streaming
    // Chronological timeline: each entry is either a tool tag or a text chunk, in arrival order
    const timeline: TimelineEntry[] = [];
    const toolsActive = new Map<string, { tool: string; status: string; detail?: string }>();
    const filesEdited: string[] = [];
    let stepCount = 0;
    // Accumulated token usage across all steps
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalReasoningTokens = 0;
    let totalCachedTokens = 0;
    let eventSubscription: any = null;

    try {
        // Start global event subscription (captures ALL events across the server)
        logger.info("[OpenCode] Subscribing to global events...");
        const eventsResult = await client.global.event();
        eventSubscription = eventsResult;
        logger.info("[OpenCode] Event subscription ready.");

        // Process events in background
        const eventProcessingDone = processEvents(
            eventsResult.stream,
            sessionId,
            event,
            req.chatId,
            chatMessages,
            {
                onTextDelta: (delta: string) => {
                    // Append text to the last text entry if it exists, or create a new one
                    const last = timeline[timeline.length - 1];
                    if (last && last.type === "text") {
                        last.text += delta;
                    } else {
                        timeline.push({ type: "text", text: delta });
                    }
                },
                onToolUpdate: (toolId: string, tool: string, status: string, detail?: string, output?: string) => {
                    toolsActive.set(toolId, { tool, status, detail });

                    // Add to chronological timeline when a tool completes or errors
                    if (status === "completed" || status === "error") {
                        timeline.push({
                            type: "tool",
                            tool,
                            detail: detail || "",
                            error: status === "error",
                            output: output || "",
                        });
                    }

                    logger.info(`[OpenCode] Tool ${tool}: ${status}${detail ? ` (${detail})` : ""}${output ? ` [${output.length}ch output]` : ""}`);
                },
                onStepStart: () => {
                    stepCount++;
                },
                onStepTokens: (input: number, output: number, reasoning: number, cached: number) => {
                    totalInputTokens += input;
                    totalOutputTokens += output;
                    totalReasoningTokens += reasoning;
                    totalCachedTokens += cached;
                },
                onFileEdited: (file: string) => {
                    // Normalize to basename to avoid duplicate entries for absolute vs relative paths
                    const basename = path.basename(file);
                    const alreadyTracked = filesEdited.some(f => path.basename(f) === basename);
                    if (!alreadyTracked) {
                        filesEdited.push(file);
                        logger.info(`[OpenCode] 📂 File edited: ${file}`);
                    }
                },
                getTimeline: () => timeline,
                getToolsActive: () => toolsActive,
                getFilesEdited: () => filesEdited,
                getStepCount: () => stepCount,
            },
            abortController,
        );

        // Send the prompt ASYNC — returns immediately, we rely on events for completion
        const settings = readSettings();
        const model = settings.selectedModel;
        const providerID = mapProviderForOpenCode(model);

        logger.info(`[OpenCode] Sending prompt to session ${sessionId} with model ${providerID}/${model.name}`);
        logger.info(`[OpenCode] Project directory: ${projectDir}`);
        logger.info(`[OpenCode] Prompt: "${req.prompt.substring(0, 100)}..."`);

        // Build prompt parts: text + optional file attachments
        // On the very first message of a brand new app (no prior assistant messages),
        // inject a build-mode instruction so the agent directly implements instead of
        // proposing a plan. This is NOT tied to session creation — sessions get recreated
        // after undo/revert, but chatMessages persists in the database.
        let promptText = req.prompt;
        // Ignore the placeholder message ID which is already pushed to chatMessages for this very request
        const hasAssistantMessages = chatMessages.some((m: any) => m.role === "assistant" && m.id !== placeholderMessageId);
        if (!hasAssistantMessages) {
            promptText = `[INSTRUCCIÓN DE SISTEMA: No propongas un plan ni pidas confirmación. Ejecuta directamente lo que pide el usuario. Implementa el código, crea los archivos necesarios y haz los cambios sin pedir permiso. NUNCA expliques cómo ejecutar la app, aquí se compila automáticamente. Responde en el mismo idioma.]\n\n${req.prompt}`;
            logger.info(`[OpenCode] 🚀 First message of app (no prior assistant messages) — injected build-mode instruction`);
        }
        const promptParts: any[] = [{ type: "text", text: promptText }];

        // Add image attachments as file parts (OpenCode supports multimodal input)
        if (options.attachments && options.attachmentPaths) {
            for (let i = 0; i < options.attachments.length; i++) {
                const att = options.attachments[i];
                const attPath = options.attachmentPaths[i];
                if (!attPath) continue;

                // Images → send as data URL file parts for vision models
                if (att.type.startsWith("image/")) {
                    promptParts.push({
                        type: "file",
                        mime: att.type,
                        filename: att.name,
                        url: att.data, // already a data URL
                    });
                    logger.info(`[OpenCode] Attached image: ${att.name}`);
                }
                // upload-to-codebase → copy to project and mention in prompt
                else if (att.attachmentType === "upload-to-codebase") {
                    const fs = require("fs");
                    const destPath = path.join(projectDir, att.name);
                    try {
                        fs.copyFileSync(attPath, destPath);
                        promptParts[0].text += `\n\n[Archivo subido al proyecto: ${att.name}]`;
                        logger.info(`[OpenCode] Uploaded to codebase: ${att.name}`);
                    } catch (e: any) {
                        logger.warn(`[OpenCode] Failed to copy attachment: ${e.message}`);
                    }
                }
                // Text files → inline content in prompt
                else {
                    try {
                        const fs = require("fs");
                        const content = fs.readFileSync(attPath, "utf-8");
                        promptParts[0].text += `\n\nAdjunto (${att.name}):\n\`\`\`\n${content}\n\`\`\``;
                        logger.info(`[OpenCode] Inlined text attachment: ${att.name}`);
                    } catch {
                        promptParts[0].text += `\n\nAdjunto: ${att.name} (${att.type})`;
                    }
                }
            }
        }

        // Fire the prompt (non-blocking)
        await client.session.promptAsync({
            path: { id: sessionId },
            query: { directory: projectDir },
            body: {
                model: {
                    providerID,
                    modelID: model.name,
                },
                parts: promptParts,
            },
        });

        logger.info(`[OpenCode] Prompt sent (async). Waiting for events...`);

        // Wait for the event stream to signal completion.
        // processEvents returns when session goes idle or the stream ends.
        await eventProcessingDone;

        // If the stream was aborted (stop button), tell OpenCode to stop generating
        if (abortController.signal.aborted) {
            logger.info(`[OpenCode] Aborted for chat ${req.chatId} — sending abort to server`);
            try {
                await client.session.abort({ path: { id: sessionId }, query: { directory: projectDir } });
            } catch { /* ignore */ }
            const partialText = timeline.filter(e => e.type === "text").map(e => (e as any).text).join("");
            return { fullResponse: partialText || "Operación cancelada", success: false, inputTokens: totalInputTokens, outputTokens: totalOutputTokens, reasoningTokens: totalReasoningTokens, cachedTokens: totalCachedTokens };
        }

        const totalText = timeline.filter(e => e.type === "text").map(e => (e as any).text).join("");
        const totalTools = timeline.filter(e => e.type === "tool").length;
        logger.info(`[OpenCode] Response complete. Text: ${totalText.length}ch, files edited: ${filesEdited.length}, tools: ${totalTools}`);

        // Send final response with all content
        const finalContent = buildFinalResponse(timeline, filesEdited, toolsActive);
        sendChunk(event, req.chatId, chatMessages, finalContent);

        logger.info(`[OpenCode] Token usage: input=${totalInputTokens}, output=${totalOutputTokens}, reasoning=${totalReasoningTokens}, total=${totalInputTokens + totalOutputTokens}`);
        return { fullResponse: finalContent, success: true, inputTokens: totalInputTokens, outputTokens: totalOutputTokens, reasoningTokens: totalReasoningTokens, cachedTokens: totalCachedTokens };

    } catch (error: any) {
        if (abortController.signal.aborted) {
            logger.info(`[OpenCode] Aborted for chat ${req.chatId}`);
            try {
                await client.session.abort({ path: { id: sessionId }, query: { directory: projectDir } });
            } catch { /* ignore */ }
            const partialText = timeline.filter(e => e.type === "text").map(e => (e as any).text).join("");
            return { fullResponse: partialText || "Operación cancelada", success: false, inputTokens: totalInputTokens, outputTokens: totalOutputTokens, reasoningTokens: totalReasoningTokens, cachedTokens: totalCachedTokens };
        }

        logger.error("[OpenCode] Stream error:", error.message);
        const errText = timeline.filter(e => e.type === "text").map(e => (e as any).text).join("");
        return {
            fullResponse: errText || `❌ Error: ${error.message}`,
            success: false,
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            reasoningTokens: totalReasoningTokens,
            cachedTokens: totalCachedTokens,
        };
    }
}

// ============================================================================
// SSE Event Processing
// ============================================================================

type TimelineEntry = { type: "tool"; tool: string; detail: string; error: boolean; output: string } | { type: "text"; text: string };

async function processEvents(
    stream: AsyncIterable<any>,
    sessionId: string,
    event: IpcMainInvokeEvent,
    chatId: number,
    chatMessages: any[],
    callbacks: {
        onTextDelta: (delta: string) => void;
        onToolUpdate: (toolId: string, tool: string, status: string, detail?: string, output?: string) => void;
        onStepStart: () => void;
        onStepTokens: (input: number, output: number, reasoning: number, cached: number) => void;
        onFileEdited: (file: string) => void;
        getTimeline: () => TimelineEntry[];
        getToolsActive: () => Map<string, { tool: string; status: string; detail?: string }>;
        getFilesEdited: () => string[];
        getStepCount: () => number;
    },
    abortController: AbortController,
) {
    const sendUpdate = () => {
        const content = buildLiveContent(
            callbacks.getTimeline(),
            callbacks.getToolsActive(),
            callbacks.getStepCount(),
        );
        sendChunk(event, chatId, chatMessages, content);
    };

    let eventCount = 0;
    let isCurrentlyReasoning = false;
    let thinkNeedsReopen = false; // True when </think> was emitted for a tool but reasoning continues
    let activePartType: string | null = null;
    let assistantMessageId: string | null = null;
    let reasoningCharCount = 0;
    let reasoningBuffer = ""; // Buffer early reasoning chars

    try {
        for await (const rawEvt of stream) {
            if (abortController.signal.aborted) break;
            eventCount++;

            const evt = rawEvt.payload || rawEvt;
            const props = evt.properties || {};

            // Log EVERY event
            logger.info(`[OpenCode] #${eventCount} ${evt.type}${props.part ? ` part.type=${props.part.type}` : ""}${props.info ? ` role=${props.info.role}` : ""}${props.delta != null ? ` delta=${String(props.delta).length}ch` : ""}${props.field ? ` field=${props.field}` : ""}`);

            // Session filtering
            const partProps = props.part || {};
            if (partProps.sessionID && partProps.sessionID !== sessionId) continue;
            if (props.sessionID && props.sessionID !== sessionId) continue;

            switch (evt.type) {
                // Track which message is the assistant's response
                case "message.updated": {
                    const info = props.info;
                    if (info && info.role === "assistant") {
                        assistantMessageId = info.id;
                        logger.info(`[OpenCode] 📬 Assistant message ID: ${assistantMessageId}`);
                    }
                    break;
                }

                case "message.part.updated": {
                    const part = props.part;
                    if (!part) break;

                    // Skip parts not belonging to the assistant message
                    if (part.messageID && assistantMessageId && part.messageID !== assistantMessageId) {
                        logger.info(`[OpenCode] ⏭️ Skip part (msgID=${part.messageID} != assistant=${assistantMessageId})`);
                        break;
                    }
                    if (!assistantMessageId && (part.type === "text" || part.type === "reasoning")) {
                        logger.info(`[OpenCode] ⏭️ Skip early ${part.type} (no assistant ID yet)`);
                        break;
                    }

                    logger.info(`[OpenCode] 📦 PART type=${part.type} text=${part.text ? `${part.text.length}ch` : "null"}`);

                    switch (part.type) {
                        case "reasoning": {
                            // Mark active part type — subsequent deltas belong to reasoning
                            // DON'T emit <think> yet — wait for the first delta to avoid empty blocks
                            activePartType = "reasoning";
                            break;
                        }

                        case "text": {
                            // A text part started — close reasoning if open
                            activePartType = "text";
                            thinkNeedsReopen = false; // Cancel any pending reopen

                            if (isCurrentlyReasoning) {
                                isCurrentlyReasoning = false;
                                reasoningCharCount = 0;
                                reasoningBuffer = "";
                                callbacks.onTextDelta(`\n</think>\n\n`);
                                logger.info(`[OpenCode] 🧠 CLOSED </think> — text part started`);
                                sendUpdate();
                            } else if (reasoningBuffer.length > 0) {
                                // If we were accumulating reasoning but never hit the threshold, discard buffer
                                logger.info(`[OpenCode] ⏭️ Discarded tiny reasoning buffer (${reasoningBuffer.length}ch)`);
                                reasoningBuffer = "";
                                reasoningCharCount = 0;
                            }
                            break;
                        }

                        case "tool": {
                            // If reasoning is open, close the think block before the tool
                            // entry enters the timeline (otherwise the dyad tag would appear
                            // inside the <think> block in the rendered output)
                            if (isCurrentlyReasoning) {
                                callbacks.onTextDelta(`\n</think>\n`);
                                // Keep isCurrentlyReasoning = true so the NEXT reasoning
                                // delta will seamlessly reopen <think> without creating a
                                // new Pensamiento badge — we just need a fresh text entry.
                                isCurrentlyReasoning = false;
                                thinkNeedsReopen = true;
                                logger.info(`[OpenCode] 🧠 PAUSED </think> — tool event`);
                            }

                            const toolState = part.state;
                            const toolName = part.tool || "unknown";
                            const status = toolState?.status || "unknown";
                            const input = toolState?.input || part.input || {};
                            const detail = input.file_path || input.path || input.filePath
                                || input.query || input.pattern
                                || input.command || input.cmd
                                || input.directory || input.url
                                || "";

                            // Extract tool output/result for the expanded modal
                            const rawOutput = toolState?.output || part.output || "";
                            const rawStr = typeof rawOutput === "string" ? rawOutput : JSON.stringify(rawOutput);
                            const output = extractToolContent(rawStr);

                            callbacks.onToolUpdate(part.callID || part.id, toolName, status, detail, output);
                            sendUpdate();
                            break;
                        }

                        case "step-start":
                            callbacks.onStepStart();
                            logger.info(`[OpenCode] Step started`);
                            sendUpdate();
                            break;

                        case "step-finish":
                            // DON'T close </think> here — keep it open so consecutive
                            // reasoning blocks merge into a single Pensamiento.
                            // Think only closes when a "text" part starts (above).
                            if (!isCurrentlyReasoning && reasoningBuffer.length > 0) {
                                // Discard tiny reasoning if never opened
                                logger.info(`[OpenCode] ⏭️ Discarded tiny reasoning buffer on step finish (${reasoningBuffer.length}ch)`);
                                reasoningBuffer = "";
                                reasoningCharCount = 0;
                            }
                            activePartType = null;
                            {
                                const stepIn = part.tokens?.input || 0;
                                const stepOut = part.tokens?.output || 0;
                                const stepReasoning = part.tokens?.reasoning || 0;
                                const stepCacheRead = part.tokens?.cacheRead || part.tokens?.cache_read || 0;
                                const stepCacheCreation = part.tokens?.cacheCreation || part.tokens?.cache_creation || 0;
                                callbacks.onStepTokens(stepIn, stepOut, stepReasoning, stepCacheRead + stepCacheCreation);
                                logger.info(`[OpenCode] Step finished (tokens: in=${stepIn}, out=${stepOut}, reasoning=${stepReasoning}, cacheRead=${stepCacheRead}, cacheCreation=${stepCacheCreation}, raw=${JSON.stringify(part.tokens)})`);
                            }
                            break;
                    }
                    break;
                }

                // Streaming text deltas — route based on activePartType
                case "message.part.delta": {
                    const delta = props.delta || "";
                    if (!delta) break;

                    const isReasoning = activePartType === "reasoning";

                    if (isReasoning) {
                        // Strip ALL HTML/XML-like tags from reasoning content.
                        // The LLM generates <dyad-read>, <dyad-write>, etc. in its
                        // thinking because it learned the format from context history.
                        // Tags arrive split across deltas so we can't rely on matching
                        // complete tag names — just strip everything between < >.
                        const cleanDelta = delta.replace(/<[^>]*>/g, "");
                        if (!cleanDelta) break; // delta was only tags, skip
                        reasoningCharCount += cleanDelta.length;

                        // If think was paused for a tool event, reopen it seamlessly
                        if (thinkNeedsReopen) {
                            thinkNeedsReopen = false;
                            isCurrentlyReasoning = true;
                            callbacks.onTextDelta(`\n<think>\n${cleanDelta}`);
                            logger.info(`[OpenCode] 🧠 REOPENED <think> after tool`);
                        } else if (!isCurrentlyReasoning) {
                            // Buffer the reasoning until it's comfortably over 20 chars
                            // This prevents emitting empty `<think>` tags for short 10-char blobs or "[REDACTED]"
                            reasoningBuffer += cleanDelta;
                            if (reasoningBuffer.length > 20) {
                                isCurrentlyReasoning = true;
                                callbacks.onTextDelta(`\n<think>\n${reasoningBuffer}`);
                                logger.info(`[OpenCode] 🧠 OPENED <think> (buffered ${reasoningBuffer.length}ch)`);
                                reasoningBuffer = "";
                            }
                        } else {
                            callbacks.onTextDelta(cleanDelta);
                        }
                    } else {
                        // Normal text delta
                        callbacks.onTextDelta(delta);
                    }
                    sendUpdate();
                    break;
                }

                case "file.edited": {
                    callbacks.onFileEdited(props.file);
                    sendUpdate();
                    break;
                }

                // File diffs — track edited files from session.diff events too
                case "session.diff": {
                    const diffs = props.diff;
                    if (Array.isArray(diffs)) {
                        for (const d of diffs) {
                            if (d.file) {
                                callbacks.onFileEdited(d.file);
                            }
                        }
                        sendUpdate();
                    }
                    break;
                }

                case "session.status": {
                    const status = props.status;
                    if (status?.type === "idle") {
                        logger.info("[OpenCode] Session idle — response complete");
                    } else if (status?.type === "busy") {
                        logger.info("[OpenCode] Session busy...");
                    }
                    break;
                }

                case "session.idle": {
                    // Close any lingering open think block before exiting
                    if (isCurrentlyReasoning) {
                        isCurrentlyReasoning = false;
                        callbacks.onTextDelta(`\n</think>\n\n`);
                        logger.info(`[OpenCode] 🧠 CLOSED </think> — session idle`);
                    }
                    logger.info(`[OpenCode] Session idle event received. Total events: ${eventCount}`);
                    return;
                }

                // Known events we can safely ignore
                case "server.connected":
                case "session.updated":
                case "file.watcher.updated":
                    break;

                case "permission.asked": {
                    const reqId = props.id || props.requestID;
                    if (!reqId) break;

                    const permName = props.type || "unknown";

                    // Auto-approve all permissions since user trusts the agent
                    try {
                        if (clientInstance) {
                            await clientInstance.postSessionIdPermissionsPermissionId({
                                path: { id: sessionId, permissionID: reqId },
                                body: { response: "always" }
                            });
                            logger.info(`[OpenCode] Auto-approved permission: always for ${permName}`);
                        }
                    } catch (e: any) {
                        logger.error(`[OpenCode] Error al auto-responder permiso: ${e.message}`);
                    }
                    break;
                }

                default:
                    if (eventCount <= 20) {
                        logger.info(`[OpenCode] Unhandled event type: ${evt.type}`);
                    }
                    break;
            }
        }
    } catch (error: any) {
        if (!abortController.signal.aborted) {
            logger.error("[OpenCode] Event stream error:", error.message);
        }
    }

    // Safety: close any lingering open think block if stream ended unexpectedly
    if (isCurrentlyReasoning) {
        isCurrentlyReasoning = false;
        callbacks.onTextDelta(`\n</think>\n\n`);
        logger.info(`[OpenCode] 🧠 CLOSED </think> — stream ended`);
    }
}

/**
 * Map OpenCode tool names → dyad tag names for consistent UI rendering.
 * The DyadMarkdownParser will intercept these tags and render the
 * collapsible icon badges that the user expects.
 */
function mapToolToDyadTag(tool: string): string {
    const map: Record<string, string> = {
        write: "dyad-write",
        read: "dyad-read",
        edit: "dyad-search-replace",
        bash: "dyad-run-command",
        glob: "dyad-list-files",
        grep: "dyad-grep",
        fetch: "dyad-web-crawl",
        patch: "dyad-patch",
        todowrite: "dyad-write",
        todorewrite: "dyad-write",
        codesearch: "dyad-code-search",
        webfetch: "dyad-web-crawl",
        websearch: "dyad-web-crawl",
        lsp: "dyad-status",
    };
    return map[tool] || "dyad-status";
}

function buildDyadTag(tool: string, detail: string, content: string): string {
    const dyadTag = mapToolToDyadTag(tool);

    switch (dyadTag) {
        case "dyad-write":
            return `<dyad-write path="${escapeAttr(detail)}" description="">${content}</dyad-write>`;
        case "dyad-search-replace":
            return `<dyad-search-replace path="${escapeAttr(detail)}" description="">${content}</dyad-search-replace>`;
        case "dyad-read":
            return `<dyad-read path="${escapeAttr(detail)}">${content}</dyad-read>`;
        case "dyad-grep":
            return `<dyad-grep query="${escapeAttr(detail)}">${content}</dyad-grep>`;
        case "dyad-code-search":
            return `<dyad-code-search query="${escapeAttr(detail)}">${content}</dyad-code-search>`;
        case "dyad-run-command":
            return `<dyad-run-command cmd="${escapeAttr(detail)}">${content}</dyad-run-command>`;
        case "dyad-list-files":
            return `<dyad-list-files directory="${escapeAttr(detail)}">${content}</dyad-list-files>`;
        case "dyad-web-crawl":
            return `<dyad-web-crawl url="${escapeAttr(detail)}">${content}</dyad-web-crawl>`;
        case "dyad-patch":
            return `<dyad-patch path="${escapeAttr(detail)}">${content}</dyad-patch>`;
        case "dyad-status":
        default:
            return `<dyad-status title="${escapeAttr(detail)}">${content}</dyad-status>`;
    }
}

/**
 * Extract the actual content from OpenCode's XML-wrapped tool output.
 * OpenCode wraps results like: <path>...</path><type>file</type><content>1: code...</content>
 * We extract just the <content> body and strip line number prefixes.
 */
function extractToolContent(raw: string): string {
    if (!raw) return "";

    // Try to extract <content>...</content> block
    const contentMatch = raw.match(/<content>([\s\S]*)<\/content>/i);
    if (contentMatch) {
        // Strip OpenCode's line number prefixes: "1: ", "23: ", "100: ", etc.
        return contentMatch[1]
            .replace(/^\d+: /gm, "")
            .trim();
    }

    // No XML wrapper — return as-is
    return raw.trim();
}

/** Escape XML/HTML attribute values */
function escapeAttr(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Build live content showing accumulated dyad tags + current activity + response text.
 * This is what the user sees in the chat bubble while OpenCode works.
 */
/**
 * Build live content from the chronological timeline.
 * Tools and text/thinking appear in the exact order they occurred.
 */
function buildLiveContent(
    timeline: TimelineEntry[],
    toolsActive: Map<string, { tool: string; status: string; detail?: string }>,
    stepCount: number,
): string {
    let content = "";

    // Render timeline entries in chronological order
    for (const entry of timeline) {
        if (entry.type === "tool") {
            const tagContent = entry.error ? "[error]" : entry.output;
            content += buildDyadTag(entry.tool, entry.detail, tagContent) + "\n";
        } else {
            content += cleanResponseText(entry.text);
        }
    }

    // Active tool indicator (pending tools shown as dyad tags with pending state)
    const activeEdits = Array.from(toolsActive.values()).filter(
        t => (t.status === "running" || t.status === "pending") &&
            (t.tool === "edit" || t.tool === "write" || t.tool === "read")
    );
    for (const t of activeEdits) {
        const tag = mapToolToDyadTag(t.tool);
        content += `<${tag} path="${escapeAttr(t.detail || "...")}">`;  // unclosed = pending
    }

    return content;
}

/**
 * Build the final response from the chronological timeline + file edits.
 * Timeline preserves the exact order: tools and text/thinking are interleaved.
 */
function buildFinalResponse(
    timeline: TimelineEntry[],
    filesEdited: string[],
    toolsActive: Map<string, { tool: string; status: string; detail?: string }>,
): string {
    let content = "";

    // Render timeline in chronological order
    for (const entry of timeline) {
        if (entry.type === "tool") {
            const tagContent = entry.error ? "[error]" : entry.output;
            content += buildDyadTag(entry.tool, entry.detail, tagContent) + "\n";
        } else {
            content += cleanResponseText(entry.text);
        }
    }

    // Add file edits as dyad-write tags (for files tracked via file.edited events
    // but not already covered by tool operations)
    if (filesEdited.length > 0) {
        const loggedPaths = new Set(
            timeline
                .filter((e): e is Extract<TimelineEntry, { type: "tool" }> => e.type === "tool")
                .filter(e => e.tool === "write" || e.tool === "edit")
                .map(e => path.basename(e.detail)),
        );

        for (const file of filesEdited) {
            const basename = path.basename(file);
            if (!loggedPaths.has(basename)) {
                content += `<dyad-write path="${escapeAttr(file)}" description=""></dyad-write>\n`;
            }
        }
    }

    return content;
}

/** Human-readable tool name (for pending indicators) */
function mapToolName(tool: string): string {
    const map: Record<string, string> = {
        write: "Escribir archivo",
        read: "Leer archivo",
        edit: "Editar archivo",
        bash: "Ejecutar comando",
        glob: "Buscar archivos",
        grep: "Buscar en código",
        fetch: "Obtener URL",
        patch: "Aplicar parche",
        todowrite: "Actualizar tareas",
        todorewrite: "Reescribir tareas",
    };
    return map[tool] || tool;
}

/**
 * Clean the AI response text by removing internal thinking/redacted markers
 */
function cleanResponseText(text: string): string {
    // Remove [REDACTED] markers and surrounding whitespace
    let cleaned = text.replace(/\[REDACTED\]/gi, "");
    // Remove <thinking>...</thinking> blocks
    cleaned = cleaned.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "");
    // Remove <redacted>...</redacted> blocks
    cleaned = cleaned.replace(/<redacted>[\s\S]*?<\/redacted>/gi, "");

    // Strip ALL HTML/XML tags from inside <think> blocks and remove empty ones
    cleaned = cleaned.replace(/<think>([\s\S]*?)<\/think>/gi, (_match, inner: string) => {
        // Remove all XML/HTML tags from reasoning content
        const stripped = inner.replace(/<[^>]*>/g, "").trim();
        // If nothing meaningful remains, drop the entire think block
        if (!stripped) return "";
        return `<think>${stripped}</think>`;
    });

    // Clean up excessive blank lines
    cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
    return cleaned.trim();
}

// ============================================================================
// Helpers
// ============================================================================

function sendChunk(
    event: IpcMainInvokeEvent,
    chatId: number,
    chatMessages: any[],
    content: string,
) {
    const currentMessages = [...chatMessages];
    if (currentMessages.length > 0) {
        const lastMsg = currentMessages[currentMessages.length - 1];
        if (lastMsg.role === "assistant") {
            lastMsg.content = content;
        }
    }
    safeSend(event.sender, "chat:response:chunk", {
        chatId,
        messages: currentMessages,
    });
}

function sendProgressUpdate(
    event: IpcMainInvokeEvent,
    chatId: number,
    chatMessages: any[],
    message: string,
) {
    sendChunk(event, chatId, chatMessages, message);
}

// ============================================================================
// Diagnostic handlers
// ============================================================================

/**
 * Health check for OpenCode
 */
export async function openCodeHealthCheck(): Promise<{
    installed: boolean;
    version?: string;
    binaryPath?: string;
    sdkAvailable: boolean;
    serverRunning: boolean;
    serverUrl?: string;
    apiKeysConfigured: string[];
    errors: string[];
}> {
    const errors: string[] = [];
    const env = extractApiKeysForEnv();
    const apiKeysConfigured = Object.keys(env);

    // The SDK is bundled at compile time — if this file loads, SDK is available
    const sdkAvailable = typeof createOpencode === "function";

    // Check if CLI is available by scanning NVM dirs directly
    let installed = false;
    let version: string | undefined;
    let binaryPath: string | undefined;

    const HOME = process.env.HOME || "/home/" + process.env.USER;
    const nvmDir = path.join(HOME, ".nvm/versions/node");
    const fs = require("fs");

    // Build candidate paths
    const candidates: string[] = [
        "/usr/local/bin/opencode",
        "/usr/bin/opencode",
        path.join(HOME, ".local/bin/opencode"),
    ];

    try {
        if (fs.existsSync(nvmDir)) {
            const versions = fs.readdirSync(nvmDir);
            versions.sort((a: string, b: string) => {
                const numA = a.replace('v', '').split('.').map(Number);
                const numB = b.replace('v', '').split('.').map(Number);
                for (let i = 0; i < Math.max(numA.length, numB.length); i++) {
                    const partA = numA[i] || 0;
                    const partB = numB[i] || 0;
                    if (partA !== partB) return partB - partA; // Descending
                }
                return 0;
            });
            for (const v of versions) {
                candidates.push(path.join(nvmDir, v, "bin/opencode"));
            }
        }
    } catch { /* ignore */ }

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            binaryPath = candidate;
            installed = true;
            try {
                const { execSync } = require("child_process");
                version = execSync(`${candidate} --version 2>&1`, { encoding: "utf-8" }).trim();
            } catch { /* ignore */ }
            break;
        }
    }

    if (!installed) {
        errors.push("OpenCode CLI not found. Install with: npm install -g opencode-ai");
    }

    return {
        installed,
        version,
        binaryPath,
        sdkAvailable,
        serverRunning: !!opencodeInstance,
        serverUrl: serverUrl || undefined,
        apiKeysConfigured,
        errors,
    };
}

/**
 * Test a simple prompt with OpenCode
 */
export async function openCodeTestRun(appPath: string): Promise<{
    success: boolean;
    response?: string;
    error?: string;
}> {
    try {
        const { client } = await getOpenCodeClient(appPath);

        // Create a test session
        const session = await client.session.create({
            body: { title: "Test session" },
        });

        const sessionId = session.data!.id;

        // Send a simple test prompt
        const result = await client.session.prompt({
            path: { id: sessionId },
            body: {
                parts: [{ type: "text", text: "Di solo la palabra 'funciona' para confirmar que estás operativo" }],
            },
        });

        // Get messages to extract the response
        const messages = await client.session.messages({
            path: { id: sessionId },
        });

        let responseText = "";
        if (messages.data) {
            for (const msg of messages.data) {
                if (msg.info.role === "assistant") {
                    for (const part of msg.parts) {
                        if (part.type === "text") {
                            responseText += part.text;
                        }
                    }
                }
            }
        }

        // Clean up test session
        await client.session.delete({ path: { id: sessionId } });

        return { success: true, response: responseText };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

/**
 * Shut down the OpenCode server
 */
export async function shutdownOpenCode() {
    if (opencodeInstance) {
        logger.info("[OpenCode] Shutting down server...");
        opencodeInstance.server.close();
        opencodeInstance = null;
        clientInstance = null;
        serverUrl = null;
        chatSessionMap.clear();
    }
}
