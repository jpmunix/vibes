/**
 * Memory Debug Logger
 *
 * Accumulates markdown in a buffer during a pipeline run.
 * At the end, flushDebugLog() saves the complete markdown:
 *   - Always to /tmp/opencode/{appName}.md (filesystem)
 *   - Always to memory_debug_logs table (one row = one complete run)
 *
 * Safe: fire-and-forget, never throws, never blocks.
 */

import * as fs from "fs";
import * as path from "path";
import { getRemoteDb } from "../../db/remote";
import { memoryDebugLogs } from "../../db/remote-schema";
import { readSettings } from "../../main/settings";

const LOG_DIR = "/tmp/opencode";

let _currentAppName: string | null = null;
let _currentAppId: number | null = null;
let _sessionStart: number | null = null;
/** In-memory buffer accumulating markdown for the current run */
let _buffer: string[] = [];

// =============================================================================
// Context & Helpers
// =============================================================================

/**
 * Set the current app context for logging. Must be called before any log calls.
 * Resets the buffer for a new pipeline run.
 */
export function setDebugContext(appName: string, appId: number): void {
    _currentAppName = appName.replace(/[^a-zA-Z0-9_\-. ]/g, "_");
    _currentAppId = appId;
    _sessionStart = Date.now();
    _buffer = [];
}

function ts(): string {
    return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function elapsed(): string {
    if (!_sessionStart) return "";
    return ` (+${((Date.now() - _sessionStart) / 1000).toFixed(1)}s)`;
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

/** Append text to both the in-memory buffer and the filesystem log */
function append(text: string): void {
    _buffer.push(text);
    try {
        const logPath = getLogPath();
        if (logPath) fs.appendFileSync(logPath, text + "\n");
    } catch { /* never throw */ }
}

// =============================================================================
// Public Logging API (same signatures as before)
// =============================================================================

/**
 * Append a line to the current app's debug log.
 */
export function debugLog(section: string, message: string, data?: Record<string, any>): void {
    try {
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
        append(line);
    } catch { /* never throw */ }
}

/**
 * Write a section header to the log.
 */
export function debugSection(title: string): void {
    try {
        const header = [
            "",
            `## ${title}`,
            `_${ts()} · appId=${_currentAppId} · app="${_currentAppName}"_`,
            "",
            "| Time | Stage | Detail | Data |",
            "|---|---|---|---|",
        ].join("\n");
        append(header);
    } catch { /* never throw */ }
}

/**
 * Write a new session header (called once per app open).
 */
export function debugSessionStart(extra?: Record<string, any>): void {
    try {
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
        append(lines.join("\n"));
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
        append(block);
    } catch { /* never throw */ }
}

/**
 * Log a list of items (for config files found, operations generated, etc.)
 */
export function debugList(label: string, items: string[]): void {
    try {
        const lines = [
            "",
            `**${label}** (${items.length}):`,
            ...items.map(i => `- ${i}`),
            "",
        ].join("\n");
        append(lines);
    } catch { /* never throw */ }
}

/**
 * Write clean, copy-paste-ready prompts to a SEPARATE file for playground testing.
 * File: /tmp/opencode/app_{appId}_{stage}.txt — overwritten each time.
 * Also appends a summary to the buffer for DB storage.
 */
export function debugPlayground(stage: string, model: string, systemPrompt: string, userMessage: string): void {
    try {
        // Append summary to buffer
        const summary = [
            "",
            `### Playground: ${stage}`,
            `**Model:** ${model}`,
            "",
            "<details><summary>System Prompt</summary>",
            "",
            "```",
            systemPrompt.slice(0, 1500),
            systemPrompt.length > 1500 ? `\n... (${systemPrompt.length} chars total)` : "",
            "```",
            "</details>",
            "",
            "<details><summary>User Message</summary>",
            "",
            "```",
            userMessage.slice(0, 1500),
            userMessage.length > 1500 ? `\n... (${userMessage.length} chars total)` : "",
            "```",
            "</details>",
            "",
        ].join("\n");
        append(summary);

        // Also write the full-length playground file to /tmp
        if (_currentAppId) {
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

// =============================================================================
// Flush — saves the accumulated buffer to the DB as one complete row
// =============================================================================

/**
 * Flush the accumulated markdown buffer to the database.
 * Call this at the end of every pipeline run (bootstrap, extraction, etc.)
 * Fire-and-forget — never blocks the caller.
 */
export function flushDebugLog(): void {
    try {
        if (_buffer.length === 0 || !_currentAppName) return;

        const contentMd = _buffer.join("\n");
        const filename = `${_currentAppName}.md`;
        const appId = _currentAppId ?? 0;
        const appName = _currentAppName ?? "";

        // Reset buffer immediately
        _buffer = [];

        // Get userId
        let userId: string | null = null;
        try {
            userId = readSettings().userId || null;
        } catch { /* */ }

        if (!userId) return;

        // Fire-and-forget DB insert
        getRemoteDb()
            .insert(memoryDebugLogs)
            .values({
                userId,
                appId,
                appName,
                filename,
                contentMd,
                createdAt: new Date(),
            })
            .catch((err: any) => {
                console.error("[debug_log] DB flush failed:", err?.message || err);
            });
    } catch { /* never throw */ }
}
