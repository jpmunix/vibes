/**
 * Memory Debug Logger — writes structured markdown logs to /tmp/opencode/{appName}.md
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

const LOG_DIR = "/tmp/opencode";

let _currentAppName: string | null = null;
let _currentAppId: number | null = null;
let _sessionStart: number | null = null;

/**
 * Set the current app context for logging. Must be called before any log calls.
 */
export function setDebugContext(appName: string, appId: number): void {
    _currentAppName = appName.replace(/[^a-zA-Z0-9_\-. ]/g, "_");
    _currentAppId = appId;
    _sessionStart = Date.now();
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
        const logPath = getLogPath();
        if (!logPath) return;

        let line = `| ${ts()}${elapsed()} | **${section}** | ${message} |`;
        if (data) {
            const dataStr = Object.entries(data)
                .map(([k, v]) => {
                    const val = typeof v === "string" ? v : JSON.stringify(v);
                    // Truncate long values
                    const truncated = val.length > 200 ? val.slice(0, 200) + "…" : val;
                    return `\`${k}\`=${truncated}`;
                })
                .join(", ");
            line += ` ${dataStr} |`;
        } else {
            line += " |";
        }

        fs.appendFileSync(logPath, line + "\n");
    } catch { /* never throw */ }
}

/**
 * Write a section header to the log.
 */
export function debugSection(title: string): void {
    try {
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
    } catch { /* never throw */ }
}

/**
 * Write a new session header (called once per app open).
 */
export function debugSessionStart(extra?: Record<string, any>): void {
    try {
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
    } catch { /* never throw */ }
}

/**
 * Log a code block (for prompts, responses, JSON payloads).
 */
export function debugCodeBlock(label: string, content: string, lang = ""): void {
    try {
        const logPath = getLogPath();
        if (!logPath) return;

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

        fs.appendFileSync(logPath, block + "\n");
    } catch { /* never throw */ }
}

/**
 * Log a list of items (for config files found, operations generated, etc.)
 */
export function debugList(label: string, items: string[]): void {
    try {
        const logPath = getLogPath();
        if (!logPath) return;

        const lines = [
            "",
            `**${label}** (${items.length}):`,
            ...items.map(i => `- ${i}`),
            "",
        ].join("\n");

        fs.appendFileSync(logPath, lines + "\n");
    } catch { /* never throw */ }
}
