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
 *     └─ chat_stream_handlers.ts — routes "agent" mode here (Agente)
 */

import log from "electron-log";
import { createOpencode, createOpencodeClient } from "@opencode-ai/sdk";
import type { IpcMainInvokeEvent } from "electron";
import { readSettings, writeSettings, decrypt } from "../../main/settings";
import { getVibesAppPath } from "../../paths/paths";
import { safeSend } from "../utils/safe_sender";
import type { ChatStreamParams } from "@/ipc/types";
import * as path from "node:path";
import { getRemoteDb } from "../../db/remote";
import * as remoteSchema from "../../db/remote-schema";
import { eq, and } from "drizzle-orm";
import { McpServer } from "../types/mcp";

const logger = log.scope("opencode_adapter");

// ============================================================================
// Singleton: OpenCode server + client instance
// ============================================================================

let opencodeInstance: Awaited<ReturnType<typeof createOpencode>> | null = null;
let clientInstance: ReturnType<typeof createOpencodeClient> | null = null;
let serverUrl: string | null = null;

// Map chatId → opencode sessionId
const chatSessionMap = new Map<number, string>();

// Map appPath → visual-edit session ID (persistent per app)
const visualEditSessionMap = new Map<string, string>();

/**
 * Revert the last message in the OpenCode session for a chat (undo/retry).
 * Uses session.revert() first; if it fails, falls back to session.fork()
 * which creates a new session branching from the target message — preserving
 * all accumulated context instead of destroying the session.
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
        logger.warn(`[OpenCode] session.revert failed for ${sessionId}: ${error.message} — attempting fork fallback`);

        // Fallback: fork the session at the last user message to preserve context
        try {
            const msgsResult = await clientInstance.session.messages({
                path: { id: sessionId },
                query: { limit: 6 },
            });
            const messages = msgsResult.data || [];
            // Find the last user message (the point we want to branch from)
            const lastUser = [...messages].reverse().find(
                (m: any) => m.info?.role === "user"
            );
            if (lastUser?.info?.id) {
                const forked = await clientInstance.session.fork({
                    path: { id: sessionId },
                    body: { messageID: lastUser.info.id },
                } as any);
                const newSessionId = forked.data?.id;
                if (newSessionId) {
                    chatSessionMap.set(chatId, newSessionId);
                    logger.info(`[OpenCode] Forked session ${sessionId} → ${newSessionId} at message ${lastUser.info.id} (context preserved)`);
                    return;
                }
            }
        } catch (forkError: any) {
            logger.warn(`[OpenCode] session.fork fallback also failed: ${forkError.message}`);
        }

        // Last resort: destroy session
        chatSessionMap.delete(chatId);
        logger.warn(`[OpenCode] Dropped session ${sessionId} for chat ${chatId} (both revert and fork failed)`);
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
 * Update the OpenCode server config in-place (no restart needed).
 * Called when user changes model or reasoning effort in settings.
 */
export async function updateOpenCodeConfig(changes: {
    selectedModel?: { provider?: string; name: string };
    standardModeModel?: string;
    reasoningEffort?: string;
    textVerbosity?: string;
}): Promise<void> {
    if (!clientInstance) return; // server not started yet

    try {
        const body: Record<string, any> = {};

        if (changes.selectedModel) {
            const providerID = mapProviderForOpenCode(changes.selectedModel);
            body.model = `${providerID}/${changes.selectedModel.name}`;
        }
        if (changes.standardModeModel) {
            body.small_model = `openrouter/${changes.standardModeModel}`;
        }
        if (changes.reasoningEffort || changes.textVerbosity) {
            body.agent = {
                build: {
                    ...(changes.reasoningEffort ? { reasoningEffort: changes.reasoningEffort } : {}),
                    ...(changes.textVerbosity ? { textVerbosity: changes.textVerbosity } : {}),
                },
            };
        }

        await clientInstance.config.update({ body: body as any });
        logger.info(`[OpenCode] Config updated in-place: ${JSON.stringify(body)}`);
    } catch (error: any) {
        logger.warn(`[OpenCode] config.update() failed: ${error.message}`);
    }
}

/**
 * Hot update OpenCode MCP servers config without restarting
 */
export async function updateOpenCodeMcpConfig(servers: McpServer[]): Promise<void> {
    if (!clientInstance) return;
    try {
        const mcpConfig = buildMcpConfig(servers);
        if (mcpConfig) {
            await clientInstance.config.update({ body: { mcp: mcpConfig } as any });
            logger.info(`[OpenCode] MCP config updated in-place`);
        }
    } catch (error: any) {
        logger.warn(`[OpenCode] config.update(mcp) failed: ${error.message}`);
    }
}

function buildMcpConfig(servers: McpServer[]) {
    if (!servers || servers.length === 0) return undefined;
    return Object.fromEntries(
        servers.map(s => [
            s.name.replace(/[^a-zA-Z0-9_-]/g, ""),
            s.transport === "stdio"
                ? {
                      type: "local" as const,
                      command: [s.command!, ...(s.args ?? [])],
                      enabled: true,
                      environment: s.envJson ?? {},
                  }
                : {
                      type: "remote" as const,
                      url: s.url!,
                      enabled: true,
                      headers: { ...s.headersJson, ...s.envJson },
                  }
        ])
    );
}

/**
 * Run a quick visual edit via the hidden "visual-edit" OpenCode subagent.
 * Uses a persistent session per app — the agent accumulates context across
 * edits and OpenCode's auto-compaction + prune handles context overflow.
 *
 * The agent edits the file directly → Vite HMR picks up the change.
 * No chat is created in the user's UI.
 */
export async function handleVisualQuickEdit(params: {
    appPath: string;
    componentFile: string;   // e.g. "src/pages/Login.tsx"
    componentLine: number;   // e.g. 148
    componentName: string;   // e.g. "Input"
    prompt: string;          // e.g. "añade el típico ojo"
    onStatus?: (status: string) => void; // optional status callback
}): Promise<{ success: boolean; summary?: string; error?: string }> {
    const { appPath, componentFile, componentLine, componentName, prompt, onStatus } = params;

    let client: ReturnType<typeof createOpencodeClient>;
    try {
        const result = await getOpenCodeClient(appPath);
        client = result.client;
    } catch (error: any) {
        logger.error(`[VisualEdit] Failed to get OpenCode client: ${error.message}`);
        return { success: false, error: `Error al conectar con OpenCode: ${error.message}` };
    }

    // Reuse existing session for this app, or create a new one
    let sessionId = visualEditSessionMap.get(appPath);
    if (!sessionId) {
        try {
            onStatus?.("Preparando el agente...");
            const session = await client.session.create({
                body: { title: `Visual Edit` },
                query: { directory: appPath },
            });
            if (!session.data?.id) {
                throw new Error("Session creation returned no data");
            }
            sessionId = session.data.id;
            visualEditSessionMap.set(appPath, sessionId);
            logger.info(`[VisualEdit] Created persistent session ${sessionId} for ${appPath}`);
        } catch (error: any) {
            logger.error(`[VisualEdit] Failed to create session: ${error.message}`);
            return { success: false, error: `Error al crear sesión: ${error.message}` };
        }
    } else {
        logger.info(`[VisualEdit] Reusing session ${sessionId} for ${appPath}`);
    }

    try {
        // Subscribe to SSE events to track progress
        const sseAbortController = new AbortController();
        const eventsResult = await client.global.event({ signal: sseAbortController.signal } as any);

        let agentText = "";
        let completed = false;
        let eventCount = 0;
        let filesEdited: string[] = [];

        // Process events in background — mirrors processEvents() logic exactly
        const eventDone = (async () => {
            try {
                for await (const rawEvt of eventsResult.stream) {
                    eventCount++;
                    const evt = (rawEvt as any).payload || rawEvt;
                    const props = evt.properties || {};
                    const eventType = evt.type || "";

                    // Session filtering — skip events that belong to a DIFFERENT session
                    // (but keep events that have no sessionID, like session.idle)
                    const partProps = props.part || {};
                    if (partProps.sessionID && partProps.sessionID !== sessionId) continue;
                    if (props.sessionID && props.sessionID !== sessionId) continue;

                    // Log every event for debugging
                    logger.info(`[VisualEdit] #${eventCount} ${eventType}${props.part ? ` part.type=${props.part.type}` : ""}${props.info ? ` role=${props.info.role}` : ""}`);

                    switch (eventType) {
                        case "message.part.updated": {
                            const part = props.part;
                            if (!part) break;

                            // Track text output from the agent
                            if (part.type === "text" && part.text) {
                                agentText = part.text;
                                logger.info(`[VisualEdit] 📝 Text: ${part.text.substring(0, 100)}...`);
                            }

                            // Track tool activity for status feedback
                            if (part.type === "tool") {
                                const toolState = part.state;
                                const toolName = part.tool || "unknown";
                                const status = toolState?.status || "unknown";
                                const input = toolState?.input || part.input || {};
                                const detail = input.file_path || input.path || input.filePath
                                    || input.command || "";

                                logger.info(`[VisualEdit] 🔧 Tool ${toolName}: ${status}${detail ? ` (${detail})` : ""}`);

                                if (status === "running" || status === "pending") {
                                    if (toolName === "read" || toolName === "glob" || toolName === "grep") {
                                        onStatus?.(`Leyendo ${detail || componentFile}...`);
                                    } else if (toolName === "edit" || toolName === "write") {
                                        onStatus?.("Aplicando cambios...");
                                    }
                                }
                            }
                            break;
                        }

                        case "message.updated": {
                            const delta = props.delta;
                            if (typeof delta === "string" && delta.length > 0) {
                                // Text delta — accumulate
                                agentText += delta;
                            }
                            break;
                        }

                        case "file.edited": {
                            const file = props.file;
                            if (file) {
                                filesEdited.push(file);
                                logger.info(`[VisualEdit] 📂 File edited: ${file}`);
                                onStatus?.(`Editado: ${path.basename(file)}`);
                            }
                            break;
                        }

                        case "session.idle": {
                            logger.info(`[VisualEdit] ✅ Session idle — complete. Total events: ${eventCount}, files edited: ${filesEdited.length}`);
                            completed = true;
                            return; // Exit the for-await loop
                        }

                        case "session.status": {
                            const status = props.status || props.session?.status;
                            logger.info(`[VisualEdit] Session status: ${JSON.stringify(status)}`);
                            if (status?.type === "idle") {
                                completed = true;
                                return;
                            }
                            break;
                        }

                        case "permission.asked": {
                            const reqId = props.id || props.requestID;
                            if (!reqId) break;
                            // Auto-approve all permissions
                            try {
                                await client.postSessionIdPermissionsPermissionId({
                                    path: { id: sessionId, permissionID: reqId },
                                    body: { response: "always" }
                                });
                                logger.info(`[VisualEdit] Auto-approved permission: ${props.type}`);
                            } catch (e: any) {
                                logger.error(`[VisualEdit] Permission error: ${e.message}`);
                            }
                            break;
                        }

                        // Ignore known noise events
                        case "server.connected":
                        case "session.updated":
                        case "file.watcher.updated":
                            break;

                        default:
                            if (eventCount <= 30) {
                                logger.info(`[VisualEdit] Unhandled: ${eventType}`);
                            }
                            break;
                    }
                }
            } catch (err: any) {
                if (!sseAbortController.signal.aborted) {
                    logger.warn(`[VisualEdit] SSE stream error: ${err.message}`);
                }
            }
        })();

        // Build the prompt with component context
        const settings = readSettings();
        const model = settings.selectedModel;
        const providerID = mapProviderForOpenCode(model);

        const agentPrompt = [
            `Edita el componente "${componentName}" en el archivo "${componentFile}" (línea ${componentLine}).`,
            ``,
            `Petición del usuario: ${prompt}`,
            ``,
            `IMPORTANTE: Lee el archivo primero para entender el contexto. Haz solo el cambio pedido.`,
        ].join("\n");

        onStatus?.(`Editando ${componentName}...`);

        // Send the prompt to the visual-edit subagent
        await client.session.promptAsync({
            path: { id: sessionId },
            query: { directory: appPath },
            body: {
                model: {
                    providerID,
                    modelID: model.name,
                },
                parts: [{ type: "text", text: `@visual-edit ${agentPrompt}` }],
            },
        });

        logger.info(`[VisualEdit] Prompt sent to visual-edit agent (model: ${providerID}/${model.name})`);

        // Wait for completion with timeout (120s for slower models)
        const timeout = new Promise<void>((resolve) => setTimeout(resolve, 120_000));
        await Promise.race([eventDone, timeout]);

        // Clean up SSE
        sseAbortController.abort();

        if (!completed) {
            logger.warn(`[VisualEdit] Timed out after 120s. Events received: ${eventCount}`);
            // Try to abort the session so it doesn't keep running
            try { await client.session.abort({ path: { id: sessionId }, query: { directory: appPath } }); } catch {}
            return { success: false, error: "Tiempo de espera agotado. Verifica los logs para más detalle." };
        }

        // Extract summary from agent's text response
        const summary = agentText.trim() || "Cambio aplicado";
        logger.info(`[VisualEdit] ✅ Completed. Summary: ${summary.substring(0, 200)}`);

        return {
            success: filesEdited.length > 0 || agentText.length > 0,
            summary,
        };

    } catch (error: any) {
        logger.error(`[VisualEdit] Error: ${error.message}`);
        // Invalidate session only on connection/protocol errors, not on model errors
        if (error.message?.includes("session") || error.message?.includes("connect")) {
            visualEditSessionMap.delete(appPath);
            logger.info(`[VisualEdit] Invalidated session for ${appPath} due to connection error`);
        }
        return { success: false, error: error.message };
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
        // The SDK's createOpencodeServer() doesn't accept `cwd`, so it inherits
        // Electron's CWD (our project root) and writes config.json there, which
        // triggers Vite page reloads that kill SSE streaming.
        // Fix: temporarily change cwd before spawning, then restore it.
        const { app } = require("electron");
        const opencodeDataDir = path.join(app.getPath("userData"), "opencode-server");
        const fs = require("fs");
        if (!fs.existsSync(opencodeDataDir)) {
            fs.mkdirSync(opencodeDataDir, { recursive: true });
        }

        const originalCwd = process.cwd();
        process.chdir(opencodeDataDir);
        
        // Load MCP servers
        const { getRemoteDb } = await import("../../db/remote");
        const db = getRemoteDb();
        const settingsRecord = await db.query.userSettings.findFirst();
        let enabledServers: any[] = [];
        if (settingsRecord?.userId) {
            enabledServers = await db.query.mcpServers.findMany({
                where: and(
                    eq(remoteSchema.mcpServers.userId, settingsRecord.userId),
                    eq(remoteSchema.mcpServers.enabled, 1)
                ),
            });
            // Parse arguments just in case
            enabledServers = enabledServers.map(s => ({
                ...s,
                args: s.args ? typeof s.args === "string" ? JSON.parse(s.args) : s.args : null,
                envJson: s.envJson ? typeof s.envJson === "string" ? JSON.parse(s.envJson) : s.envJson : null,
                headersJson: s.headersJson ? typeof s.headersJson === "string" ? JSON.parse(s.headersJson) : s.headersJson : null,
            }));
        }

        const config = {
                provider: {
                    [providerID]: (providerID === "openrouter" ? {
                            name: "openrouter",
                        } : {}),
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
                        reasoningEffort: settings.reasoningEffort || "medium",
                        textVerbosity: settings.textVerbosity || "low",
                    },
                    // Hidden subagent for quick visual edits from the NaturalEditingPanel.
                    // Invoked programmatically — never shown in the UI.
                    "visual-edit": {
                        description: "Realiza ediciones visuales puntuales a componentes React/JSX. Solo edita el archivo indicado.",
                        mode: "subagent",
                        hidden: true,
                        temperature: 0.1,
                        permission: {
                            edit: "allow",
                            bash: { "*": "deny" },
                            webfetch: "deny",
                        },
                        prompt: [
                            "Eres un agente de edición visual rápida para componentes React/JSX.",
                            "Tu ÚNICA tarea es hacer cambios pequeños y precisos al componente indicado.",
                            "",
                            "REGLAS ESTRICTAS:",
                            "- Lee el archivo indicado y modifica SOLO las líneas relevantes del componente",
                            "- Usa las clases/estilos existentes del proyecto (Tailwind, CSS modules, inline styles, etc.)",
                            "- NO crees archivos nuevos",
                            "- NO ejecutes comandos bash",
                            "- NO hagas cambios fuera del componente especificado",
                            "- Responde con un resumen de 1 línea de lo que cambiaste, en el mismo idioma del usuario",
                            "- Si instalas una dependencia nueva (como un icono), añádela al import existente",
                        ].join("\n"),
                    },
                    // Custom primary agent: hyper-fast mockup mode (no bash, limited steps)
                    // Defined as a real OpenCode custom agent per https://opencode.ai/docs/agents
                    "mockup": {
                        description: "Agente veloz para crear mockups y editar componentes visuales sin compilar ni verificar.",
                        mode: "primary",
                        reasoningEffort: "none",
                        tools: {
                            write: true,
                            edit: true,
                            bash: false,
                        },
                        permission: {
                            edit: "allow",
                            bash: "deny",
                            webfetch: "deny",
                        },
                        prompt: "Eres un agente veloz focalizado en diseño y mockups visuales. Modifica y crea archivos directamente. Está PROHIBIDO usar la terminal o comandos bash. No compiles, no ejecutes nada. Responde en el mismo idioma del usuario.",
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
                // LSP servers (TypeScript, ESLint, etc.): when enabled, diagnostics are sent
                // after each file write so the agent can auto-fix TS errors inline.
                // When disabled, the agent should run tsc/eslint manually at the end.
                // Controlled via Settings → Agente → "Diagnósticos LSP por archivo".
                ...((settings.enableOpenCodeLsp !== false ? { lsp: {} } : { lsp: false }) as any),
                // Disable features we don't need (reduces overhead)
                autoupdate: false,
                formatter: false,
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
                mcp: buildMcpConfig(enabledServers) || {},
        };

        let opencode: Awaited<ReturnType<typeof createOpencode>>;
        try {
            opencode = await createOpencode({
                hostname: "127.0.0.1",
                port: 0, // auto-assign port
                config: config as any,
            });
        } finally {
            // Always restore CWD, even if createOpencode fails
            process.chdir(originalCwd);
        }

        opencodeInstance = opencode;
        clientInstance = opencode.client;
        serverUrl = opencode.server.url;

        logger.info(`[OpenCode] Server running at ${serverUrl} (config dir: ${opencodeDataDir})`);
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
        /** OpenCode agent to use: "build" (full), "plan" (restricted), "explore" (read-only), "mockup" (fast UI designer) */
        agentId?: "build" | "plan" | "explore" | "mockup";
        /** Context instructions to inject via config.update */
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

    // Resolve the full project directory path — this is CRITICAL for OpenCode
    const projectDir = getVibesAppPath(appPath);

    // Determine agent mode for contextual logging prefix
    const agentMode = options.agentId || "build";
    const modeLabel = agentMode.charAt(0).toUpperCase() + agentMode.slice(1); // "Build", "Plan", "Explore"
    const LP = `[OpenCode:${modeLabel}]`; // Log Prefix — used throughout this function

    // Inject integration env vars into the process so OpenCode's bash can use them
    if (options.integrationEnvVars) {
        for (const [key, value] of Object.entries(options.integrationEnvVars)) {
            process.env[key] = value;
        }
        logger.info(`${LP} Injected ${Object.keys(options.integrationEnvVars).length} integration env vars: ${Object.keys(options.integrationEnvVars).join(', ')}`);
    }

    logger.info(`${LP} Starting stream for chat ${req.chatId}, project: ${projectDir}`);


    let client: ReturnType<typeof createOpencodeClient>;
    try {
        const result = await getOpenCodeClient(projectDir);
        client = result.client;
    } catch (error: any) {
        const errorMsg = `❌ Error al iniciar OpenCode: ${error.message}`;
        logger.error(`${LP} ${errorMsg}`);
        return { fullResponse: errorMsg, success: false, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cachedTokens: 0 };
    }

    // Get or create session for this chat
    let sessionId = chatSessionMap.get(req.chatId);

    // Try to restore session from DB if not in memory
    if (!sessionId) {
        try {
            const db = getRemoteDb();
            const chatRecord = await db.query.chats.findFirst({
                where: eq(remoteSchema.chats.id, req.chatId),
                columns: { opencodeSessionId: true },
            });
            if (chatRecord?.opencodeSessionId) {
                // Verify session still exists on the server
                try {
                    const sessionCheck = await client.session.get({
                        path: { id: chatRecord.opencodeSessionId },
                    });
                    if (sessionCheck.data?.id) {
                        sessionId = chatRecord.opencodeSessionId;
                        chatSessionMap.set(req.chatId, sessionId);
                        logger.info(`${LP} Restored session ${sessionId} from DB for chat ${req.chatId}`);
                    }
                } catch {
                    logger.info(`${LP} Session ${chatRecord.opencodeSessionId} no longer valid, creating new one`);
                }
            }
        } catch (e: any) {
            logger.warn(`${LP} Failed to restore session from DB: ${e.message}`);
        }
    }

    if (!sessionId) {
        try {
            const session = await client.session.create({
                body: { title: `Chat ${req.chatId}` },
                query: { directory: projectDir },
            });
            logger.info(`${LP} Session create response: ${JSON.stringify(session)}`);
            if (!session.data?.id) {
                throw new Error(`Session creation returned no data: ${JSON.stringify(session)}`);
            }
            sessionId = session.data.id;
            chatSessionMap.set(req.chatId, sessionId);
            logger.info(`${LP} Created session ${sessionId} for chat ${req.chatId} in ${projectDir}`);

            // Persist to DB for recovery across restarts
            try {
                const db = getRemoteDb();
                await db.update(remoteSchema.chats)
                    .set({ opencodeSessionId: sessionId })
                    .where(eq(remoteSchema.chats.id, req.chatId));
                logger.info(`${LP} Persisted sessionId ${sessionId} to DB for chat ${req.chatId}`);
            } catch (e: any) {
                logger.warn(`${LP} Failed to persist sessionId: ${e.message}`);
            }

            // Initialize project context — generates AGENTS.md with tech stack,
            // build commands, and architecture. This is the key mechanism that gives
            // the agent native project knowledge (equivalent to /init in OpenCode CLI).
            // Only runs ONCE per project: if AGENTS.md already exists, skip it.
            // Runs SYNCHRONOUSLY so the agent has AGENTS.md before the first prompt.
            // If the user already sent a message, the UI shows "Analizando tu proyecto...".
            {
                const fs = await import("fs");
                const pathModule = await import("path");

                // Pre-check: does the project directory actually exist?
                if (!fs.existsSync(projectDir)) {
                    logger.warn(`${LP} ⚠️ Project directory does NOT exist: ${projectDir} — skipping init`);
                } else {
                    const agentsMdPaths = [
                        pathModule.join(projectDir, "AGENTS.md"),
                        pathModule.join(projectDir, ".opencode", "AGENTS.md"),
                        pathModule.join(projectDir, "docs", "AGENTS.md"),
                    ];
                    const hasAgentsMd = agentsMdPaths.some(p => fs.existsSync(p));

                    if (!hasAgentsMd) {
                        logger.info(`${LP} No AGENTS.md found — running init for ${projectDir}...`);

                        // Send "analyzing" status to the frontend
                        sendProgressUpdate(event, req.chatId, chatMessages,
                            `<vibes-status title="Analizando tu proyecto...">Generando contexto del proyecto</vibes-status>`);

                        try {
                            const settings = readSettings();
                            const model = settings.selectedModel;
                            const initProviderID = mapProviderForOpenCode(model);

                            // Build init body — messageID is required by the SDK type but
                            // some server versions reject empty strings. Use a sentinel value.
                            const initBody: { providerID: string; modelID: string; messageID: string } = {
                                providerID: initProviderID,
                                modelID: model.name,
                                messageID: "init",
                            };

                            logger.info(`${LP} 🔧 Running init with model ${initProviderID}/${model.name} | dir=${projectDir}`);
                            const initResult = await client.session.init({
                                path: { id: sessionId },
                                query: { directory: projectDir },
                                body: initBody,
                            });
                            logger.info(`${LP} ✅ Init completed (result: ${JSON.stringify(initResult.data)})`);

                            // Verify AGENTS.md was actually created
                            const createdAgentsMd = agentsMdPaths.find(p => fs.existsSync(p));
                            if (createdAgentsMd) {
                                logger.info(`${LP} 📄 AGENTS.md created at: ${createdAgentsMd}`);
                            } else {
                                logger.warn(`${LP} ⚠️ Init returned success but AGENTS.md not found on disk (server may write it lazily)`);
                            }
                        } catch (initError: any) {
                            // Log the FULL error for debugging — not just the message
                            logger.warn(`${LP} ❌ Init failed (non-fatal): ${initError.message}`);
                            logger.warn(`${LP}    Full error:`, JSON.stringify({
                                status: initError.status || initError.statusCode,
                                body: initError.body || initError.response?.body,
                                data: initError.data,
                                stack: initError.stack?.split('\n').slice(0, 3).join(' → '),
                            }));
                            // Non-fatal — agent will work without AGENTS.md, just less context
                        }

                        // Clear the analyzing status from the UI
                        sendChunk(event, req.chatId, chatMessages, "");
                    } else {
                        logger.info(`${LP} AGENTS.md already exists, skipping init`);
                    }
                }
            }

        } catch (error: any) {
            const errorMsg = `❌ Error al crear sesión: ${error.message}`;
            logger.error(`${LP} ${errorMsg}`);
            return { fullResponse: errorMsg, success: false, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cachedTokens: 0 };
        }
    }

    // Inject context instructions via agent.build.prompt (survives compaction)
    // This replaces the old noReply hack which created a ghost message that got
    // lost during context compaction. config.update() persists for the session.
    if (options.contextInstructions && options.contextInstructions.length > 0) {
        const contextText = options.contextInstructions.join("\n\n---\n\n");
        logger.info(`${LP} Setting agent.build.prompt with ${options.contextInstructions.length} context instructions (${contextText.length} chars)`);
        try {
            await client.config.update({
                body: {
                    agent: {
                        build: {
                            prompt: contextText,
                        },
                    },
                } as any,
            });
            logger.info(`${LP} Context instructions set via config.update`);
        } catch (ctxError: any) {
            logger.warn(`${LP} Failed to set context via config.update: ${ctxError.message}`);
            // Non-fatal — continue without context
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
    // Dedicated AbortController for the SSE stream — aborting this closes the
    // underlying fetch connection immediately (the SDK SSE client respects `signal`).
    const sseAbortController = new AbortController();

    // Wire the user's abort signal to eagerly kill the SSE + tell OpenCode to stop.
    // This runs AS SOON as the user clicks "Stop", not after processEvents finishes.
    const onUserAbort = () => {
        logger.info(`${LP} ⛔ User abort detected — killing SSE stream and sending session.abort()`);
        sseAbortController.abort();
        // Fire-and-forget session.abort() so the server stops generating
        client.session.abort({ path: { id: sessionId! }, query: { directory: projectDir } }).catch(() => {});
    };
    if (abortController.signal.aborted) {
        // Already aborted before we even started
        onUserAbort();
    } else {
        abortController.signal.addEventListener("abort", onUserAbort, { once: true });
    }

    try {
        // Start global event subscription (captures ALL events across the server)
        // Pass the SSE abort signal so the connection closes when we abort.
        logger.info(`${LP} Subscribing to global events...`);
        const eventsResult = await client.global.event({ signal: sseAbortController.signal } as any);
        eventSubscription = eventsResult;
        logger.info(`${LP} Event subscription ready.`);

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

                    logger.info(`${LP} 🔨 Tool ${tool}: ${status}${detail ? ` (${detail})` : ""}${output ? ` [${output.length}ch output]` : ""}`);
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
                        logger.info(`${LP} 📂 File edited: ${file}`);
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

        logger.info(`${LP} Sending prompt to session ${sessionId} with model ${providerID}/${model.name}`);
        logger.info(`${LP} Project directory: ${projectDir}`);
        logger.info(`${LP} Prompt: "${req.prompt.substring(0, 100)}..."`);

        // Build prompt parts: text + optional file attachments
        // On the very first message of a brand new app (no prior assistant messages),
        // inject a build-mode instruction so the agent directly implements instead of
        // proposing a plan. Only for the "build" agent — plan/explore have their own behavior.
        let promptText = req.prompt;
        const effectiveAgent = options.agentId || "build";
        const isMockupMode = effectiveAgent === "mockup";

        if (isMockupMode) {
            // Mockup mode uses the custom "mockup" primary agent defined in config
            // (steps: 8, bash: false, write/edit: true)
            logger.info(`${LP} ⚡ Mockup mode — using custom mockup agent (no bash, 8 steps)`);
        } else if (effectiveAgent === "build") {
            // Ignore the placeholder message ID which is already pushed to chatMessages for this very request
            const hasAssistantMessages = chatMessages.some((m: any) => m.role === "assistant" && m.id !== placeholderMessageId);
            if (!hasAssistantMessages) {
                promptText = `[INSTRUCCIÓN DE SISTEMA: No propongas un plan ni pidas confirmación. Ejecuta directamente lo que pide el usuario. Implementa el código, crea los archivos necesarios y haz los cambios sin pedir permiso. NUNCA expliques cómo ejecutar la app, aquí se compila automáticamente. Responde en el mismo idioma.]\n\n${req.prompt}`;
                logger.info(`${LP} 🚀 First message of app (no prior assistant messages) — injected build-mode instruction`);
            }
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
                    logger.info(`${LP} Attached image: ${att.name}`);
                }
                // upload-to-codebase → copy to project and mention in prompt
                else if (att.attachmentType === "upload-to-codebase") {
                    const fs = require("fs");
                    const destPath = path.join(projectDir, att.name);
                    try {
                        fs.copyFileSync(attPath, destPath);
                        promptParts[0].text += `\n\n[Archivo subido al proyecto: ${att.name}]`;
                        logger.info(`${LP} Uploaded to codebase: ${att.name}`);
                    } catch (e: any) {
                        logger.warn(`${LP} Failed to copy attachment: ${e.message}`);
                    }
                }
                // Text files → inline content in prompt
                else {
                    try {
                        const fs = require("fs");
                        const content = fs.readFileSync(attPath, "utf-8");
                        promptParts[0].text += `\n\nAdjunto (${att.name}):\n\`\`\`\n${content}\n\`\`\``;
                        logger.info(`${LP} Inlined text attachment: ${att.name}`);
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
                agent: effectiveAgent !== "build" ? effectiveAgent : undefined,
                parts: promptParts,
            },
        });

        logger.info(`${LP} Prompt sent (async). Waiting for events...`);

        // Wait for the event stream to signal completion.
        // processEvents returns when session goes idle or the stream ends.
        await eventProcessingDone;

        // If the stream was aborted (stop button), session.abort() was already
        // sent eagerly by the onUserAbort listener — just return partial text.
        if (abortController.signal.aborted) {
            logger.info(`${LP} Aborted for chat ${req.chatId} — returning partial response`);
            const partialText = timeline.filter(e => e.type === "text").map(e => (e as any).text).join("");
            return { fullResponse: partialText || "Operación cancelada", success: false, inputTokens: totalInputTokens, outputTokens: totalOutputTokens, reasoningTokens: totalReasoningTokens, cachedTokens: totalCachedTokens };
        }

        const totalText = timeline.filter(e => e.type === "text").map(e => (e as any).text).join("");
        const totalTools = timeline.filter(e => e.type === "tool").length;
        logger.info(`${LP} ✅ Response complete. Text: ${totalText.length}ch, files edited: ${filesEdited.length}, tools: ${totalTools}`);

        // Send final response with all content
        const finalContent = buildFinalResponse(timeline, filesEdited, toolsActive);
        logger.info(`${LP} 🔍 TRACE buildFinalResponse: ${finalContent.length}ch, first80="${finalContent.slice(0, 80).replace(/\n/g, '\\n')}"`);
        sendChunk(event, req.chatId, chatMessages, finalContent);

        logger.info(`${LP} 📊 Token usage: input=${totalInputTokens}, output=${totalOutputTokens}, reasoning=${totalReasoningTokens}, total=${totalInputTokens + totalOutputTokens}`);
        return { fullResponse: finalContent, success: true, inputTokens: totalInputTokens, outputTokens: totalOutputTokens, reasoningTokens: totalReasoningTokens, cachedTokens: totalCachedTokens };

    } catch (error: any) {
        if (abortController.signal.aborted) {
            logger.info(`${LP} Aborted for chat ${req.chatId}`);
            // session.abort() already fired eagerly — no need to call again
            const partialText = timeline.filter(e => e.type === "text").map(e => (e as any).text).join("");
            return { fullResponse: partialText || "Operación cancelada", success: false, inputTokens: totalInputTokens, outputTokens: totalOutputTokens, reasoningTokens: totalReasoningTokens, cachedTokens: totalCachedTokens };
        }

        logger.error(`${LP} Stream error:`, error.message);
        const errText = timeline.filter(e => e.type === "text").map(e => (e as any).text).join("");
        return {
            fullResponse: errText || `❌ Error: ${error.message}`,
            success: false,
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            reasoningTokens: totalReasoningTokens,
            cachedTokens: totalCachedTokens,
        };
    } finally {
        // Clean up the abort listener to avoid leaks
        abortController.signal.removeEventListener("abort", onUserAbort);
        // Ensure SSE is always closed when we exit
        if (!sseAbortController.signal.aborted) {
            sseAbortController.abort();
        }
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
    // Guard: file.edited events fired by the watcher BEFORE the agent's first step
    // are ambient sync events (not real agent edits). Only collect them after step-start.
    let agentHasStartedStep = false;

    try {
        for await (const rawEvt of stream) {
            if (abortController.signal.aborted) break;
            eventCount++;

            const evt = rawEvt.payload || rawEvt;
            const props = evt.properties || {};

            // Log events at debug level to avoid console spam — meaningful events
            // (tools, steps, think blocks) have their own info-level logs below.
            logger.debug(`[OC:Event] #${eventCount} ${evt.type}${props.part ? ` part.type=${props.part.type}` : ""}${props.info ? ` role=${props.info.role}` : ""}${props.delta != null ? ` delta=${String(props.delta).length}ch` : ""}${props.field ? ` field=${props.field}` : ""}`);

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
                        logger.info(`[OC:Event] 📬 Assistant message ID: ${assistantMessageId}`);
                    }
                    break;
                }

                case "message.part.updated": {
                    const part = props.part;
                    if (!part) break;

                    // Skip parts not belonging to the assistant message
                    if (part.messageID && assistantMessageId && part.messageID !== assistantMessageId) {
                        logger.debug(`[OC:Event] ⏭️ Skip part (msgID=${part.messageID} != assistant=${assistantMessageId})`);
                        break;
                    }
                    if (!assistantMessageId && (part.type === "text" || part.type === "reasoning")) {
                        logger.debug(`[OC:Event] ⏭️ Skip early ${part.type} (no assistant ID yet)`);
                        break;
                    }

                    logger.debug(`[OC:Event] 📦 PART type=${part.type} text=${part.text ? `${part.text.length}ch` : "null"}`);

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
                                logger.info(`[OC:Event] 🧠 CLOSED </think> — text part started`);
                                sendUpdate();
                            } else if (reasoningBuffer.length > 0) {
                                // If we were accumulating reasoning but never hit the threshold, discard buffer
                                logger.info(`[OC:Event] ⏭️ Discarded tiny reasoning buffer (${reasoningBuffer.length}ch)`);
                                reasoningBuffer = "";
                                reasoningCharCount = 0;
                            }
                            break;
                        }

                        case "tool": {
                            // If reasoning is open, close the think block before the tool
                            // entry enters the timeline (otherwise the vibes tag would appear
                            // inside the <think> block in the rendered output)
                            if (isCurrentlyReasoning) {
                                callbacks.onTextDelta(`\n</think>\n`);
                                // Keep isCurrentlyReasoning = true so the NEXT reasoning
                                // delta will seamlessly reopen <think> without creating a
                                // new Pensamiento badge — we just need a fresh text entry.
                                isCurrentlyReasoning = false;
                                thinkNeedsReopen = true;
                                logger.info(`[OC:Event] 🧠 PAUSED </think> — tool event`);
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
                            agentHasStartedStep = true;
                            callbacks.onStepStart();
                            logger.info(`[OC:Event] Step started`);
                            sendUpdate();
                            break;

                        case "step-finish":
                            // DON'T close </think> here — keep it open so consecutive
                            // reasoning blocks merge into a single Pensamiento.
                            // Think only closes when a "text" part starts (above).
                            if (!isCurrentlyReasoning && reasoningBuffer.length > 0) {
                                // Discard tiny reasoning if never opened
                                logger.info(`[OC:Event] ⏭️ Discarded tiny reasoning buffer on step finish (${reasoningBuffer.length}ch)`);
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
                                logger.info(`[OC:Event] Step finished (tokens: in=${stepIn}, out=${stepOut}, reasoning=${stepReasoning}, cacheRead=${stepCacheRead}, cacheCreation=${stepCacheCreation}, raw=${JSON.stringify(part.tokens)})`);
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
                        // The LLM generates <vibes-read>, <vibes-write>, etc. in its
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
                            logger.info(`[OC:Event] 🧠 REOPENED <think> after tool`);
                        } else if (!isCurrentlyReasoning) {
                            // Buffer the reasoning until it's comfortably over 20 chars
                            // This prevents emitting empty `<think>` tags for short 10-char blobs or "[REDACTED]"
                            reasoningBuffer += cleanDelta;
                            if (reasoningBuffer.length > 20) {
                                isCurrentlyReasoning = true;
                                callbacks.onTextDelta(`\n<think>\n${reasoningBuffer}`);
                                logger.info(`[OC:Event] 🧠 OPENED <think> (buffered ${reasoningBuffer.length}ch)`);
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
                    if (!agentHasStartedStep) {
                        // Watcher sync event — the agent hasn't started yet, ignore
                        logger.info(`[OC:Event] 🚫 Skipping premature file.edited (watcher sync): ${props.file}`);
                        break;
                    }
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

                // OpenCode agent todo list updates — forward to renderer UI
                case "todo.updated": {
                    const todos = props.todos;
                    if (Array.isArray(todos)) {
                        const mapped = todos.map((t: any) => ({
                            id: t.id || String(Math.random()),
                            content: t.content || "",
                            status: t.status === "completed" ? "completed"
                                : t.status === "in_progress" ? "in_progress"
                                : "pending",
                        }));
                        safeSend(event.sender, "agent-tool:todos-update", {
                            chatId,
                            todos: mapped,
                        });
                        logger.info(`[OC:Event] 📋 Todo update: ${mapped.length} items`);
                    }
                    break;
                }

                case "session.status": {
                    const status = props.status;
                    if (status?.type === "idle") {
                        logger.info("[OC:Event] Session idle — response complete");
                    } else if (status?.type === "busy") {
                        logger.info("[OC:Event] Session busy...");
                    }
                    break;
                }

                case "session.idle": {
                    // Close any lingering open think block before exiting
                    if (isCurrentlyReasoning) {
                        isCurrentlyReasoning = false;
                        callbacks.onTextDelta(`\n</think>\n\n`);
                        logger.info(`[OC:Event] 🧠 CLOSED </think> — session idle`);
                    }
                    logger.info(`[OC:Event] Session idle event received. Total events: ${eventCount}`);
                    return;
                }

                // Session errors — log full details for debugging custom agents
                case "session.error": {
                    const errorMsg = props.error || props.message || JSON.stringify(props);
                    logger.error(`[OC:Event] ❌ SESSION ERROR: ${errorMsg}`);
                    break;
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
                            logger.info(`[OC:Event] Auto-approved permission: always for ${permName}`);
                        }
                    } catch (e: any) {
                        logger.error(`[OC:Event] Error al auto-responder permiso: ${e.message}`);
                    }
                    break;
                }

                default:
                    if (eventCount <= 20) {
                        logger.info(`[OC:Event] Unhandled event type: ${evt.type}`);
                    }
                    break;
            }
        }
    } catch (error: any) {
        if (!abortController.signal.aborted) {
            logger.error("[OC:Event] Event stream error:", error.message);
        }
    }

    // Safety: close any lingering open think block if stream ended unexpectedly
    if (isCurrentlyReasoning) {
        isCurrentlyReasoning = false;
        callbacks.onTextDelta(`\n</think>\n\n`);
        logger.info(`[OC:Event] 🧠 CLOSED </think> — stream ended`);
    }
}

/**
 * Map OpenCode tool names → vibes tag names for consistent UI rendering.
 * The VibesMarkdownParser will intercept these tags and render the
 * collapsible icon badges that the user expects.
 */
function mapToolToVibesTag(tool: string): string {
    const map: Record<string, string> = {
        write: "vibes-write",
        read: "vibes-read",
        edit: "vibes-search-replace",
        bash: "vibes-run-command",
        glob: "vibes-list-files",
        grep: "vibes-grep",
        fetch: "vibes-web-crawl",
        patch: "vibes-patch",
        todowrite: "vibes-write",
        todorewrite: "vibes-write",
        codesearch: "vibes-code-search",
        webfetch: "vibes-web-crawl",
        websearch: "vibes-web-crawl",
        lsp: "vibes-status",
    };
    return map[tool] || "vibes-mcp-tool-call";
}

function buildVibesTag(tool: string, detail: string, content: string): string {
    const vibesTag = mapToolToVibesTag(tool);

    switch (vibesTag) {
        case "vibes-write":
            return `<vibes-write path="${escapeAttr(detail)}" description="">${content}</vibes-write>`;
        case "vibes-search-replace":
            return `<vibes-search-replace path="${escapeAttr(detail)}" description="">${content}</vibes-search-replace>`;
        case "vibes-read":
            return `<vibes-read path="${escapeAttr(detail)}">${content}</vibes-read>`;
        case "vibes-grep":
            return `<vibes-grep query="${escapeAttr(detail)}">${content}</vibes-grep>`;
        case "vibes-code-search":
            return `<vibes-code-search query="${escapeAttr(detail)}">${content}</vibes-code-search>`;
        case "vibes-run-command":
            return `<vibes-run-command cmd="${escapeAttr(detail)}">${content}</vibes-run-command>`;
        case "vibes-list-files":
            return `<vibes-list-files directory="${escapeAttr(detail)}">${content}</vibes-list-files>`;
        case "vibes-web-crawl":
            return `<vibes-web-crawl url="${escapeAttr(detail)}">${content}</vibes-web-crawl>`;
        case "vibes-patch":
            return `<vibes-patch path="${escapeAttr(detail)}">${content}</vibes-patch>`;
        case "vibes-status":
            return `<vibes-status title="${escapeAttr(detail)}">${content}</vibes-status>`;
        case "vibes-mcp-tool-call":
        default:
            return `<vibes-mcp-tool-call tool="${escapeAttr(tool)}">${content}</vibes-mcp-tool-call>`;
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
            content += buildVibesTag(entry.tool, entry.detail, tagContent) + "\n";
        } else {
            content += cleanResponseText(entry.text);
        }
    }

    // Active tool indicator (pending tools shown as vibes tags with pending state)
    const activeEdits = Array.from(toolsActive.values()).filter(
        t => (t.status === "running" || t.status === "pending") &&
            (t.tool === "edit" || t.tool === "write" || t.tool === "read" || t.tool === "webfetch" || t.tool === "websearch")
    );
    for (const t of activeEdits) {
        const tag = mapToolToVibesTag(t.tool);
        const attrName = tag === "vibes-web-crawl" ? "url" : "path";
        content += `<${tag} ${attrName}="${escapeAttr(t.detail || "...")}">`;  // unclosed = pending
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
            content += buildVibesTag(entry.tool, entry.detail, tagContent) + "\n";
        } else {
            const cleaned = cleanResponseText(entry.text);
            content += cleaned;
        }
    }

    // Add file edits as vibes-write tags (for files tracked via file.edited events
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
                content += `<vibes-write path="${escapeAttr(file)}" description=""></vibes-write>\n`;
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
    const lastAssistant = currentMessages.filter(m => m.role === "assistant").pop();
    logger.info(`[OC:sendChunk] chatId=${chatId} msgs=${currentMessages.length} lastAssistant.id=${lastAssistant?.id} content=${lastAssistant?.content?.length ?? 0}ch`);
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
