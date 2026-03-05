/**
 * Crush (ex-OpenCode) Adapter for minube-vibes
 * 
 * Proof of Concept: Integrates Crush as a headless AI coding agent backend,
 * replacing the custom local_agent_handler.ts while keeping the existing
 * Electron UI and IPC infrastructure intact.
 * 
 * Architecture:
 *   [Frontend UI] → [IPC] → [CrushAdapter] → [crush run (subprocess)] → [File System]
 *                                          ↓
 *                              [IPC events back to frontend]
 */

import { ChildProcess, spawn } from "node:child_process";
import { IpcMainInvokeEvent } from "electron";
import path from "node:path";
import fs from "node:fs";
import log from "electron-log";
import { readSettings, decrypt } from "../../main/settings";
import { getDyadAppPath } from "../../paths/paths";
import { safeSend } from "../utils/safe_sender";
import type { ChatStreamParams } from "@/ipc/types";

const logger = log.scope("crush_adapter");

// ============================================================================
// Types
// ============================================================================

interface CrushConfig {
    /** Path to the crush binary */
    binaryPath: string;
    /** Working directory for the agent (app path) */
    cwd: string;
    /** Model to use (e.g. "anthropic/claude-sonnet-4-20250514") */
    model?: string;
    /** Environment variables including API keys */
    env: Record<string, string>;
    /** Whether to run in yolo mode (auto-accept all tool permissions) */
    yolo: boolean;
}

interface CrushSession {
    process: ChildProcess;
    abortController: AbortController;
    chatId: number;
    fullResponse: string;
}

// ============================================================================
// State
// ============================================================================

/** Active Crush sessions, keyed by chatId */
const activeSessions = new Map<number, CrushSession>();

// ============================================================================
// Configuration Helpers
// ============================================================================

/**
 * Find the crush binary path.
 * Checks common installation locations, including NVM-managed Node versions
 * (Electron does NOT inherit the terminal's NVM PATH).
 */
function findCrushBinary(): string {
    const HOME = process.env.HOME || require("os").homedir();
    const nvmDir = path.join(HOME, ".nvm/versions/node");

    const candidates = [
        // npm global install
        "/usr/local/bin/crush",
        "/usr/bin/crush",
        // Home bin
        path.join(HOME, ".local/bin/crush"),
        path.join(HOME, "go/bin/crush"),
        // npm global (nvm) — current Electron node version
        path.join(nvmDir, process.version, "bin/crush"),
    ];

    // Scan ALL NVM node versions (Electron's process.version may differ from terminal's)
    try {
        if (fs.existsSync(nvmDir)) {
            const versions = fs.readdirSync(nvmDir);
            for (const version of versions) {
                const binPath = path.join(nvmDir, version, "bin/crush");
                if (!candidates.includes(binPath)) {
                    candidates.push(binPath);
                }
            }
        }
    } catch {
        // NVM dir doesn't exist or is unreadable
    }

    // Also try npm root -g to find the global bin directory
    try {
        const { execSync } = require("child_process");
        // Try with the user's shell PATH
        const shellEnv = { ...process.env, PATH: `${HOME}/.nvm/versions/node/v20.19.5/bin:${process.env.PATH || ""}` };
        const npmGlobalBin = execSync("npm bin -g 2>/dev/null", { encoding: "utf-8", env: shellEnv }).trim();
        if (npmGlobalBin) {
            const binPath = path.join(npmGlobalBin, "crush");
            if (!candidates.includes(binPath)) {
                candidates.push(binPath);
            }
        }
    } catch {
        // npm not available or failed
    }

    // First try which (may work if fix-path has been called)
    try {
        const { execSync } = require("child_process");
        const result = execSync("which crush 2>/dev/null", { encoding: "utf-8" }).trim();
        if (result && fs.existsSync(result)) return result;
    } catch {
        // which failed, try candidates
    }

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            logger.info(`[Crush] Found binary at: ${candidate}`);
            return candidate;
        }
    }

    throw new Error(
        `Crush binary not found. Searched: ${candidates.join(", ")}. Install it with: npm install -g @charmland/crush`
    );
}

/**
 * Extract API keys from the app's encrypted settings and convert them
 * to environment variables that Crush understands.
 */
function getApiKeysAsEnv(): Record<string, string> {
    const settings = readSettings();
    const env: Record<string, string> = {};

    // Map provider settings to Crush environment variables
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
        // Find the selected key, or fall back to the first key
        const selectedKey = selectedKeyId
            ? openRouterSettings.keys.find((k: any) => k.id === selectedKeyId)
            : openRouterSettings.keys[0];

        if (selectedKey?.key?.value) {
            const key = selectedKey.key;
            env.OPENROUTER_API_KEY = key.encryptionType === "plaintext"
                ? key.value
                : decrypt(key);
            logger.info(`[Crush] Using OpenRouter key: "${selectedKey.alias || 'unnamed'}"`);
        }
    }

    return env;
}

/**
 * Map the app's selected model to a Crush-compatible model string.
 * Crush needs format: "provider/org/model" for disambiguation.
 * E.g. "openrouter/google/gemini-2.5-flash" or "anthropic/claude-sonnet-4-20250514"
 */
function mapModelForCrush(model: { name: string; provider: string }): string | undefined {
    // OpenRouter models have format "org/model" (e.g. "google/gemini-3-flash-preview")
    // Crush needs "openrouter/org/model" to route via OpenRouter
    if (model.provider === "openrouter") {
        return `openrouter/${model.name}`;
    }

    // Direct provider models: Crush uses "provider/model"
    return `${model.provider}/${model.name}`;
}

// ============================================================================
// Core Adapter
// ============================================================================

/**
 * Build the Crush configuration from the app's current settings.
 */
export function buildCrushConfig(appPath: string): CrushConfig {
    const settings = readSettings();
    const apiKeys = getApiKeysAsEnv();
    const model = mapModelForCrush(settings.selectedModel);

    return {
        binaryPath: findCrushBinary(),
        cwd: getDyadAppPath(appPath),
        model,
        env: {
            ...process.env as Record<string, string>,
            ...apiKeys,
            // Disable Crush's TUI since we run headless
            NO_COLOR: "1",
            TERM: "dumb",
        },
        yolo: true, // Auto-accept tool permissions in non-interactive mode
    };
}

/**
 * Build a markdown progress message showing what Crush is doing.
 * Shown in the chat bubble while waiting for Crush to finish.
 */
function buildProgressMessage(changedFiles: string[], elapsedMs: number): string {
    const elapsed = Math.round(elapsedMs / 1000);
    let msg = `⏳ **Crush está trabajando...** (${elapsed}s)\n\n`;

    if (changedFiles.length > 0) {
        msg += `📂 **${changedFiles.length} archivo${changedFiles.length > 1 ? "s" : ""} modificado${changedFiles.length > 1 ? "s" : ""}:**\n`;
        // Show the last 10 files changed (most recent first)
        const recentFiles = changedFiles.slice(-10);
        for (const file of recentFiles) {
            msg += `- \`${file}\`\n`;
        }
        if (changedFiles.length > 10) {
            msg += `- ... y ${changedFiles.length - 10} más\n`;
        }
    } else {
        msg += "Analizando el proyecto y planificando cambios...";
    }

    return msg;
}

/**
 * Execute a Crush command in non-interactive mode and stream the output
 * back to the Electron frontend via IPC events.
 * 
 * This is the main entry point that replaces handleLocalAgentStream.
 */
export async function handleCrushStream(
    event: IpcMainInvokeEvent,
    req: ChatStreamParams,
    abortController: AbortController,
    options: {
        placeholderMessageId: number;
        appPath: string;
        /** Full chat messages array — needed to build chunks in the format the frontend expects */
        chatMessages: any[];
    },
): Promise<{ fullResponse: string; success: boolean }> {
    const { placeholderMessageId, appPath, chatMessages } = options;

    logger.info(`[Crush] Starting stream for chat ${req.chatId}`);

    let config: CrushConfig;
    try {
        config = buildCrushConfig(appPath);
    } catch (error: any) {
        logger.error("[Crush] Configuration error:", error.message);
        return {
            fullResponse: `❌ Error de configuración de Crush: ${error.message}`,
            success: false,
        };
    }

    // Build the crush run command
    const args: string[] = ["run"];

    if (config.model) {
        args.push("--model", config.model);
    }

    // --verbose gives us tool execution info on stderr
    args.push("--verbose");

    // NOTE: We do NOT use --cwd flag here. Large projects cause Crush to hang
    // when passed via --cwd. Instead, we set the cwd on the spawn options,
    // which Crush handles correctly.

    // The prompt is the last argument
    args.push(req.prompt);

    logger.info(`[Crush] Command: ${config.binaryPath} ${args.join(" ")}`);
    logger.info(`[Crush] CWD (via spawn): ${config.cwd}`);
    logger.info(`[Crush] Model: ${config.model}`);
    logger.info(`[Crush] Available API keys: ${Object.keys(config.env).filter(k => k.endsWith("_KEY") || k.endsWith("_TOKEN")).filter(k => config.env[k]).join(", ")}`);

    return new Promise((resolve) => {
        let fullResponse = "";
        let lastChunkSent = Date.now();
        const CHUNK_DEBOUNCE_MS = 100; // Send chunks at most every 100ms
        let pendingChunk = "";
        let chunkTimer: NodeJS.Timeout | null = null;

        const crushProcess = spawn(config.binaryPath, args, {
            cwd: config.cwd,
            env: config.env,
            stdio: ["pipe", "pipe", "pipe"],
        });

        logger.info(`[Crush] Process spawned with PID: ${crushProcess.pid}`);

        // Track this session
        const session: CrushSession = {
            process: crushProcess,
            abortController,
            chatId: req.chatId,
            fullResponse: "",
        };
        activeSessions.set(req.chatId, session);

        // =====================================================================
        // Live progress: watch the project directory for file changes
        // Crush works silently (no stdout until done), so we detect activity
        // by monitoring the file system and sending updates to the frontend.
        // =====================================================================
        const changedFiles: string[] = [];
        let fileWatcher: fs.FSWatcher | null = null;
        let lastStdoutAt = Date.now();
        let stderrLineCount = 0;

        try {
            fileWatcher = fs.watch(config.cwd, { recursive: true }, (eventType, filename) => {
                if (!filename) return;
                // Ignore hidden files, node_modules, .git, etc.
                if (
                    filename.startsWith(".") ||
                    filename.includes("node_modules") ||
                    filename.includes(".git/") ||
                    filename.includes("__pycache__")
                ) return;

                if (!changedFiles.includes(filename)) {
                    changedFiles.push(filename);
                    logger.info(`[Crush] 📂 File ${eventType}: ${filename} (${changedFiles.length} files changed)`);

                    // Build a progress message for the frontend
                    const progressContent = buildProgressMessage(changedFiles, Date.now() - lastStdoutAt);
                    const currentMessages = [...chatMessages];
                    if (currentMessages.length > 0) {
                        const lastMsg = currentMessages[currentMessages.length - 1];
                        if (lastMsg.role === "assistant") {
                            lastMsg.content = progressContent;
                        }
                    }
                    safeSend(event.sender, "chat:response:chunk", {
                        chatId: req.chatId,
                        messages: currentMessages,
                    });
                }
            });
        } catch (watchError) {
            logger.warn(`[Crush] Could not watch directory: ${watchError}`);
        }

        // Send initial "thinking" indicator immediately
        const thinkingContent = "⏳ **Crush está trabajando...**\n\nAnalizando el proyecto y generando código...";
        const initialMessages = [...chatMessages];
        if (initialMessages.length > 0) {
            const lastMsg = initialMessages[initialMessages.length - 1];
            if (lastMsg.role === "assistant") {
                lastMsg.content = thinkingContent;
            }
        }
        safeSend(event.sender, "chat:response:chunk", {
            chatId: req.chatId,
            messages: initialMessages,
        });

        // Heartbeat — update frontend every 5s with progress
        const heartbeat = setInterval(() => {
            const silenceMs = Date.now() - lastStdoutAt;
            const silenceSec = Math.round(silenceMs / 1000);
            logger.info(`[Crush] ⏳ Working... (${silenceSec}s, ${changedFiles.length} files changed, stderr: ${stderrLineCount})`);

            // Send progress update to frontend if no stdout yet
            if (!fullResponse) {
                const progressContent = buildProgressMessage(changedFiles, silenceMs);
                const currentMessages = [...chatMessages];
                if (currentMessages.length > 0) {
                    const lastMsg = currentMessages[currentMessages.length - 1];
                    if (lastMsg.role === "assistant") {
                        lastMsg.content = progressContent;
                    }
                }
                safeSend(event.sender, "chat:response:chunk", {
                    chatId: req.chatId,
                    messages: currentMessages,
                });
            }
        }, 5000);

        // Function to flush pending chunks to the frontend
        // Must replicate the same format as local_agent_handler.sendResponseChunk:
        // Send ALL chat messages, with the last assistant message content updated.
        const flushChunk = () => {
            if (pendingChunk) {
                // Clone messages and update the last assistant message content
                const currentMessages = [...chatMessages];
                if (currentMessages.length > 0) {
                    const lastMsg = currentMessages[currentMessages.length - 1];
                    if (lastMsg.role === "assistant") {
                        lastMsg.content = fullResponse;
                    }
                }

                safeSend(event.sender, "chat:response:chunk", {
                    chatId: req.chatId,
                    messages: currentMessages,
                });
                pendingChunk = "";
                lastChunkSent = Date.now();
            }
            chunkTimer = null;
        };

        // Process stdout (main agent output)
        crushProcess.stdout?.on("data", (data: Buffer) => {
            const text = data.toString("utf-8");
            fullResponse += text;
            session.fullResponse = fullResponse;
            pendingChunk += text;
            lastStdoutAt = Date.now();

            logger.info(`[Crush] 📝 stdout chunk (${text.length} chars, total: ${fullResponse.length})`);

            // Debounce chunk sending to avoid overwhelming the frontend
            const now = Date.now();
            if (now - lastChunkSent >= CHUNK_DEBOUNCE_MS) {
                flushChunk();
            } else if (!chunkTimer) {
                chunkTimer = setTimeout(flushChunk, CHUNK_DEBOUNCE_MS);
            }
        });

        // Process stderr (logs, errors, tool execution info)
        crushProcess.stderr?.on("data", (data: Buffer) => {
            const text = data.toString("utf-8");
            stderrLineCount++;

            // Log ALL stderr output for debugging
            for (const line of text.split("\n").filter(l => l.trim())) {
                logger.info(`[Crush stderr] ${line.trim()}`);
            }

            // Parse tool execution events from stderr
            // Crush logs tool calls in format: INFO tool_call tool=... 
            if (
                text.includes("tool_call") ||
                text.includes("tool_result") ||
                text.includes("executing") ||
                text.includes("write_file") ||
                text.includes("read_file") ||
                text.includes("bash") ||
                text.includes("ERRO") ||
                text.includes("WARN")
            ) {
                safeSend(event.sender, "chat:agent:tool-status", {
                    chatId: req.chatId,
                    status: text.trim(),
                });
            }
        });

        // Handle process exit
        crushProcess.on("close", (code) => {
            // Clean up watchers and timers
            clearInterval(heartbeat);
            if (fileWatcher) {
                fileWatcher.close();
                fileWatcher = null;
            }

            // Flush any remaining chunks
            if (chunkTimer) {
                clearTimeout(chunkTimer);
            }
            flushChunk();

            activeSessions.delete(req.chatId);

            if (code === 0) {
                logger.info(`[Crush] Process completed successfully for chat ${req.chatId}`);
                resolve({ fullResponse, success: true });
            } else if (abortController.signal.aborted) {
                logger.info(`[Crush] Process aborted for chat ${req.chatId}`);
                resolve({ fullResponse, success: false });
            } else {
                logger.error(`[Crush] Process exited with code ${code} for chat ${req.chatId}`);
                resolve({
                    fullResponse: fullResponse || `❌ Crush terminó con código de error: ${code}`,
                    success: false,
                });
            }
        });

        crushProcess.on("error", (error) => {
            logger.error(`[Crush] Process error for chat ${req.chatId}:`, error);
            activeSessions.delete(req.chatId);
            resolve({
                fullResponse: `❌ Error al ejecutar Crush: ${error.message}`,
                success: false,
            });
        });

        // Handle abort
        abortController.signal.addEventListener("abort", () => {
            logger.info(`[Crush] Aborting process for chat ${req.chatId}`);
            crushProcess.kill("SIGTERM");
            // Give it a moment to clean up, then force kill
            setTimeout(() => {
                if (!crushProcess.killed) {
                    crushProcess.kill("SIGKILL");
                }
            }, 3000);
        });
    });
}

/**
 * Cancel an active Crush session for a given chat.
 */
export function cancelCrushSession(chatId: number): boolean {
    const session = activeSessions.get(chatId);
    if (session) {
        session.abortController.abort();
        return true;
    }
    return false;
}

/**
 * Get the status of a Crush session.
 */
export function getCrushSessionStatus(chatId: number): {
    active: boolean;
    response?: string;
} {
    const session = activeSessions.get(chatId);
    if (session) {
        return { active: true, response: session.fullResponse };
    }
    return { active: false };
}

// ============================================================================
// Crush Configuration File Generator
// ============================================================================

/**
 * Generate a .crush.json configuration file for a project.
 * This configures Crush with the project-specific settings,
 * including MCPs for custom tools (Supabase, Firebase, etc.)
 */
export function generateCrushConfig(appPath: string): object {
    const config: any = {
        "$schema": "https://charm.land/crush.json",
        permissions: {
            // Allow common read-only tools automatically
            allowed_tools: [
                "view",
                "ls",
                "grep",
                "glob",
                "read",
            ],
        },
        options: {
            // Disable bash for safety in automated mode
            // disabled_tools: ["bash"],
        },
    };

    // Check if TypeScript project
    const hasTypescript = fs.existsSync(path.join(appPath, "tsconfig.json"));
    if (hasTypescript) {
        config.lsp = {
            typescript: {
                command: "typescript-language-server",
                args: ["--stdio"],
            },
        };
    }

    return config;
}

/**
 * Write a .crush.json config file to a project directory.
 */
export function writeCrushConfigToProject(appPath: string): void {
    const fullPath = getDyadAppPath(appPath);
    const configPath = path.join(fullPath, ".crush.json");

    // Don't overwrite if already exists
    if (fs.existsSync(configPath)) {
        logger.info(`[Crush] Config already exists at ${configPath}`);
        return;
    }

    const config = generateCrushConfig(fullPath);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    logger.info(`[Crush] Generated config at ${configPath}`);
}

// ============================================================================
// Diagnostic / Health Check
// ============================================================================

/**
 * Check if Crush is properly installed and configured.
 * Returns a diagnostic report.
 */
export async function checkCrushHealth(): Promise<{
    installed: boolean;
    version?: string;
    binaryPath?: string;
    apiKeysConfigured: string[];
    errors: string[];
}> {
    const errors: string[] = [];
    let installed = false;
    let version: string | undefined;
    let binaryPath: string | undefined;

    try {
        binaryPath = findCrushBinary();
        installed = true;

        // Get version
        const { execSync } = require("child_process");
        version = execSync(`${binaryPath} --version 2>&1`, { encoding: "utf-8" }).trim();
    } catch (error: any) {
        errors.push(`Crush not found: ${error.message}`);
    }

    const apiKeys = getApiKeysAsEnv();
    const configuredKeys = Object.keys(apiKeys).filter(k => apiKeys[k]);

    if (configuredKeys.length === 0) {
        errors.push("No API keys configured. Please configure at least one AI provider in Settings.");
    }

    return {
        installed,
        version,
        binaryPath,
        apiKeysConfigured: configuredKeys,
        errors,
    };
}
