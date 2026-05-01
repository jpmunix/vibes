/**
 * Memory Debug Logger
 *
 * Dual-mode:
 *   - Development (!app.isPackaged): writes markdown to /tmp/opencode/{appName}.md
 *   - Production  (app.isPackaged):  inserts structured rows into memory_debug_logs table
 *
 * Provides full observability into the memory pipeline:
 * - Bootstrap trigger decisions
 * - DNA collection details
 * - Phase 1 & 2 operations
 * - Guardian decisions
 * - Synthesis & Router calls
 *
 * Safe: fire-and-forget, never throws, never blocks.
 */

import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";

const LOG_DIR = "/tmp/opencode";

let _currentAppName: string | null = null;
let _currentAppId: number | null = null;
let _sessionStart: number | null = null;
let _sessionId: string | null = null;

// Lazy-resolved: avoids importing electron at module load time
let _isDev: boolean | null = null;
function isDev(): boolean {
    if (_isDev !== null) return _isDev;
    try {
        const electron = require("electron");
        _isDev = !electron.app.isPackaged;
    } catch {
        _isDev = true; // Outside electron = dev
    }
    return _isDev;
}

// Lazy userId from readSettings (cached in memory, no I/O after first call)
function getUserId(): string | null {
    try {
        const { readSettings } = require("../../main/settings");
        return readSettings().userId || null;
    } catch {
        return null;
    }
}

// Async DB insert — fire-and-forget, never awaited
function insertDbLog(logType: string, stage: string | null, message: string, dataJson: string | null, contentMd: string | null): void {
    try {
        const userId = getUserId();
        if (!userId || !_sessionId) return;

        const { getRemoteDb } = require("../../db/remote");
        const remoteSchema = require("../../db/remote-schema");

        const db = getRemoteDb();
        const elapsedMs = _sessionStart ? Math.round(Date.now() - _sessionStart) : null;

        db.insert(remoteSchema.memoryDebugLogs)
            .values({
                userId,
                appId: _currentAppId ?? 0,
                sessionId: _sessionId,
                logType,
                stage,
                message,
                dataJson,
                contentMd,
                elapsedMs,
                createdAt: new Date(),
            })
            .catch(() => { /* never throw */ });
    } catch { /* never throw */ }
}

/**
 * Set the current app context for logging. Must be called before any log calls.
 */
export function setDebugContext(appName: string, appId: number): void {
    _currentAppName = appName.replace(/[^a-zA-Z0-9_\-. ]/g, "_");
    _currentAppId = appId;
    _sessionStart = Date.now();
    _sessionId = randomUUID().slice(0, 8); // Short session ID for grouping
}

function getLogPath(): string | null {
    if (!_currentAppName) return null;
    try {
        if (!fs.existsSync(LOG_DIR)) {
            fs.mkdirSync(LOG_DIR, { recursive: true });
        }
        return path.join(LOG_DIR, `${_currentAppName}.md`);
    } catch {
        return null;
    }
}

function ts(): string {
    return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function elapsed(): string {
    if (!_sessionStart) return "";
    return ` (+${((Date.now() - _sessionStart) / 1000).toFixed(1)}s)`;
}

/**
 * Append a line to the current app's debug log.
 */
export function debugLog(section: string, message: string, data?: Record<string, any>): void {
    try {
        const dataStr = data
            ? JSON.stringify(data)
            : null;

        // Always write to DB
        insertDbLog("log", section, message, dataStr, null);

        // In dev, also write to filesystem
        if (isDev()) {
            const logPath = getLogPath();
            if (!logPath) return;

            let line = `| ${ts()}${elapsed()} | **${section}** | ${message} |`;
            if (data) {
                const display = Object.entries(data)
                    .map(([k, v]) => {
                        const val = typeof v === "string" ? v : JSON.stringify(v);
                        const truncated = val.length > 200 ? val.slice(0, 200) + "…" : val;
                        return `\`${k}\`=${truncated}`;
                    })
                    .join(", ");
                line += ` ${display} |`;
            } else {
                line += " |";
            }

            fs.appendFileSync(logPath, line + "\n");
        }
    } catch { /* never throw */ }
}

/**
 * Write a section header to the log.
 */
export function debugSection(title: string): void {
    try {
        // Always write to DB
        insertDbLog("section", null, title, null, null);

        // In dev, also write to filesystem
        if (isDev()) {
            const logPath = getLogPath();
            if (!logPath) return;

            const header = [
                "",
                `## ${title}`,
                `_${ts()} · appId=${_currentAppId} · app="${_currentAppName}"_`,
                "",
                "| Time | Stage | Detail | Data |",
                "|---|---|---|---|",
            ].join("\n");

            fs.appendFileSync(logPath, header + "\n");
        }
    } catch { /* never throw */ }
}

/**
 * Write a new session header (called once per app open).
 */
export function debugSessionStart(extra?: Record<string, any>): void {
    try {
        // Always write to DB
        insertDbLog("session_start", null, `Session started for ${_currentAppName}`, extra ? JSON.stringify(extra) : null, null);

        // In dev, also write to filesystem
        if (isDev()) {
            const logPath = getLogPath();
            if (!logPath) return;

            const lines = [
                "",
                "---",
                "",
                `# Session ${ts()}`,
                "",
                `- **App**: ${_currentAppName} (id=${_currentAppId})`,
            ];

            if (extra) {
                for (const [k, v] of Object.entries(extra)) {
                    lines.push(`- **${k}**: ${typeof v === "string" ? v : JSON.stringify(v)}`);
                }
            }

            lines.push("");
            fs.appendFileSync(logPath, lines.join("\n") + "\n");
        }
    } catch { /* never throw */ }
}

/**
 * Log a code block (for prompts, responses, JSON payloads).
 */
export function debugCodeBlock(label: string, content: string, lang = ""): void {
    try {
        const maxLen = 3000;
        const truncated = content.length > maxLen
            ? content.slice(0, maxLen) + `\n\n... (truncated, ${content.length} total chars)`
            : content;

        // Always write to DB
        const md = "```" + lang + "\n" + truncated + "\n```";
        insertDbLog("code_block", null, label, JSON.stringify({ chars: content.length }), md);

        // In dev, also write to filesystem
        if (isDev()) {
            const logPath = getLogPath();
            if (!logPath) return;

            const block = [
                "",
                `<details><summary>${label} (${content.length} chars)</summary>`,
                "",
                "```" + lang,
                truncated,
                "```",
                "</details>",
                "",
            ].join("\n");

            fs.appendFileSync(logPath, block + "\n");
        }
    } catch { /* never throw */ }
}

/**
 * Log a list of items (for config files found, operations generated, etc.)
 */
export function debugList(label: string, items: string[]): void {
    try {
        // Always write to DB
        const md = items.map(i => `- ${i}`).join("\n");
        insertDbLog("list", null, label, JSON.stringify({ count: items.length }), md);

        // In dev, also write to filesystem
        if (isDev()) {
            const logPath = getLogPath();
            if (!logPath) return;

            const lines = [
                "",
                `**${label}** (${items.length}):`,
                ...items.map(i => `- ${i}`),
                "",
            ].join("\n");

            fs.appendFileSync(logPath, lines + "\n");
        }
    } catch { /* never throw */ }
}

/**
 * Write clean, copy-paste-ready prompts to a SEPARATE file for playground testing.
 * File: /tmp/opencode/app_{appId}_{stage}.txt — overwritten each time.
 * No markdown, no code fences, no truncation — just raw SYSTEM + USER text.
 *
 * In production, stores in DB with the full prompt content.
 */
export function debugPlayground(stage: string, model: string, systemPrompt: string, userMessage: string): void {
    try {
        // Always write to DB (abbreviated version — full prompts are in pipeline_logs)
        const md = [
            `**Model:** ${model}`,
            "",
            "### System Prompt",
            "```",
            systemPrompt.slice(0, 1500),
            systemPrompt.length > 1500 ? `\n... (${systemPrompt.length} chars total)` : "",
            "```",
            "",
            "### User Message",
            "```",
            userMessage.slice(0, 1500),
            userMessage.length > 1500 ? `\n... (${userMessage.length} chars total)` : "",
            "```",
        ].join("\n");
        insertDbLog("playground", null, `Playground: ${stage} (${model})`, JSON.stringify({ model, stage }), md);

        // In dev, also write to filesystem
        if (isDev()) {
            if (!_currentAppId) return;
            if (!fs.existsSync(LOG_DIR)) {
                fs.mkdirSync(LOG_DIR, { recursive: true });
            }

            const safeStage = stage.toLowerCase().replace(/[^a-z0-9]/g, "_");
            const filePath = path.join(LOG_DIR, `app_${_currentAppId}_${safeStage}.txt`);

            const content = [
                `// Playground: ${stage}`,
                `// Model: ${model}`,
                `// App: ${_currentAppName} (id=${_currentAppId})`,
                `// Generated: ${ts()}`,
                "",
                "===== SYSTEM =====",
                "",
                systemPrompt,
                "",
                "===== USER =====",
                "",
                userMessage,
            ].join("\n");

            fs.writeFileSync(filePath, content, "utf-8");
        }
    } catch { /* never throw */ }
}
