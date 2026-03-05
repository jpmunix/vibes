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
import { readSettings, decrypt } from "../../main/settings";
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
            const nvmBins = versions.map((v: string) => path.join(nvmDir, v, "bin"));
            const currentPath = process.env.PATH || "";
            // Prepend NVM bins so they take priority
            process.env.PATH = [...nvmBins, currentPath].join(":");
            logger.info(`[OpenCode] Injected ${nvmBins.length} NVM bin dirs into PATH`);
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
                // Permissions: read from settings, default to allow-all (headless mode)
                permission: {
                    edit: settings.openCodePermissions?.edit || "allow",
                    bash: settings.openCodePermissions?.bash || "allow",
                    webfetch: settings.openCodePermissions?.webfetch || "allow",
                    external_directory: settings.openCodePermissions?.external_directory || "allow",
                },
                // Disable features we don't need (reduces overhead)
                autoupdate: false,
                formatter: false,
                lsp: false,
                share: "disabled",
                // Enable automatic context compaction — OpenCode will summarize
                // old messages when context fills up (no manual history management needed)
                compaction: {
                    auto: true,
                    prune: true,
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
): Promise<{ fullResponse: string; success: boolean }> {
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

    // Send initial "thinking" indicator
    sendProgressUpdate(event, req.chatId, chatMessages, "⏳ **OpenCode está iniciando...**");

    let client: ReturnType<typeof createOpencodeClient>;
    try {
        const result = await getOpenCodeClient(projectDir);
        client = result.client;
    } catch (error: any) {
        const errorMsg = `❌ Error al iniciar OpenCode: ${error.message}`;
        logger.error(errorMsg);
        return { fullResponse: errorMsg, success: false };
    }

    // Get or create session for this chat
    let sessionId = chatSessionMap.get(req.chatId);
    if (!sessionId) {
        try {
            const session = await client.session.create({
                body: { title: `Chat ${req.chatId}` },
                query: { directory: projectDir },
            });
            sessionId = session.data!.id;
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
            return { fullResponse: errorMsg, success: false };
        }
    }

    sendProgressUpdate(event, req.chatId, chatMessages, "<think>OpenCode está iniciando...</think>");

    // Subscribe to events for real-time streaming
    let fullResponse = "";
    const toolsActive = new Map<string, { tool: string; status: string; detail?: string }>();
    // Accumulated log of all operations — rendered as dyad tags in the chat
    const operationLog: { tool: string; detail: string; content: string }[] = [];
    const filesEdited: string[] = [];
    let stepCount = 0;
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
                    fullResponse += delta;
                },
                onToolUpdate: (toolId: string, tool: string, status: string, detail?: string) => {
                    toolsActive.set(toolId, { tool, status, detail });

                    // Add to accumulated log when a tool completes or errors
                    if (status === "completed") {
                        operationLog.push({
                            tool,
                            detail: detail || "",
                            content: status === "error" ? "[error]" : "[completado]",
                        });
                    } else if (status === "error") {
                        operationLog.push({
                            tool,
                            detail: detail || "",
                            content: "[error]",
                        });
                    }

                    logger.info(`[OpenCode] Tool ${tool}: ${status}${detail ? ` (${detail})` : ""}`);
                },
                onStepStart: () => {
                    stepCount++;
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
                getFullResponse: () => fullResponse,
                getToolsActive: () => toolsActive,
                getFilesEdited: () => filesEdited,
                getOperationLog: () => operationLog,
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
        const promptParts: any[] = [{ type: "text", text: req.prompt }];

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

        // Now wait for the event stream to signal completion.
        // processEvents will return when session goes idle or the stream ends.
        // We add a 180s safety timeout.
        const completionTimeout = new Promise<void>((resolve) =>
            setTimeout(() => {
                logger.warn("[OpenCode] Safety timeout reached (180s). Finalizing.");
                resolve();
            }, 180000)
        );

        await Promise.race([eventProcessingDone, completionTimeout]);

        logger.info(`[OpenCode] Response complete. Length: ${fullResponse.length}, files edited: ${filesEdited.length}, tools: ${operationLog.length}`);

        // Send final response with all content
        const finalContent = buildFinalResponse(fullResponse, filesEdited, toolsActive, operationLog);
        sendChunk(event, req.chatId, chatMessages, finalContent);

        return { fullResponse: finalContent, success: true };

    } catch (error: any) {
        if (abortController.signal.aborted) {
            logger.info(`[OpenCode] Aborted for chat ${req.chatId}`);
            try {
                await client.session.abort({ path: { id: sessionId }, query: { directory: projectDir } });
            } catch { /* ignore */ }
            return { fullResponse: fullResponse || "Operación cancelada", success: false };
        }

        logger.error("[OpenCode] Stream error:", error.message);
        return {
            fullResponse: fullResponse || `❌ Error: ${error.message}`,
            success: false,
        };
    }
}

// ============================================================================
// SSE Event Processing
// ============================================================================

async function processEvents(
    stream: AsyncIterable<any>,
    sessionId: string,
    event: IpcMainInvokeEvent,
    chatId: number,
    chatMessages: any[],
    callbacks: {
        onTextDelta: (delta: string) => void;
        onToolUpdate: (toolId: string, tool: string, status: string, detail?: string) => void;
        onStepStart: () => void;
        onFileEdited: (file: string) => void;
        getFullResponse: () => string;
        getToolsActive: () => Map<string, { tool: string; status: string; detail?: string }>;
        getFilesEdited: () => string[];
        getOperationLog: () => { tool: string; detail: string; content: string }[];
        getStepCount: () => number;
    },
    abortController: AbortController,
) {
    const sendUpdate = () => {
        const content = buildLiveContent(
            callbacks.getFullResponse(),
            callbacks.getToolsActive(),
            callbacks.getOperationLog(),
            callbacks.getStepCount(),
        );
        sendChunk(event, chatId, chatMessages, content);
    };

    let eventCount = 0;
    try {
        for await (const rawEvt of stream) {
            if (abortController.signal.aborted) break;
            eventCount++;

            // Global events come wrapped: { directory, payload: { type, properties } }
            // Unwrap the payload to get the actual event
            const evt = rawEvt.payload || rawEvt;

            if (eventCount <= 5) {
                logger.info(`[OpenCode] EVENT #${eventCount}: type=${evt.type}`);
            }

            // Only process events for our session
            const props = evt.properties || {};
            const partProps = props.part || {};

            if (partProps.sessionID && partProps.sessionID !== sessionId) continue;
            if (props.sessionID && props.sessionID !== sessionId) continue;

            switch (evt.type) {
                case "message.part.updated": {
                    const part = props.part;
                    if (!part) break;

                    switch (part.type) {
                        case "text": {
                            // Full text snapshot — use if we missed deltas
                            const content = part.content || "";
                            if (content && !callbacks.getFullResponse()) {
                                callbacks.onTextDelta(content);
                                sendUpdate();
                            }
                            break;
                        }

                        case "tool": {
                            const toolState = part.state;
                            const toolName = part.tool || "unknown";
                            const status = toolState?.status || "unknown";
                            // Extract detail from tool input (file path, query, command, etc.)
                            const input = toolState?.input || part.input || {};
                            const detail = input.file_path || input.path || input.filePath
                                || input.query || input.pattern
                                || input.command || input.cmd
                                || input.directory || input.url
                                || "";
                            callbacks.onToolUpdate(part.callID || part.id, toolName, status, detail);
                            sendUpdate();
                            break;
                        }

                        case "step-start":
                            callbacks.onStepStart();
                            logger.info(`[OpenCode] Step started`);
                            sendUpdate();
                            break;

                        case "step-finish":
                            logger.info(`[OpenCode] Step finished (tokens: in=${part.tokens?.input}, out=${part.tokens?.output})`);
                            break;
                    }
                    break;
                }

                // Text streaming deltas — this is where the AI's response text comes through
                case "message.part.delta": {
                    const delta = props.delta || "";
                    if (delta) {
                        callbacks.onTextDelta(delta);
                        sendUpdate();
                    }
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
                    logger.info(`[OpenCode] Session idle event received. Total events: ${eventCount}`);
                    return;
                }

                // Known events we can safely ignore
                case "server.connected":
                case "message.updated":
                case "session.updated":
                case "file.watcher.updated":
                    break;

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

/**
 * Build a dyad tag string for a completed tool operation.
 * These tags are parsed by DyadMarkdownParser and rendered as
 * compact icon badges with collapsible details.
 */
function buildDyadTag(tool: string, detail: string, content: string): string {
    const dyadTag = mapToolToDyadTag(tool);

    switch (dyadTag) {
        case "dyad-write":
            return `<dyad-write path="${escapeAttr(detail)}" description="Escrito por OpenCode">${content}</dyad-write>`;
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

/** Escape XML/HTML attribute values */
function escapeAttr(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Build live content showing accumulated dyad tags + current activity + response text.
 * This is what the user sees in the chat bubble while OpenCode works.
 */
function buildLiveContent(
    fullResponse: string,
    toolsActive: Map<string, { tool: string; status: string; detail?: string }>,
    operationLog: { tool: string; detail: string; content: string }[],
    stepCount: number,
): string {
    let content = "";

    // Emit completed operations as dyad tags — the parser will render them as icon badges
    for (const op of operationLog) {
        content += buildDyadTag(op.tool, op.detail, op.content) + "\n";
    }

    // Show reasoning/thinking as <think> tags (rendered as collapsible purple brain icon)
    const thinkingTools = Array.from(toolsActive.values()).filter(
        t => (t.status === "running" || t.status === "pending") && t.tool !== "edit" && t.tool !== "write"
    );
    if (thinkingTools.length > 0 && !fullResponse) {
        content += `<think>Analizando...${thinkingTools.map(t => ` ${mapToolName(t.tool)}`).join(",")}</think>\n`;
    }

    // Active tool indicator (pending tools shown as dyad tags with pending state)
    const activeEdits = Array.from(toolsActive.values()).filter(
        t => (t.status === "running" || t.status === "pending") &&
            (t.tool === "edit" || t.tool === "write" || t.tool === "read")
    );
    for (const t of activeEdits) {
        const tag = mapToolToDyadTag(t.tool);
        content += `<${tag} path="${escapeAttr(t.detail || "...")}">`; // unclosed = pending
    }

    // Separator before response text
    if (fullResponse) {
        content += "\n" + cleanResponseText(fullResponse);
    } else if (operationLog.length === 0 && toolsActive.size === 0) {
        content += "<think>Iniciando...</think>\n";
    }

    return content;
}

/**
 * Build the final response combining dyad tags + text + file edits.
 * All tool operations become proper dyad tags that the parser renders
 * with the same collapsible UI as the legacy agent.
 */
function buildFinalResponse(
    fullResponse: string,
    filesEdited: string[],
    toolsActive: Map<string, { tool: string; status: string; detail?: string }>,
    operationLog?: { tool: string; detail: string; content: string }[],
): string {
    let content = "";

    // Emit completed operations as dyad tags
    if (operationLog && operationLog.length > 0) {
        for (const op of operationLog) {
            content += buildDyadTag(op.tool, op.detail, op.content) + "\n";
        }
    }

    // Add file edits as dyad-write tags (for files tracked via file.edited events
    // but not already covered by tool operations)
    if (filesEdited.length > 0) {
        const loggedPaths = new Set(
            (operationLog || [])
                .filter(op => op.tool === "write" || op.tool === "edit")
                .map(op => path.basename(op.detail)),
        );

        for (const file of filesEdited) {
            const basename = path.basename(file);
            if (!loggedPaths.has(basename)) {
                content += `<dyad-write path="${escapeAttr(file)}" description="Modificado por OpenCode">[contenido actualizado]</dyad-write>\n`;
            }
        }
    }

    // Add the text response (cleaned of internal tags)
    if (fullResponse) {
        content += "\n" + cleanResponseText(fullResponse);
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
