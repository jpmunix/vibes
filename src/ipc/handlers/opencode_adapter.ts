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
import { type IpcMainInvokeEvent, BrowserWindow } from "electron";
import { readSettings, writeSettings, decrypt } from "../../main/settings";
import { getVibesAppPath } from "../../paths/paths";
import { safeSend } from "../utils/safe_sender";
import type { ChatStreamParams } from "@/ipc/types";
import * as path from "node:path";
import { getRemoteDb } from "../../db/remote";
import * as remoteSchema from "../../db/remote-schema";
import { eq, and } from "drizzle-orm";
import { composeModelWithVariant } from "../shared/model_variants";
import { McpServer } from "../types/mcp";

const logger = log.scope("opencode_adapter");

// ============================================================================
// Singleton: OpenCode server + client instance
// ============================================================================

let opencodeInstance: Awaited<ReturnType<typeof createOpencode>> | null = null;
let clientInstance: ReturnType<typeof createOpencodeClient> | null = null;
let serverUrl: string | null = null;

// Track the last project directory used — needed for question reply routing
let lastProjectDir: string | null = null;

/** Expose the OpenCode client singleton for use by memory bootstrap (Phase 2 Explore). */
export function getOpenCodeClientInstance() {
    return clientInstance;
}

// Active stream text injector — allows the question reply handler to inject
// the user's answer directly into the live chat stream content.
let activeTextInjector: ((text: string) => void) | null = null;

// ── Permission response infrastructure ──
// Pending permission resolvers: Map<permissionRequestId, resolve function>
const pendingPermissionResolvers = new Map<string, (response: string) => void>();

/**
 * Default permission values for each tool.
 * MUST be kept in sync with TOOLS[].defaultValue in OpenCodePermissionsSettings.tsx.
 * Single source of truth for the backend — the UI component has its own copy
 * but they MUST agree to avoid phantom settings (user sees one value, backend uses another).
 */
const PERMISSION_DEFAULTS: Record<string, "allow" | "ask" | "deny"> = {
    edit: "ask",
    read: "allow",   // Read ops are non-destructive — always allowed
    bash: "allow",
    webfetch: "ask",
    websearch: "ask",
    lsp: "allow",
};

/**
 * Build the OpenCode `permission` config block from user settings.
 * Falls back to PERMISSION_DEFAULTS if no settings are configured.
 */
function buildPermissionConfig(settings: any) {
    const perms = settings?.openCodePermissions2;

    // Build bash object with granular rules.
    // OpenCode pattern matching: last matching rule wins → put "*" first, specifics after.
    //
    // Safe-command allowlist: these read-only/inspection commands are always allowed
    // even when the user sets bash to "ask". This prevents frustration from being
    // asked about harmless commands, which would lead the user to just allow everything.
    const bashRules: Record<string, string> = {
        "*": perms?.bash ?? "allow",
        // ── Read-only / inspection — always safe ──
        "ls *": "allow",
        "cat *": "allow",
        "head *": "allow",
        "tail *": "allow",
        "grep *": "allow",
        "rg *": "allow",
        "find *": "allow",
        "wc *": "allow",
        "pwd": "allow",
        "echo *": "allow",
        "which *": "allow",
        "type *": "allow",
        "file *": "allow",
        "stat *": "allow",
        "du *": "allow",
        "df *": "allow",
        "env": "allow",
        "printenv *": "allow",
        "node --version*": "allow",
        "node -e *": "allow",
        "npm list*": "allow",
        "npm ls*": "allow",
        "npm --version*": "allow",
        "npx --version*": "allow",
        "git status*": "allow",
        "git log*": "allow",
        "git diff*": "allow",
        "git show*": "allow",
        "git branch": "allow",       // list branches (no args = read-only)
        "git branch -a*": "allow",   // list all branches
        "git branch -v*": "allow",   // list with verbose
        "git remote*": "allow",
        "git stash list*": "allow",
        // ── Filesystem — dangerous ──
        "rm *": perms?.bashRm ?? "ask",
        // ── Git — staging ──
        "git add *": perms?.gitAdd ?? "ask",
        // ── Git — repo-local destructive ──
        "git commit *": perms?.gitCommit ?? perms?.bashGitCommit ?? "deny",
        "git reset *": perms?.gitReset ?? "ask",
        "git checkout *": perms?.gitCheckout ?? "ask",
        "git restore *": perms?.gitRestore ?? "ask",
        "git clean *": perms?.gitClean ?? "ask",
        "git rebase *": perms?.gitRebase ?? "ask",
        "git merge --abort*": perms?.gitMergeAbort ?? "ask",
        "git stash drop*": perms?.gitStashDrop ?? "ask",
        "git branch -D *": perms?.gitBranchDelete ?? "ask",
        "git branch -d *": perms?.gitBranchDelete ?? "ask",
        "git branch --delete *": perms?.gitBranchDelete ?? "ask",
        "git cherry-pick --abort*": perms?.gitCherryPickAbort ?? "ask",
        // ── Git — remote destructive (deny by default) ──
        "git push *": perms?.gitPush ?? perms?.bashGitPush ?? "deny",
        "git push --force*": perms?.gitPushForce ?? "deny",
        "git push -f *": perms?.gitPushForce ?? "deny",
        "git push --delete *": perms?.gitPushDelete ?? "deny",
    };

    // Append user custom rules (last → highest priority)
    for (const rule of perms?.bashCustomRules ?? []) {
        bashRules[rule.pattern] = rule.permission;
    }

    return {
        edit: perms?.edit ?? PERMISSION_DEFAULTS.edit,
        read: "allow",    // Read ops (read, glob, grep) are always allowed — non-destructive
        glob: "allow",
        grep: "allow",
        bash: bashRules,
        webfetch: perms?.webfetch ?? PERMISSION_DEFAULTS.webfetch,
        websearch: perms?.websearch ?? PERMISSION_DEFAULTS.websearch,
        lsp: perms?.lsp ?? PERMISSION_DEFAULTS.lsp,
        task: "allow",        // Subagent launch
        question: "allow",
        external_directory: "ask",
    };
}

/**
 * Resolve the effective permission for a specific tool + input.
 * For bash, checks granular sub-rules. For other tools, returns the global pill.
 */
function resolveToolPermission(
    toolName: string,
    toolInput: string,
    permsConfig?: any,
): "allow" | "ask" | "deny" {
    if (!permsConfig) return "allow"; // No config → default allow (backwards compat)

    // Map OpenCode tool names to our settings keys.
    // glob/grep are separate tools in OpenCode but follow the user's "read" pill.
    const TOOL_ALIAS: Record<string, string> = {
        glob: "read",
        grep: "read",
    };
    const settingsKey = TOOL_ALIAS[toolName] ?? toolName;

    const value = permsConfig[settingsKey as keyof typeof permsConfig];

    // For tools with a simple pill (edit, read, webfetch, websearch, lsp)
    if (value === "allow" || value === "ask" || value === "deny") {
        return value;
    }

    // If value is something unexpected (e.g. stale "once"), default to "ask" (safe fallback)
    return PERMISSION_DEFAULTS[settingsKey] ?? "ask";
}

/**
 * Wait for the renderer to send a permission response via IPC.
 * Returns the user's choice: "once" | "always" | "reject".
 * Times out after `timeoutMs` and auto-rejects.
 */
function waitForPermissionResponse(requestId: string, timeoutMs: number): Promise<string> {
    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            pendingPermissionResolvers.delete(requestId);
            logger.warn(`[OC:Permission] Timeout for ${requestId} — auto-rejecting`);
            resolve("reject");
        }, timeoutMs);

        pendingPermissionResolvers.set(requestId, (response: string) => {
            clearTimeout(timer);
            pendingPermissionResolvers.delete(requestId);
            resolve(response);
        });
    });
}

/**
 * Persist a permission choice from the chat banner into user settings.
 *
 * Performs the **full settings sync pipeline** (same as the UI settings path):
 *   1. writeSettings() → local disk + in-memory cache.
 *   2. Broadcast "settings:updated-from-backend" → renderer atom refreshes immediately.
 *   3. Sync to Bunny DB → survives the remote-merge in getUserSettings.
 *
 * ⚠️  We cannot use the renderer's IPC `setUserSettings` handler because this
 * function runs in the main process during an active agent session. Instead we
 * replicate the same 3 steps that `setUserSettings` does (settings_handlers.ts).
 *
 * For NON-bash tools (edit, read, webfetch, etc.): sets the global pill directly.
 * For BASH: adds a granular custom rule (e.g. `"ls *": "allow"`) instead of
 * touching the global bash pill. This prevents a harmless `ls` approval from
 * accidentally enabling `rm`.
 *
 * @param toolName       - OpenCode tool name ("bash", "edit", "read", etc.)
 * @param value          - "allow" or "deny"
 * @param alwaysPatterns - OpenCode's suggested patterns from `props.always`
 * @param commandInput   - The raw command/input that triggered the permission
 */
async function persistPermissionToSettings(
    toolName: string,
    value: "allow" | "deny",
    alwaysPatterns: string[],
    commandInput: string,
) {
    try {
        const current = readSettings();
        const perms = { ...(current.openCodePermissions2 || {}) };

        if (toolName === "bash") {
            // ── Bash: add a specific custom rule, never touch the global pill ──
            // Priority: use OpenCode's suggested `always` patterns if available,
            // otherwise extract the command prefix (first word) + wildcard.
            const rules: Array<{ id: string; pattern: string; permission: "ask" | "allow" | "deny" }> =
                Array.isArray(perms.bashCustomRules) ? [...perms.bashCustomRules as any] : [];

            const patternsToAdd: string[] = [];

            if (alwaysPatterns.length > 0) {
                // Use OpenCode's own suggestions (e.g. ["ls *", "git status*"])
                for (const p of alwaysPatterns) {
                    if (!rules.some((r) => r.pattern === p)) {
                        patternsToAdd.push(p);
                    }
                }
            } else if (commandInput.trim()) {
                // Fallback: extract first word → "command *"
                const firstWord = commandInput.trim().split(/\s+/)[0];
                const pattern = `${firstWord} *`;
                if (!rules.some((r) => r.pattern === pattern)) {
                    patternsToAdd.push(pattern);
                }
            }

            for (const pattern of patternsToAdd) {
                rules.push({
                    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    pattern,
                    permission: value as "ask" | "allow" | "deny",
                });
                logger.info(`[OC:Permission] Added bash custom rule: "${pattern}" → ${value}`);
            }

            perms.bashCustomRules = rules;
        } else {
            // ── Non-bash: set the global tool pill ──
            const TOOL_TO_KEY: Record<string, string> = {
                edit: "edit", read: "read", glob: "read", grep: "read",
                webfetch: "webfetch", websearch: "websearch", lsp: "lsp",
            };
            const key = TOOL_TO_KEY[toolName];
            if (!key) {
                logger.warn(`[OC:Permission] Unknown tool "${toolName}" — cannot persist`);
                return;
            }
            (perms as any)[key] = value;
            logger.info(`[OC:Permission] Persisted ${toolName} → ${value} (global pill)`);
        }

        writeSettings({ ...current, openCodePermissions2: perms });
        const updated = readSettings();
        logger.info(`[OC:Permission] Saved to settings.json`);

        // ── Notify renderer so the UI atom refreshes immediately ──
        for (const win of BrowserWindow.getAllWindows()) {
            if (!win.isDestroyed() && win.webContents) {
                safeSend(win.webContents, "settings:updated-from-backend", updated);
            }
        }
        logger.info(`[OC:Permission] Broadcasted to renderer`);

        // ── Sync to Bunny DB so getUserSettings merge doesn't overwrite ──
        try {
            const userId = updated.userId;
            if (userId) {
                const db = getRemoteDb();
                const { userId: _u, sessionToken: _s, ...syncable } = updated;
                const settingsJson = JSON.stringify(syncable);
                const existing = await db.query.userSettings.findFirst({
                    where: eq(remoteSchema.userSettings.userId, userId),
                });
                if (existing) {
                    await db.update(remoteSchema.userSettings)
                        .set({ settingsJson, updatedAt: new Date() })
                        .where(eq(remoteSchema.userSettings.userId, userId));
                } else {
                    await db.insert(remoteSchema.userSettings).values({
                        userId, settingsJson, updatedAt: new Date(),
                    });
                }
                logger.info(`[OC:Permission] Synced to Bunny DB`);
            }
        } catch (syncErr: any) {
            logger.warn(`[OC:Permission] Bunny DB sync failed (non-fatal): ${syncErr.message}`);
        }
    } catch (e: any) {
        logger.error(`[OC:Permission] Failed to persist setting: ${e.message}`);
    }
}

/**
 * Reply to a permission request via direct HTTP to the documented server endpoint:
 *   POST /session/:id/permissions/:permissionID?directory=...
 *   body: { response: "once"|"always"|"reject" }
 *
 * Uses raw fetch (same pattern as questionReply) to ensure the `directory`
 * query param is always included — the v1 SDK call was missing it, which
 * caused the server to silently fail to route the reply to the correct instance.
 */
async function replyToPermission(
    requestId: string,
    response: "once" | "always" | "reject",
    sessionId: string,
): Promise<boolean> {
    if (!serverUrl) {
        logger.error(`[OC:Permission] ❌ No serverUrl — cannot reply`);
        return false;
    }

    const dirParam = lastProjectDir ? `?directory=${encodeURIComponent(lastProjectDir)}` : "";
    const url = `${serverUrl}/session/${encodeURIComponent(sessionId)}/permissions/${encodeURIComponent(requestId)}${dirParam}`;

    try {
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ response }),
        });

        const text = await res.text();

        if (!res.ok) {
            logger.error(`[OC:Permission] ❌ HTTP ${res.status} for ${response}/${requestId}: ${text}`);
            return false;
        }

        logger.info(`[OC:Permission] ✅ ${response} for ${requestId} — server: ${text}`);
        return true;
    } catch (e: any) {
        logger.error(`[OC:Permission] ❌ Fetch error for ${requestId}: ${e.message}`);
        return false;
    }
}

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
    selectedModelVariant?: string;
    standardModeModel?: string;
    reasoningEffort?: string;
    textVerbosity?: string;
}): Promise<void> {
    if (!clientInstance) return; // server not started yet

    try {
        const body: Record<string, any> = {};

        if (changes.selectedModel) {
            const providerID = mapProviderForOpenCode(changes.selectedModel);
            // Apply variant suffix if set (variant is ignored for free models)
            const settings = readSettings();
            const variant = changes.selectedModelVariant ?? settings.selectedModelVariant ?? "";
            const modelID = composeModelWithVariant(sanitizeModelName(changes.selectedModel.name), variant);
            body.model = `${providerID}/${modelID}`;
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
 * Hot update OpenCode permission config without restarting.
 * Called when the user changes permission pills in Ajustes → Agente.
 */
export async function updateOpenCodePermissions(settings: any): Promise<void> {
    if (!clientInstance) return;
    try {
        const permission = buildPermissionConfig(settings);
        await clientInstance.config.update({ body: { permission } as any });
        logger.info(`[OpenCode] Permission config updated in-place: ${JSON.stringify(permission)}`);
    } catch (error: any) {
        logger.warn(`[OpenCode] config.update(permission) failed: ${error.message}`);
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
 * Sanitize MCP server args to ensure they are always a proper string[].
 *
 * The DB can store args in malformed states:
 *   - null / undefined            → []
 *   - A single concatenated string → split by whitespace: "-y@pkg" → ["-y", "@pkg"]
 *   - A mixed array with strings   → each element split and flattened
 *
 * A malformed command like `["npx", "-y@modelcontextprotocol/server-foo"]` causes
 * npx to receive the package name as part of the -y flag, making it hang
 * indefinitely and blocking the entire OpenCode session startup.
 */
function sanitizeMcpArgs(args: string[] | string | null | undefined): string[] {
    if (!args) return [];
    // If already a proper array, split any elements that contain spaces
    if (Array.isArray(args)) {
        return args.flatMap(arg =>
            typeof arg === "string" && arg.includes(" ") ? arg.split(/\s+/) : [arg]
        ).filter(Boolean);
    }
    // Scalar string — split by whitespace
    if (typeof args === "string") {
        return args.split(/\s+/).filter(Boolean);
    }
    return [];
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
                                await replyToPermission(reqId, "always", sessionId);
                                logger.info(`[VisualEdit] Auto-approved permission: ${props.permission || props.type}`);
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
                    modelID: sanitizeModelName(model.name),
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

    // Clear any stale keys from OpenCode's own auth.json so it doesn't override
    // the keys we provide via config.json {env:...} substitution.
    // This protects existing users who upgrade and still have an old/deleted key cached.
    clearStaleOpenCodeAuth(envVars);

    // Set API keys in the process environment before creating the instance
    for (const [key, value] of Object.entries(envVars)) {
        process.env[key] = value;
    }

    const settings = readSettings();
    const model = settings.selectedModel;

    // Determine provider/model mapping for opencode
    const providerID = mapProviderForOpenCode(model);
    // Apply variant suffix (ignored for free models)
    const modelID = composeModelWithVariant(sanitizeModelName(model.name), settings.selectedModelVariant ?? "");

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

        // ── Morph Patch Engine: deploy/undeploy custom tool overrides ─────
        // Admin-only feature. Non-admins always get built-in tools.
        try {
            const { deployMorphTools, removeMorphTools } = await import("../utils/morph_patcher");
            const { isAdmin } = await import("../../lib/admin");
            const morphEnabled = isAdmin((settings as any).userId) && (settings as any).enableMorphPatchTool === true;

            if (morphEnabled) {
                deployMorphTools();
                logger.info(`[OpenCode] 🧬 Morph Patch Engine ENABLED — tools in ~/.config/opencode/tools/`);
            } else {
                removeMorphTools();
                logger.info("[OpenCode] 🧬 Morph Patch Engine DISABLED — using built-in tools");
            }
        } catch (e: any) {
            logger.warn(`[OpenCode] Morph tools deployment failed (non-fatal): ${e.message}`);
        }

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

        // Dynamic instructions are written to docs/vibes-context.md per-request
        // and registered in the project's opencode.json (same pattern as DESIGN.md).
        const config = {
                provider: {
                    [providerID]: (providerID === "openrouter" ? {
                            name: "openrouter",
                            options: {
                                // Explicitly bind the API key from process.env so OpenCode uses
                                // the key configured in Vibes instead of any stale auth.json file.
                                apiKey: "{env:OPENROUTER_API_KEY}",
                            },
                        } : providerID === "anthropic" ? {
                            options: { apiKey: "{env:ANTHROPIC_API_KEY}" },
                        } : providerID === "google" ? {
                            options: { apiKey: "{env:GEMINI_API_KEY}" },
                        } : providerID === "openai" ? {
                            options: { apiKey: "{env:OPENAI_API_KEY}" },
                        } : {}),
                },
                model: `${providerID}/${modelID}`,
                // Use the cheap/fast standard model for lightweight tasks (titles, summaries)
                ...(settings.standardModeModel ? {
                    small_model: `${providerID}/${sanitizeModelName(settings.standardModeModel)}`,
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
                // Permissions: built from user settings
                permission: buildPermissionConfig(settings),
                // Always-on context compaction (documented at opencode.ai/docs/configuration)
                // `reserved` guarantees a 15k-token output buffer even at context-full — prevents
                // the model stalling when context fills up mid-session (key fix for slow responses).
                ...({ compaction: { auto: true, prune: true, reserved: 15000 } } as any),
                // LSP servers (TypeScript, ESLint, etc.) are enabled by default in OpenCode
                // when supported file extensions are detected. No explicit config needed.
                // Optimize I/O by disabling OpenCode's snapshot system, which is too slow on large repos
                ...({ snapshot: false } as any),
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
                // Context7 is a mandatory built-in MCP server — always present
                // regardless of user configuration. Used for dynamic scaffold
                // generation and up-to-date documentation lookup.
                mcp: {
                    "context7": {
                        type: "remote" as const,
                        url: "https://mcp.context7.com/mcp",
                        enabled: true,
                        headers: { "CONTEXT7_API_KEY": "ctx7sk-8b4a1d13-1748-4c4e-8861-2ec17c76b42e" },
                    },
                    ...(buildMcpConfig(enabledServers) || {}),
                },
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

            const actual = env.OPENROUTER_API_KEY || "";
            const masked = actual.length > 20 ? `${actual.slice(0, 15)}...${actual.slice(-4)}` : "***";
            logger.info(`[OpenCode] Using OpenRouter key: "${selectedKey.alias || 'unnamed'}" (${masked})`);
        }
    }

    const keyNames = Object.keys(env);
    logger.info(`[OpenCode] Available API keys: ${keyNames.join(", ") || "none"}`);

    return env;
}

/**
 * Ensures OpenCode's own auth.json does not contain stale API keys that would
 * override the keys configured in Vibes.
 *
 * Strategy: read auth.json (if it exists), update/overwrite only the providers
 * we manage (openrouter, openai, anthropic, google, groq) with the current key
 * from Vibes. If Vibes has no key for a provider, that provider entry is removed
 * from auth.json so OpenCode can't fall back to a stale credential.
 *
 * This is a safety net for users who upgrade from a version that stored API keys
 * via `opencode auth login`. It is a silent no-op if the file does not exist.
 */
function clearStaleOpenCodeAuth(env: Record<string, string>): void {
    try {
        const fs = require("fs");
        const os = require("os");
        const home = os.homedir();

        // Resolve auth.json path per platform (same logic OpenCode uses internally)
        let authDir: string;
        switch (process.platform) {
            case "win32":
                authDir = path.join(process.env.APPDATA || path.join(home, "AppData", "Roaming"), "opencode");
                break;
            case "darwin":
                authDir = path.join(home, "Library", "Application Support", "opencode");
                break;
            default:
                authDir = path.join(process.env.XDG_DATA_HOME || path.join(home, ".local", "share"), "opencode");
        }

        const authFile = path.join(authDir, "auth.json");
        if (!fs.existsSync(authFile)) return; // New user — nothing to clean

        let auth: Record<string, any> = {};
        try {
            auth = JSON.parse(fs.readFileSync(authFile, "utf-8"));
        } catch {
            return; // Corrupt file — leave it alone
        }

        // Map from auth.json provider key → the env var that carries the current key
        const providerEnvMap: Record<string, string> = {
            openrouter: "OPENROUTER_API_KEY",
            openai: "OPENAI_API_KEY",
            anthropic: "ANTHROPIC_API_KEY",
            google: "GEMINI_API_KEY",
            groq: "GROQ_API_KEY",
        };

        let changed = false;
        for (const [provider, envVar] of Object.entries(providerEnvMap)) {
            const currentKey = env[envVar];
            if (currentKey) {
                // We have a key for this provider — overwrite with the correct one
                if (auth[provider]?.key !== currentKey) {
                    auth[provider] = { type: "api", key: currentKey };
                    changed = true;
                }
            } else if (auth[provider]) {
                // We have NO key configured in Vibes but auth.json has one — remove it
                delete auth[provider];
                changed = true;
            }
        }

        if (changed) {
            fs.writeFileSync(authFile, JSON.stringify(auth, null, 2), "utf-8");
            logger.info(`[OpenCode] Cleaned stale auth.json (providers: ${Object.keys(auth).join(", ") || "none"})`);
        }
    } catch (e: any) {
        // Non-fatal — worst case OpenCode uses the stale auth.json key, but config.json
        // {env:...} substitution should still override it for providers we explicitly configure.
        logger.warn(`[OpenCode] Could not clean auth.json: ${e.message}`);
    }
}


// ============================================================================
// Model/provider mapping
// ============================================================================

/**
 * Strip trailing dots, whitespace, and other stray characters from model names.
 * Defensive measure against data contamination from remote settings sync or
 * catalogue parsing artifacts (e.g. "amazon/nova-lite-v1." → "amazon/nova-lite-v1").
 */
function sanitizeModelName(name: string): string {
    return name.replace(/[\s.]+$/, '');
}

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
        /**
         * Prior user messages to inject into the OpenCode session BEFORE the main prompt.
         * Each is sent with `noReply: true` so OpenCode records them in the conversation
         * history without generating an AI response. This is the native way to "batch"
         * multiple user messages typed while the previous stream was running.
         */
        priorMessages?: { prompt: string; attachments?: { name: string; type: string; data: string; attachmentType: string }[] }[];
    },
): Promise<{ fullResponse: string; success: boolean; inputTokens: number; outputTokens: number; reasoningTokens: number; cachedTokens: number; costUsd: number | null }> {
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


    // ── Append dynamic instructions to AGENTS.md (replaces old SPECS.md) ──
    // We append a delimited section at the end of the project's AGENTS.md.
    // OpenCode reads AGENTS.md natively — no opencode.json registration needed.
    {
        const fs = require("fs");
        const instrContent = (options.contextInstructions && options.contextInstructions.length > 0)
            ? options.contextInstructions.join("\n\n")
            : "";

        const VIBES_START = "<!-- VIBES:CONTEXT:START -->";
        const VIBES_END = "<!-- VIBES:CONTEXT:END -->";
        const agentsMdPath = path.join(projectDir, "AGENTS.md");

        try {
            // 1. Read existing AGENTS.md (or start empty)
            let existing = "";
            if (fs.existsSync(agentsMdPath)) {
                existing = fs.readFileSync(agentsMdPath, "utf-8");
            }

            // 2. Strip old Vibes section if present
            const startIdx = existing.indexOf(VIBES_START);
            const endIdx = existing.indexOf(VIBES_END);
            let baseContent = existing;
            if (startIdx !== -1 && endIdx !== -1) {
                baseContent = existing.substring(0, startIdx).trimEnd()
                    + existing.substring(endIdx + VIBES_END.length);
            }

            // 3. Build new AGENTS.md = original content + Vibes section
            const vibesSection = instrContent
                ? `\n\n${VIBES_START}\n${instrContent}\n${VIBES_END}\n`
                : "";
            const finalContent = baseContent.trimEnd() + vibesSection;

            fs.writeFileSync(agentsMdPath, finalContent, "utf-8");
            logger.info(`${LP} 📋 Context written to AGENTS.md (${instrContent.length} chars, ${(options.contextInstructions || []).length} blocks)`);

            // 4. Cleanup: delete stale docs/SPECS.md if it exists
            const specsPath = path.join(projectDir, "docs", "SPECS.md");
            if (fs.existsSync(specsPath)) {
                fs.unlinkSync(specsPath);
                logger.info(`${LP} 🗑️ Deleted stale docs/SPECS.md`);
            }

            // 5. Remove docs/SPECS.md from opencode.json instructions[] if registered
            try {
                const ocJsonPath = path.join(projectDir, "opencode.json");
                if (fs.existsSync(ocJsonPath)) {
                    const ocJson = JSON.parse(fs.readFileSync(ocJsonPath, "utf-8"));
                    if (Array.isArray(ocJson.instructions) && ocJson.instructions.includes("docs/SPECS.md")) {
                        ocJson.instructions = ocJson.instructions.filter((i: string) => i !== "docs/SPECS.md");
                        fs.writeFileSync(ocJsonPath, JSON.stringify(ocJson, null, 2), "utf-8");
                        logger.info(`${LP} 🗑️ Removed docs/SPECS.md from opencode.json instructions`);
                    }
                }
            } catch { /* ignore opencode.json cleanup errors */ }

        } catch (ctxErr: any) {
            logger.warn(`${LP} Failed to write AGENTS.md context: ${ctxErr.message}`);
        }
    }

    let client: ReturnType<typeof createOpencodeClient>;
    try {
        const result = await getOpenCodeClient(projectDir);
        client = result.client;
    } catch (error: any) {
        const errorMsg = `❌ Error al iniciar OpenCode: ${error.message}`;
        logger.error(`${LP} ${errorMsg}`);
        return { fullResponse: errorMsg, success: false, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cachedTokens: 0, costUsd: null };
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

                        // Fire-and-forget — init runs in background while the user's prompt proceeds.
                        // AGENTS.md will appear on disk once the server finishes; the agent works
                        // fine without it (just less context for the very first message).
                        const initSettings = readSettings();
                        const initModel = initSettings.selectedModel;
                        const initProviderID = mapProviderForOpenCode(initModel);

                        // Build init body — messageID must start with "msg" (server validates format)
                        const initBody: { providerID: string; modelID: string; messageID: string } = {
                            providerID: initProviderID,
                            modelID: sanitizeModelName(initModel.name),
                            messageID: `msg_init_${Date.now()}`,
                        };

                        logger.info(`${LP} 🔧 Running init (lazy) with model ${initProviderID}/${initModel.name} | dir=${projectDir}`);
                        client.session.init({
                            path: { id: sessionId },
                            query: { directory: projectDir },
                            body: initBody,
                        }).then((initResult: any) => {
                            const httpStatus = initResult?.response?.status ?? initResult?.status ?? "unknown";
                            logger.info(`${LP} ✅ Init completed (data: ${JSON.stringify(initResult.data)}, httpStatus: ${httpStatus})`);

                            if (initResult.error) {
                                logger.error(`${LP} ❌ Init returned error from server: ${JSON.stringify(initResult.error)}`);
                            }

                            if (initResult.data === undefined || initResult.data === null) {
                                const debugInfo = {
                                    hasResponse: !!initResult?.response,
                                    responseStatus: httpStatus,
                                    responseStatusText: initResult?.response?.statusText,
                                    error: initResult.error,
                                    keys: Object.keys(initResult),
                                };
                                logger.warn(`${LP} ⚠️ Init .data is ${initResult.data} — full debug: ${JSON.stringify(debugInfo)}`);
                            }

                            // Verify AGENTS.md was actually created
                            const createdPath = agentsMdPaths.find(p => fs.existsSync(p));
                            if (createdPath) {
                                logger.info(`${LP} 📄 AGENTS.md created at: ${createdPath}`);
                            } else {
                                logger.warn(`${LP} ⚠️ Init returned httpStatus=${httpStatus} but AGENTS.md not found on disk`);
                            }
                        }).catch((initError: any) => {
                            logger.warn(`${LP} ❌ Init failed (non-fatal): ${initError.message}`);
                            logger.warn(`${LP}    Full error:`, JSON.stringify({
                                status: initError.status || initError.statusCode,
                                body: initError.body || initError.response?.body,
                                data: initError.data,
                                stack: initError.stack?.split('\n').slice(0, 3).join(' → '),
                            }));
                        });

                        // Clear the analyzing status from the UI immediately (init continues in background)
                        sendChunk(event, req.chatId, chatMessages, "");
                    } else {
                        logger.info(`${LP} AGENTS.md already exists, skipping init`);
                    }
                }
            }

        } catch (error: any) {
            const errorMsg = `❌ Error al crear sesión: ${error.message}`;
            logger.error(`${LP} ${errorMsg}`);
            return { fullResponse: errorMsg, success: false, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, cachedTokens: 0, costUsd: null };
        }
    }

    // ── Memory Bootstrap (cold start, fire-and-forget) ──
    // Runs on EVERY prompt but guarded by needsBootstrap() (1 cheap DB query).
    // This ensures that if the first prompt found an empty project (no configs),
    // subsequent prompts will re-check once the agent generates files.
    // SKIP in plan mode: plan responses are proposals, not confirmed decisions.
    if (agentMode === "plan") {
        logger.info(`${LP} 🧬 Memory bootstrap skipped — plan mode (proposals, not confirmed)`);
    } else try {
        const { needsBootstrap, runMemoryBootstrap } = await import("../utils/memory_bootstrap");
        const { setDebugContext, debugLog } = await import("../utils/memory_debug_log");
        const bootstrapSettings = readSettings();
        const bootstrapUserId = bootstrapSettings.userId;
        const db = getRemoteDb();
        const chatWithApp = await db.query.chats.findFirst({
            where: eq(remoteSchema.chats.id, req.chatId),
            with: { app: true }
        });
        if (bootstrapUserId && chatWithApp?.app?.id) {
            const appName = chatWithApp.app?.name || `app_${chatWithApp.app.id}`;
            setDebugContext(appName, chatWithApp.app.id);
            debugLog("Trigger", `Bootstrap check`, {
                appId: String(chatWithApp.app.id),
                appName,
                projectDir,
            });
            const needs = await needsBootstrap(chatWithApp.app.id, bootstrapUserId);
            if (needs) {
                debugLog("Trigger", `🧬 Bootstrap TRIGGERED — launching fire-and-forget`);
                logger.info(`${LP} 🧬 Memory bootstrap triggered for appId=${chatWithApp.app.id}`);
                runMemoryBootstrap({
                    appId: chatWithApp.app.id,
                    userId: bootstrapUserId,
                    projectDir,
                    appName,
                }).catch((err: any) => {
                    debugLog("Trigger", `❌ Bootstrap FAILED`, { error: err.message });
                    logger.warn(`${LP} 🧬 Memory bootstrap failed (non-fatal): ${err.message}`);
                });
            } else {
                debugLog("Trigger", `⏭️ Bootstrap skipped — app already has memories`);
            }
        }
    } catch (bootstrapErr: any) {
        logger.warn(`${LP} 🧬 Memory bootstrap import failed (non-fatal): ${(bootstrapErr as any).message}`);
    }

    // Instructions file was already written before getOpenCodeClient (above).
    // No config.update needed — it's in the initial config.



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
    // Real cost reported by OpenCode (from message.updated → info.usage.cost).
    // When present, this is always more accurate than our manual token × price calculation.
    let totalCostUsd: number | null = null;
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
                onMessageCost: (costUsd: number) => {
                    // OpenCode reports the exact cost after the message completes.
                    // We always take the LATEST value (subsequent message.updated events
                    // include cumulative cost, so the last one wins).
                    totalCostUsd = costUsd;
                    logger.info(`${LP} 💰 OpenCode reported real cost: $${costUsd.toFixed(6)}`);
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
        lastProjectDir = projectDir;
        logger.info(`${LP} Prompt: "${req.prompt.substring(0, 100)}..."`);

        // Build prompt parts: text + optional file attachments
        // On the very first message of a brand new app (no prior assistant messages),
        // inject a build-mode instruction so the agent directly implements instead of
        // proposing a plan. Only for the "build" agent — plan/explore have their own behavior.
        let promptText = req.prompt;
        const effectiveAgent = options.agentId || "build";
        const isMockupMode = effectiveAgent === "mockup";

        // Detect first message (no prior assistant responses) — used by build-mode
        // instruction and DESIGN.md hint below.
        const hasAssistantMessages = chatMessages.some((m: any) => m.role === "assistant" && m.id !== placeholderMessageId);

        if (isMockupMode) {
            // Mockup mode uses the custom "mockup" primary agent defined in config
            // (steps: 8, bash: false, write/edit: true)
            logger.info(`${LP} ⚡ Mockup mode — using custom mockup agent (no bash, 8 steps)`);
        } else if (effectiveAgent === "build") {
            // Build mode: no special first-message injection needed.
            // Rules are in docs/SPECS.md via opencode.json instructions.
        } else if (effectiveAgent === "plan") {
            if (!hasAssistantMessages) {
                const isEnglish = settings.chatLanguage === "en";
                const planQuestionPrompt = isEnglish
                    ? `[INTERACTIVE PLANNING INSTRUCTION:\n` +
                      `You are in planning mode. Your goal is to create a detailed and precise development plan.\n\n` +
                      `GOLDEN RULE — ASK BEFORE PLANNING:\n` +
                      `Unless the user has provided an extremely detailed plan with all decisions already made,\n` +
                      `you MUST use the "question" tool to ask the user about fine details before generating\n` +
                      `the final plan. Every doubt, ambiguity, or design/architecture decision must be resolved with the user.\n\n` +
                      `QUESTION LIMIT:\n` +
                      `- Ask a MAXIMUM of 5 questions to the user (you can ask fewer if the request is clear).\n` +
                      `- If you need more than 5, you must explicitly justify it to the user.\n` +
                      `- Group related questions into a single question when possible.\n` +
                      `- Use predefined options when the alternatives are clear.\n\n` +
                      `FLOW:\n` +
                      `1. Analyze the user's request and identify ambiguities and pending decisions.\n` +
                      `2. Use the "question" tool to ask the user (one question at a time).\n` +
                      `3. Once you have all the answers, generate the complete plan with the Stages and Tasks structure.\n\n` +
                      `Do NOT generate a provisional or incomplete plan while waiting for answers.\n` +
                      `First clarify, then plan.]`
                    : `[INSTRUCCIÓN DE PLANIFICACIÓN INTERACTIVA:\n` +
                      `Estás en modo planificación. Tu objetivo es crear un plan de desarrollo detallado y preciso.\n\n` +
                      `REGLA DE ORO — PREGUNTAR ANTES DE PLANIFICAR:\n` +
                      `A menos que el usuario te haya dado un plan sumamente detallado con todas las decisiones ya tomadas,\n` +
                      `DEBES usar la herramienta "question" para preguntarle al usuario por los detalles finos antes de generar\n` +
                      `el plan definitivo. Cada duda, ambigüedad o decisión de diseño/arquitectura debe resolverse con el usuario.\n\n` +
                      `LÍMITE DE PREGUNTAS:\n` +
                      `- Haz como MÁXIMO 5 preguntas al usuario (puedes hacer menos si la petición es clara).\n` +
                      `- Si necesitas más de 5, debes justificarlo explícitamente al usuario.\n` +
                      `- Agrupa las preguntas relacionadas en una sola pregunta cuando sea posible.\n` +
                      `- Usa opciones predefinidas (options) cuando las alternativas sean claras.\n\n` +
                      `FLUJO:\n` +
                      `1. Analiza la petición del usuario e identifica las ambigüedades y decisiones pendientes.\n` +
                      `2. Usa la herramienta "question" para preguntar al usuario (una pregunta a la vez).\n` +
                      `3. Una vez que tengas todas las respuestas, genera el plan completo con la estructura\n` +
                      `   de Etapas y Tareas.\n\n` +
                      `NO generes un plan provisional o incompleto mientras esperas respuestas.\n` +
                      `Primero aclara, luego planifica.]`;
                promptText = `${planQuestionPrompt}\n\n${req.prompt}`;
                logger.info(`${LP} 🗣️ First message in plan mode — injected interactive question instruction (lang=${isEnglish ? "en" : "es"})`);
            }
        }

        // DESIGN.md is loaded natively via opencode.json instructions — no hint needed.

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

        // Inject prior messages (queued while previous stream ran) as silent user turns
        // using OpenCode's native `noReply: true` flag. This puts them in the session's
        // conversation history so the AI sees every queued message as a separate user turn.
        if (options.priorMessages && options.priorMessages.length > 0) {
            logger.info(`${LP} Injecting ${options.priorMessages.length} prior message(s) with noReply:true`);
            for (const prior of options.priorMessages) {
                const parts: any[] = [{ type: "text", text: prior.prompt }];
                // Add image attachments if present
                if (prior.attachments) {
                    for (const att of prior.attachments) {
                        if (att.type.startsWith("image/")) {
                            parts.push({ type: "file", mime: att.type, filename: att.name, url: att.data });
                        }
                    }
                }
                try {
                    await client.session.prompt({
                        path: { id: sessionId },
                        query: { directory: projectDir },
                        body: {
                            noReply: true,
                            parts,
                        } as any,
                    });
                    logger.info(`${LP}   → noReply injected: "${prior.prompt.substring(0, 60)}..."`);
                } catch (e: any) {
                    logger.warn(`${LP}   → noReply injection failed: ${e.message}`);
                }
            }
        }

        logger.info(`--- USER PROMPT ---\n${promptText}`);
        logger.info(`------------------------------------------`);

        // Fire the prompt (non-blocking)
        // NOTE: We do NOT pass `system` here — that would REPLACE OpenCode's
        // internal system prompt (tools, AGENTS.md, project context). Instead,
        // context instructions (including memories) are injected via
        // config.update({ instructions }) which APPENDS them safely.
        await client.session.promptAsync({
            path: { id: sessionId },
            query: { directory: projectDir },
            body: {
                model: {
                    providerID,
                    modelID: sanitizeModelName(model.name),
                },
                agent: effectiveAgent !== "build" ? effectiveAgent : undefined,
                parts: promptParts,
            },
        });

        logger.info(`${LP} Prompt sent (async). Waiting for events...`);

        // Wait for the event stream to signal completion.
        // processEvents returns when session goes idle or the stream ends.
        await eventProcessingDone;

        const getAbortedResponse = () => {
            const partialText = timeline.filter(e => e.type === "text").map(e => (e as any).text).join("");

            // Estimate tokens since we might not have received the final usage chunk from upstream
            // <think> blocks
            const thinkMatches = partialText.match(/<think>[\s\S]*?(<\/think>|$)/gi) || [];
            const thinkChars = thinkMatches.reduce((acc, m) => acc + m.length, 0);

            // Standard text (excluding think)
            const standardChars = Math.max(0, partialText.length - thinkChars);

            let estOutput = Math.max(totalOutputTokens, Math.ceil(standardChars / 4));
            let estReasoning = Math.max(totalReasoningTokens, Math.ceil(thinkChars / 4));

            // Input tokens
            let estInput = totalInputTokens;
            if (estInput === 0) {
               const inputString = chatMessages.map((m: any) => typeof m.content === "string" ? m.content : JSON.stringify(m.content)).join("\n");
               estInput = Math.ceil(inputString.length / 4) + 1500; // 1500 for AGENTS.md/overhead
            }

            return {
                fullResponse: partialText || "Operación cancelada",
                success: false,
                inputTokens: estInput,
                outputTokens: estOutput,
                reasoningTokens: estReasoning,
                cachedTokens: totalCachedTokens,
                costUsd: totalCostUsd,
            };
        };

        // If the stream was aborted (stop button), session.abort() was already
        // sent eagerly by the onUserAbort listener — just return partial text.
        if (abortController.signal.aborted) {
            logger.info(`${LP} Aborted for chat ${req.chatId} — returning estimated partial response`);
            return getAbortedResponse();
        }

        const totalText = timeline.filter(e => e.type === "text").map(e => (e as any).text).join("");
        const totalTools = timeline.filter(e => e.type === "tool").length;
        logger.info(`${LP} ✅ Response complete. Text: ${totalText.length}ch, files edited: ${filesEdited.length}, tools: ${totalTools}`);

        // Send final response with all content
        const finalContent = buildFinalResponse(timeline, filesEdited, toolsActive);
        logger.info(`${LP} 🔍 TRACE buildFinalResponse: ${finalContent.length}ch, first80="${finalContent.slice(0, 80).replace(/\n/g, '\\n')}"`);
        sendChunk(event, req.chatId, chatMessages, finalContent);

        logger.info(`${LP} 📊 Token usage: input=${totalInputTokens}, output=${totalOutputTokens}, reasoning=${totalReasoningTokens}, total=${totalInputTokens + totalOutputTokens}, costUsd=${totalCostUsd !== null ? `$${(totalCostUsd as any).toFixed(6)}` : "unknown"}`);
        return { fullResponse: finalContent, success: true, inputTokens: totalInputTokens, outputTokens: totalOutputTokens, reasoningTokens: totalReasoningTokens, cachedTokens: totalCachedTokens, costUsd: totalCostUsd };

    } catch (error: any) {
        if (abortController.signal.aborted) {
            logger.info(`${LP} Aborted for chat ${req.chatId}`);
            
            const partialText = timeline.filter(e => e.type === "text").map(e => (e as any).text).join("");
            const thinkMatches = partialText.match(/<think>[\s\S]*?(<\/think>|$)/gi) || [];
            const thinkChars = thinkMatches.reduce((acc: number, m: string) => acc + m.length, 0);
            const standardChars = Math.max(0, partialText.length - thinkChars);
            let estOutput = Math.max(totalOutputTokens, Math.ceil(standardChars / 4));
            let estReasoning = Math.max(totalReasoningTokens, Math.ceil(thinkChars / 4));
            let estInput = totalInputTokens;
            if (estInput === 0) {
               const inputString = chatMessages.map((m: any) => typeof m.content === "string" ? m.content : JSON.stringify(m.content)).join("\n");
               estInput = Math.ceil(inputString.length / 4) + 1500;
            }
            return {
                fullResponse: partialText || "Operación cancelada",
                success: false,
                inputTokens: estInput,
                outputTokens: estOutput,
                reasoningTokens: estReasoning,
                cachedTokens: totalCachedTokens,
                costUsd: totalCostUsd as number | null,
            };
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
            costUsd: totalCostUsd,
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
        /** Called when OpenCode reports the real cost of the completed assistant message. */
        onMessageCost: (costUsd: number) => void;
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

    // Expose text injection to the question reply handler
    activeTextInjector = (text: string) => {
        callbacks.onTextDelta(text);
        sendUpdate();
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
                        // Capture the real cost reported by OpenCode.
                        // The `usage.cost` field (in USD) is the ground truth — it matches
                        // exactly what OpenCode shows in its own UI, and is more accurate
                        // than multiplying token counts by OpenRouter price data.
                        const realCost = info.usage?.cost;
                        if (typeof realCost === "number" && realCost > 0) {
                            callbacks.onMessageCost(realCost);
                        }
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
                    let errorObj = props.error || props.message || props;
                    let errorMsg = "Unknown error";
                    if (typeof errorObj === "string") {
                        errorMsg = errorObj;
                    } else if (errorObj instanceof Error) {
                        errorMsg = errorObj.message;
                    } else {
                        try {
                            // Some OpenRouter errors come nested in .error mapped cleanly
                            if (errorObj?.error?.message) {
                                errorMsg = errorObj.error.message;
                            } else {
                                errorMsg = JSON.stringify(errorObj);
                            }
                        } catch (e) {
                            errorMsg = String(errorObj);
                        }
                    }
                    logger.error(`[OC:Event] ❌ SESSION ERROR: ${errorMsg}`);
                    throw new Error(`Session Error: ${errorMsg}`);
                }

                // Known events we can safely ignore
                case "server.connected":
                case "session.updated":
                case "file.watcher.updated":
                    break;

                case "permission.asked": {
                    const reqId = props.id || props.requestID;
                    if (!reqId) break;

                    // OpenCode PermissionRequest schema:
                    // { id, sessionID, permission: string, patterns: string[], metadata, always: string[], tool? }
                    const permName = props.permission || props.type || "unknown";
                    const patterns: string[] = Array.isArray(props.patterns) ? props.patterns : [];
                    const alwaysPatterns: string[] = Array.isArray(props.always) ? props.always : [];
                    const permInput = patterns.join(" ") || props.input || props.command || "";

                    logger.info(`[OC:Event] 🛡️ permission.asked: tool=${permName} patterns=${JSON.stringify(patterns)} always=${JSON.stringify(alwaysPatterns)} id=${reqId}`);

                    // Read user's configured permission for this tool
                    const currentSettings = readSettings();
                    const toolPermission = resolveToolPermission(
                        permName,
                        typeof permInput === "string" ? permInput : JSON.stringify(permInput),
                        currentSettings.openCodePermissions2,
                    );

                    try {
                        // Use the permission's own sessionID when available (guaranteed correct),
                        // falling back to the closure's sessionId.
                        const permSessionId = props.sessionID || sessionId;

                        if (toolPermission === "allow") {
                            // Auto-approve
                            await replyToPermission(reqId, "always", permSessionId);
                            logger.info(`[OC:Event] Auto-approved permission: always for ${permName}`);
                        } else if (toolPermission === "deny") {
                            // Auto-reject
                            await replyToPermission(reqId, "reject", permSessionId);
                            logger.info(`[OC:Event] Auto-rejected permission: deny for ${permName}`);
                        } else {
                            // "ask" — emit IPC event and wait for renderer response
                            const inputStr = typeof permInput === "string" ? permInput : JSON.stringify(permInput);
                            safeSend(event.sender, "opencode-permission:request", {
                                requestId: reqId,
                                sessionId: permSessionId,
                                chatId,
                                toolName: permName,
                                toolInput: inputStr || null,
                            });
                            logger.info(`[OC:Event] 🛡️ Permission ask sent to UI: ${permName} [${reqId}]`);

                            const userResponse = await waitForPermissionResponse(reqId, 300_000);
                            await replyToPermission(reqId, userResponse as "once" | "always" | "reject", permSessionId);
                            logger.info(`[OC:Event] 🛡️ Permission resolved: ${userResponse} for ${permName}`);

                            // Persist to user settings so the choice is remembered.
                            // once   → no persist (config already says "ask", hot-update mid-operation would kill the tool)
                            // always → persist "allow" (never ask again)
                            // reject → persist "deny"  (block going forward)
                            // For bash: adds a granular custom rule (not the global pill).
                            // For other tools: sets the global pill.
                            if (userResponse === "always" || userResponse === "reject") {
                                const settingsValue = userResponse === "always" ? "allow" : "deny";
                                logger.info(`[OC:Permission] 📝 About to persist: permName="${permName}" → settingsValue="${settingsValue}"`);
                                persistPermissionToSettings(permName, settingsValue, alwaysPatterns, inputStr);
                            } else {
                                logger.info(`[OC:Permission] 📝 Skipping persist for "${userResponse}" (ephemeral)`);
                            }
                        }
                    } catch (e: any) {
                        logger.error(`[OC:Event] Error handling permission: ${e.message}`);
                    }
                    break;
                }

                case "question.asked": {
                    // QuestionRequest: { id, sessionID, questions: QuestionInfo[] }
                    // QuestionInfo: { question, header, options: QuestionOption[], multiple?, custom? }
                    const questionRequestId = props.id;
                    const questionSessionId = props.sessionID;
                    if (!questionRequestId) {
                        logger.warn(`[OC:Event] question.asked without ID, ignoring`);
                        break;
                    }
                    // Filter by session
                    if (questionSessionId && questionSessionId !== sessionId) break;

                    const questions: any[] = props.questions || [];
                    if (questions.length === 0) {
                        logger.warn(`[OC:Event] question.asked with empty questions array`);
                        break;
                    }

                    // Handle the FIRST question (most common case — multi-question support can be added later)
                    const q = questions[0];
                    const questionText = q.question || q.header || "";
                    const questionOptions = Array.isArray(q.options)
                        ? q.options.map((o: any) => o.label || String(o))
                        : [];

                    logger.info(`[OC:Event] ❓ Question asked: "${questionText}" (id=${questionRequestId}, options=${questionOptions.length})`);

                    // Close any open think block before the question UI
                    if (isCurrentlyReasoning) {
                        callbacks.onTextDelta(`\n</think>\n`);
                        isCurrentlyReasoning = false;
                    }

                    // Question UI is rendered only in the ChatInput area (via atom),
                    // not inline in the agent bubble — so we don't emit a vibes-ask-user tag.
                    sendUpdate();

                    // 2. Send IPC event to renderer so VibesAskUser pending state is populated
                    safeSend(event.sender, "agent-tool:ask-user-request", {
                        requestId: questionRequestId,
                        chatId,
                        question: questionText,
                        options: questionOptions.length > 0 ? questionOptions : null,
                        context: null,
                        multiple: !!q.multiple,
                    });

                    // 3. Native OS notification if the window is not focused
                    try {
                        const { Notification, BrowserWindow } = require("electron");
                        const win = BrowserWindow.fromWebContents(event.sender);
                        if (win && !win.isFocused()) {
                            const notif = new Notification({
                                title: "El agente necesita tu respuesta",
                                body: questionText.length > 120 ? questionText.slice(0, 117) + "…" : questionText,
                                silent: false,
                            });
                            notif.on("click", () => {
                                win.show();
                                win.focus();
                            });
                            notif.show();
                        }
                    } catch (_) { /* notification not critical */ }
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
            throw error; // Re-throw to fail the stream properly
        }
    }

    // Safety: close any lingering open think block if stream ended unexpectedly
    if (isCurrentlyReasoning) {
        isCurrentlyReasoning = false;
        callbacks.onTextDelta(`\n</think>\n\n`);
        logger.info(`[OC:Event] 🧠 CLOSED </think> — stream ended`);
    }

    // Clear the text injector when the stream ends
    activeTextInjector = null;
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
        question: "vibes-ask-user",
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
 * and raw tool-call XML tags from models that don't support native function calling.
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

    // ── Strip raw tool-call XML from models (MiniMax, etc.) ──
    // These are protocol artifacts that should never reach the UI.
    // Matches: <invoke ...>...</invoke>, <minimax:tool_call>...</minimax:tool_call>,
    // <parameter ...>...</parameter>, and similar namespaced tags.
    cleaned = cleaned.replace(/<\/?invoke(?:\s[^>]*)?>[\s\S]*?(?:<\/invoke>)?/gi, "");
    cleaned = cleaned.replace(/<\/?parameter(?:\s[^>]*)?>[\s\S]*?(?:<\/parameter>)?/gi, "");
    cleaned = cleaned.replace(/<\/?\w+:tool_call(?:\s[^>]*)?>[\s\S]*?(?:<\/\w+:tool_call>)?/gi, "");
    cleaned = cleaned.replace(/<\/?\w+:function_call(?:\s[^>]*)?>[\s\S]*?(?:<\/\w+:function_call>)?/gi, "");

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
    logger.debug(`[OC:sendChunk] chatId=${chatId} msgs=${currentMessages.length} lastAssistant.id=${lastAssistant?.id} content=${lastAssistant?.content?.length ?? 0}ch`);
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

// =============================================================================
// Question Tool IPC Handler
// =============================================================================

import { createTypedHandler } from "./base";
import { agentContracts } from "../types/agent";

/**
 * Register the IPC handler for `respondToAskUser`.
 * Called from ipc_host.ts during app startup.
 *
 * When the user responds to a question in the VibesAskUser UI,
 * the renderer calls ipc.agent.respondToAskUser({ requestId, response }).
 * This handler forwards the answer to the OpenCode SDK via client.question.reply().
 */
export function registerQuestionHandler() {
    createTypedHandler(agentContracts.respondToAskUser, async (_event, params) => {
        const { requestId, response } = params;

        if (!serverUrl) {
            logger.error("[OC:AskUser] No OpenCode server URL — cannot reply to question");
            return;
        }

        // response can be a single string or an array of strings (multi-select)
        const answerLabels = Array.isArray(response) ? response : [response];
        logger.info(`[OC:AskUser] Replying to question ${requestId}: ${JSON.stringify(answerLabels).substring(0, 120)}`);

        try {
            // The v1 SDK client doesn't expose `question` — use direct HTTP.
            // Endpoint: POST /question/{requestID}/reply?directory=...
            // Body: { answers: Array<Array<string>> }  (one answer array per question)
            const dirParam = lastProjectDir ? `?directory=${encodeURIComponent(lastProjectDir)}` : "";
            const url = `${serverUrl}/question/${encodeURIComponent(requestId)}/reply${dirParam}`;
            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ answers: [answerLabels] }),
            });

            const text = await res.text();
            
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}: ${text}`);
            }

            logger.info(`[OC:AskUser] ✅ Reply sent successfully for ${requestId}. Server response: ${text}`);

            // Inject the user's answer as a blockquote into the live stream
            // Uses a zero-width space (\u200B) as invisible marker for purple styling
            if (activeTextInjector) {
                const answerDisplay = answerLabels.join(", ");
                activeTextInjector(`\n\n> \u200B${answerDisplay}\n\n`);
            }
        } catch (e: any) {
            logger.error(`[OC:AskUser] ❌ Failed to reply to question ${requestId}: ${e.message}`);
            throw e;
        }
    });
}

/**
 * Register the IPC handler for `respondToPermission`.
 * Called from ipc_host.ts during app startup.
 *
 * When the user responds to a permission banner in the VibesPermissionBanner UI,
 * the renderer calls ipc.agent.respondToPermission({ requestId, response }).
 * This handler resolves the pending Promise so processEvents can continue.
 */
export function registerPermissionHandler() {
    createTypedHandler(agentContracts.respondToPermission, async (_event, params) => {
        const { requestId, response } = params;
        logger.info(`[OC:Permission] Received UI response for ${requestId}: ${response}`);

        const resolver = pendingPermissionResolvers.get(requestId);
        if (resolver) {
            resolver(response);
        } else {
            logger.warn(`[OC:Permission] No pending resolver for ${requestId} — already timed out?`);
        }
    });
}
