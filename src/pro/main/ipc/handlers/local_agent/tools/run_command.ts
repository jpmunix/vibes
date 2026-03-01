/**
 * run_command tool — Safe foreground command execution.
 *
 * Security: 3-layer protection
 *  1. Allowlist of executables (blocks bash/sh/powershell)
 *  2. CWD jail (must be within project root)
 *  3. Minimal env (only PATH, HOME, NODE_OPTIONS)
 *
 * Always uses shell: false to prevent injection via chaining operators.
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { z } from "zod";
import log from "electron-log";
import {
    ToolDefinition,
    ToolError,
    AgentContext,
    escapeXmlAttr,
    escapeXmlContent,
} from "./types";

const logger = log.scope("run_command");

// ============================================================================
// Security: Executable allowlist
// ============================================================================

const ALLOWED_EXECUTABLES = new Set([
    "node",
    "npm",
    "npx",
    "pnpm",
    "yarn",
    "bun",
    "bunx",
    "git",
    "tsc",
    "tsx",
    "vite",
    "next",
    "nuxt",
    "eslint",
    "prettier",
    "jest",
    "vitest",
    "mocha",
    "playwright",
    "supabase",
    "firebase",
    "prisma",
    "drizzle-kit",
    "tailwindcss",
    "postcss",
    "esbuild",
    "swc",
    "turbo",
    "biome",
    "oxlint",
    "wrangler",
    "cat",
    "echo",
    "ls",
    "head",
    "tail",
    "wc",
    "find",
    "grep",
    "sort",
    "uniq",
    "which",
]);

/** Executables that are explicitly blocked even if they somehow bypass the allowlist */
const BLOCKED_EXECUTABLES = new Set([
    "bash",
    "sh",
    "zsh",
    "fish",
    "csh",
    "ksh",
    "dash",
    "powershell",
    "pwsh",
    "cmd",
    "cmd.exe",
    "powershell.exe",
    "rm",
    "rmdir",
    "del",
    "format",
    "mkfs",
    "dd",
    "sudo",
    "su",
    "doas",
    "curl",
    "wget",
]);

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_TIMEOUT_MS = 90_000;
const MAX_TIMEOUT_MS = 300_000;
const MAX_OUTPUT_BYTES = 50 * 1024; // 50KB

// ============================================================================
// Schema
// ============================================================================

const runCommandSchema = z.object({
    cmd: z
        .string()
        .describe("The executable to run (e.g. 'node', 'npm', 'npx', 'tsc')."),
    args: z
        .array(z.string())
        .default([])
        .describe("Arguments to pass to the command."),
    cwd: z
        .string()
        .optional()
        .describe(
            "Working directory relative to the app root. Defaults to the app root.",
        ),
    env: z
        .record(z.string(), z.string())
        .optional()
        .describe(
            "Additional environment variables to set. Will be merged with a minimal safe env.",
        ),
    timeout_ms: z
        .number()
        .int()
        .positive()
        .max(MAX_TIMEOUT_MS)
        .default(DEFAULT_TIMEOUT_MS)
        .describe(
            `Timeout in milliseconds (default: ${DEFAULT_TIMEOUT_MS}, max: ${MAX_TIMEOUT_MS}).`,
        ),
});

type RunCommandArgs = z.infer<typeof runCommandSchema>;

// ============================================================================
// Security helpers
// ============================================================================

function validateExecutable(cmd: string): void {
    const basename = path.basename(cmd).toLowerCase();

    if (BLOCKED_EXECUTABLES.has(basename)) {
        throw new ToolError(
            `Ejecutable bloqueado: '${cmd}'. No se permite ejecutar shells ni comandos destructivos.`,
            {
                retryable: false,
                hint: `Blocked executables: ${[...BLOCKED_EXECUTABLES].join(", ")}. Use a specific tool like 'node', 'npm', 'npx' instead.`,
            },
        );
    }

    if (!ALLOWED_EXECUTABLES.has(basename)) {
        throw new ToolError(
            `Ejecutable no permitido: '${cmd}'. Solo se permiten herramientas de desarrollo conocidas.`,
            {
                retryable: false,
                hint: `Allowed executables: ${[...ALLOWED_EXECUTABLES].slice(0, 20).join(", ")}... Use 'npx' to run project-local binaries.`,
            },
        );
    }
}

function validateCwd(cwd: string, projectRoot: string): string {
    const resolved = path.resolve(projectRoot, cwd);

    if (!resolved.startsWith(projectRoot)) {
        throw new ToolError(
            `El directorio de trabajo '${cwd}' está fuera del proyecto. Solo se permite ejecutar dentro de la raíz del proyecto.`,
            { retryable: false },
        );
    }

    return resolved;
}

function buildSafeEnv(
    userEnv?: Record<string, string>,
): Record<string, string> {
    const safeEnv: Record<string, string> = {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        NODE_OPTIONS: "--max-old-space-size=2048",
        // Preserve locale for proper output
        LANG: process.env.LANG ?? "en_US.UTF-8",
        TERM: "dumb",
        // Disable interactive prompts
        CI: "true",
        FORCE_COLOR: "0",
        NO_COLOR: "1",
    };

    // Merge user-provided env (cannot override PATH or HOME)
    if (userEnv) {
        for (const [key, value] of Object.entries(userEnv)) {
            if (key !== "PATH" && key !== "HOME") {
                safeEnv[key] = value;
            }
        }
    }

    return safeEnv;
}

// ============================================================================
// Execution
// ============================================================================

interface CommandResult {
    exit_code: number | null;
    stdout: string;
    stderr: string;
    duration_ms: number;
    truncated: boolean;
    timed_out: boolean;
}

function runProcess(
    cmd: string,
    args: string[],
    cwd: string,
    env: Record<string, string>,
    timeoutMs: number,
): Promise<CommandResult> {
    return new Promise((resolve) => {
        const startTime = Date.now();
        let stdoutBuf = "";
        let stderrBuf = "";
        let stdoutTruncated = false;
        let stderrTruncated = false;
        let timedOut = false;
        let resolved = false;

        const proc = spawn(cmd, args, {
            cwd,
            env,
            shell: false,
            stdio: ["ignore", "pipe", "pipe"],
            // Create new process group so we can kill the tree
            detached: true,
        });

        const timer = setTimeout(() => {
            timedOut = true;
            try {
                // Kill the process group (negative PID kills the group)
                if (proc.pid) {
                    process.kill(-proc.pid, "SIGKILL");
                }
            } catch {
                proc.kill("SIGKILL");
            }
        }, timeoutMs);

        proc.stdout?.on("data", (data: Buffer) => {
            if (stdoutBuf.length < MAX_OUTPUT_BYTES) {
                stdoutBuf += data.toString();
                if (stdoutBuf.length > MAX_OUTPUT_BYTES) {
                    stdoutBuf = stdoutBuf.slice(0, MAX_OUTPUT_BYTES);
                    stdoutTruncated = true;
                }
            }
        });

        proc.stderr?.on("data", (data: Buffer) => {
            if (stderrBuf.length < MAX_OUTPUT_BYTES) {
                stderrBuf += data.toString();
                if (stderrBuf.length > MAX_OUTPUT_BYTES) {
                    stderrBuf = stderrBuf.slice(0, MAX_OUTPUT_BYTES);
                    stderrTruncated = true;
                }
            }
        });

        const finish = (exitCode: number | null) => {
            if (resolved) return;
            resolved = true;
            clearTimeout(timer);
            resolve({
                exit_code: exitCode,
                stdout: stdoutBuf,
                stderr: stderrBuf,
                duration_ms: Date.now() - startTime,
                truncated: stdoutTruncated || stderrTruncated,
                timed_out: timedOut,
            });
        };

        proc.on("close", (code) => finish(code));
        proc.on("error", (err) => {
            logger.error(`Process error: ${err.message}`);
            finish(null);
        });
    });
}

// ============================================================================
// Tool Description
// ============================================================================

const DESCRIPTION = `Execute a shell command safely in the project directory.

RULES:
- Only allowed executables: node, npm, npx, pnpm, yarn, git, tsc, eslint, prettier, vitest, etc.
- Shells (bash, sh, zsh, powershell) are BLOCKED.
- The working directory must be within the project root.
- Commands run with shell: false (no chaining with &&, ||, ;, |).
- Use 'npx' to run any project-local binary (e.g. npx tsc --noEmit).

EXAMPLES:
- Type-check: { "cmd": "npx", "args": ["tsc", "--noEmit"] }
- Lint: { "cmd": "npx", "args": ["eslint", "src/", "--fix"] }
- Format: { "cmd": "npx", "args": ["prettier", "--write", "src/"] }
- Test: { "cmd": "npx", "args": ["vitest", "run"] }
- Build: { "cmd": "npm", "args": ["run", "build"] }
`;

// ============================================================================
// Tool Definition
// ============================================================================

export const runCommandTool: ToolDefinition<RunCommandArgs> = {
    name: "run_command",
    description: DESCRIPTION,
    inputSchema: runCommandSchema,
    defaultConsent: "ask",
    modifiesState: true,

    getConsentPreview: (args) => {
        const cmdStr = [args.cmd, ...args.args].join(" ");
        return `Ejecutar: ${cmdStr}`;
    },

    buildXml: (args, isComplete) => {
        if (!args.cmd) return undefined;
        const cmdStr = [args.cmd, ...(args.args ?? [])].join(" ");
        const cwdAttr = args.cwd
            ? ` cwd="${escapeXmlAttr(args.cwd)}"`
            : "";

        if (isComplete) return undefined; // onXmlComplete handles final
        return `<dyad-run-command cmd="${escapeXmlAttr(cmdStr)}"${cwdAttr}>Ejecutando...</dyad-run-command>`;
    },

    execute: async (args, ctx: AgentContext) => {
        // Layer 1: Validate executable
        validateExecutable(args.cmd);

        // Layer 2: Validate and resolve CWD
        const cwd = args.cwd
            ? validateCwd(args.cwd, ctx.appPath)
            : ctx.appPath;

        // Layer 3: Build safe env
        const env = buildSafeEnv(args.env as Record<string, string> | undefined);

        // Layer 4: Inject integration credentials so user scripts can authenticate
        if (ctx.pocketbaseConfig) {
            env.POCKETBASE_URL = ctx.pocketbaseConfig.url;
            env.POCKETBASE_ADMIN_EMAIL = ctx.pocketbaseConfig.adminEmail;
            env.POCKETBASE_ADMIN_PASSWORD = ctx.pocketbaseConfig.adminPassword;
        }
        if (ctx.bunnyConfig) {
            const db0 = ctx.bunnyConfig.databases[0];
            if (db0) {
                env.BUNNY_DB_URL = db0.databaseUrl;
                env.BUNNY_DB_TOKEN = db0.fullAccessToken;
            }
        }

        const cmdStr = [args.cmd, ...args.args].join(" ");
        logger.log(`Executing: ${cmdStr} (cwd: ${cwd}, timeout: ${args.timeout_ms}ms)`);

        const result = await runProcess(
            args.cmd,
            args.args,
            cwd,
            env,
            args.timeout_ms,
        );

        logger.log(
            `Command finished: exit_code=${result.exit_code}, duration=${result.duration_ms}ms, timed_out=${result.timed_out}`,
        );

        // Build output text
        const parts: string[] = [];
        if (result.timed_out) {
            parts.push(`⏱ TIMEOUT after ${result.duration_ms}ms`);
        }
        parts.push(`Exit code: ${result.exit_code ?? "unknown"}`);
        parts.push(`Duration: ${result.duration_ms}ms`);

        if (result.stdout.trim()) {
            parts.push(`\n--- stdout ---\n${result.stdout.trim()}`);
        }
        if (result.stderr.trim()) {
            parts.push(`\n--- stderr ---\n${result.stderr.trim()}`);
        }
        if (result.truncated) {
            parts.push(`\n[Output truncated to ${MAX_OUTPUT_BYTES / 1024}KB]`);
        }

        const outputText = parts.join("\n");

        // Write XML for UI
        const exitAttr = result.exit_code !== null
            ? ` exit-code="${result.exit_code}"`
            : "";
        const durationAttr = ` duration="${result.duration_ms}ms"`;
        const statusAttr = result.timed_out
            ? ` status="timeout"`
            : result.exit_code === 0
                ? ` status="success"`
                : ` status="error"`;

        ctx.onXmlComplete(
            `<dyad-run-command cmd="${escapeXmlAttr(cmdStr)}"${exitAttr}${durationAttr}${statusAttr}>\n${escapeXmlContent(outputText)}\n</dyad-run-command>`,
        );

        return outputText;
    },
};
