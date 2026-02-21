/**
 * Process management tools — start_process, stop_process, list_processes.
 *
 * These tools use the ProcessManager singleton to manage background
 * processes like dev servers, build watchers, etc.
 */

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
import { ProcessManager } from "@/pro/main/utils/process_manager";

const logger = log.scope("process_management");

// ============================================================================
// Shared security — reuse allowlist from run_command
// ============================================================================

const ALLOWED_EXECUTABLES = new Set([
    "node", "npm", "npx", "pnpm", "yarn", "bun", "bunx",
    "vite", "next", "nuxt", "tsx",
    "supabase", "firebase", "wrangler",
]);

const BLOCKED_EXECUTABLES = new Set([
    "bash", "sh", "zsh", "fish", "csh", "ksh", "dash",
    "powershell", "pwsh", "cmd", "cmd.exe",
    "rm", "rmdir", "sudo", "su", "curl", "wget",
]);

function validateExecutable(cmd: string): void {
    const basename = path.basename(cmd).toLowerCase();
    if (BLOCKED_EXECUTABLES.has(basename)) {
        throw new ToolError(
            `Ejecutable bloqueado: '${cmd}'. No se permite ejecutar shells ni comandos destructivos como procesos background.`,
            { retryable: false },
        );
    }
    if (!ALLOWED_EXECUTABLES.has(basename)) {
        throw new ToolError(
            `Ejecutable no permitido como proceso background: '${cmd}'. Solo se permiten servidores de desarrollo y herramientas de build.`,
            { retryable: false, hint: `Allowed: ${[...ALLOWED_EXECUTABLES].join(", ")}` },
        );
    }
}

function validateCwd(cwd: string, projectRoot: string): string {
    const resolved = path.resolve(projectRoot, cwd);
    if (!resolved.startsWith(projectRoot)) {
        throw new ToolError(
            `El directorio '${cwd}' está fuera del proyecto.`,
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
        LANG: process.env.LANG ?? "en_US.UTF-8",
        TERM: "dumb",
        FORCE_COLOR: "1",
    };
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
// start_process
// ============================================================================

const startProcessSchema = z.object({
    cmd: z
        .string()
        .describe("The executable to run (e.g. 'npm', 'npx', 'node')."),
    args: z
        .array(z.string())
        .default([])
        .describe("Arguments to pass to the command."),
    cwd: z
        .string()
        .optional()
        .describe("Working directory relative to app root."),
    env: z
        .record(z.string(), z.string())
        .optional()
        .describe("Additional environment variables."),
    ready: z
        .object({
            type: z
                .enum(["none", "regex", "http", "port"])
                .default("none")
                .describe(
                    "How to detect readiness: 'none' (immediate), 'regex' (match stdout/stderr), 'port' (wait for port), 'http' (wait for HTTP response).",
                ),
            value: z
                .string()
                .optional()
                .describe(
                    "For regex: pattern to match. For port: port number. For http: URL.",
                ),
            timeout_ms: z
                .number()
                .int()
                .positive()
                .default(60_000)
                .describe("Max time to wait for readiness (default: 60s)."),
        })
        .default({ type: "none", timeout_ms: 60_000 }),
});

export const startProcessTool: ToolDefinition<
    z.infer<typeof startProcessSchema>
> = {
    name: "start_process",
    description: `Start a long-running background process (e.g. dev server, build watcher).

EXAMPLES:
- Dev server: { "cmd": "npm", "args": ["run", "dev"], "ready": { "type": "port", "value": "5173" } }
- Custom server: { "cmd": "node", "args": ["server.js"], "ready": { "type": "http", "value": "http://localhost:3001" } }
- Build watch: { "cmd": "npx", "args": ["tsc", "--watch"] }

The process runs in background until stopped with stop_process. Use list_processes to see running processes.`,
    inputSchema: startProcessSchema,
    defaultConsent: "ask",
    modifiesState: true,

    getConsentPreview: (args) => {
        const cmdStr = [args.cmd, ...args.args].join(" ");
        return `Iniciar proceso: ${cmdStr}`;
    },

    buildXml: (args, isComplete) => {
        if (!args.cmd) return undefined;
        const cmdStr = [args.cmd, ...(args.args ?? [])].join(" ");
        if (isComplete) return undefined;
        return `<dyad-start-process cmd="${escapeXmlAttr(cmdStr)}">Iniciando...</dyad-start-process>`;
    },

    execute: async (args, ctx: AgentContext) => {
        validateExecutable(args.cmd);
        const cwd = args.cwd
            ? validateCwd(args.cwd, ctx.appPath)
            : ctx.appPath;
        const env = buildSafeEnv(args.env as Record<string, string> | undefined);

        const pm = ProcessManager.getInstance();
        const proc = pm.start({
            cmd: args.cmd,
            args: args.args,
            cwd,
            env,
        });

        const cmdStr = [args.cmd, ...args.args].join(" ");
        logger.log(`Started process ${proc.id}: ${cmdStr}`);

        // Wait for readiness if configured
        let readyStatus = "started";
        if (args.ready.type !== "none") {
            const isReady = await pm.waitForReady(proc, args.ready);
            readyStatus = isReady ? "ready" : "timeout";
            if (!isReady) {
                logger.warn(`Process ${proc.id} did not become ready within ${args.ready.timeout_ms}ms`);
            }
        }

        const result = `Process ${proc.id} ${readyStatus} (pid: ${proc.pid}, cmd: ${cmdStr})`;

        // Get initial logs
        const logs = pm.getLogs(proc.id, 5000);
        const logsText = logs
            ? [
                logs.stdout.trim() ? `stdout:\n${logs.stdout.trim()}` : "",
                logs.stderr.trim() ? `stderr:\n${logs.stderr.trim()}` : "",
            ]
                .filter(Boolean)
                .join("\n")
            : "";

        ctx.onXmlComplete(
            `<dyad-start-process cmd="${escapeXmlAttr(cmdStr)}" process-id="${proc.id}" status="${readyStatus}">\n${escapeXmlContent(result + (logsText ? `\n\n${logsText}` : ""))}\n</dyad-start-process>`,
        );

        return result + (logsText ? `\n\nInitial logs:\n${logsText}` : "");
    },
};

// ============================================================================
// stop_process
// ============================================================================

const stopProcessSchema = z.object({
    process_id: z
        .string()
        .describe("The process ID returned by start_process."),
    signal: z
        .enum(["SIGTERM", "SIGKILL"])
        .default("SIGTERM")
        .describe(
            "Signal to send. SIGTERM allows graceful shutdown; SIGKILL forces immediate termination.",
        ),
});

export const stopProcessTool: ToolDefinition<
    z.infer<typeof stopProcessSchema>
> = {
    name: "stop_process",
    description:
        "Stop a background process started with start_process. Use list_processes to see running processes and their IDs.",
    inputSchema: stopProcessSchema,
    defaultConsent: "always",
    modifiesState: true,

    getConsentPreview: (args) =>
        `Detener proceso: ${args.process_id}`,

    buildXml: (args, isComplete) => {
        if (!args.process_id) return undefined;
        if (isComplete) return undefined;
        return `<dyad-stop-process process-id="${escapeXmlAttr(args.process_id)}">Deteniendo...</dyad-stop-process>`;
    },

    execute: async (args, ctx: AgentContext) => {
        const pm = ProcessManager.getInstance();
        const proc = pm.get(args.process_id);

        if (!proc) {
            throw new ToolError(
                `Proceso no encontrado: ${args.process_id}. Usa list_processes para ver los procesos disponibles.`,
                { retryable: false },
            );
        }

        const success = pm.stop(args.process_id, args.signal);
        const result = success
            ? `Process ${args.process_id} stopped successfully.`
            : `Process ${args.process_id} was already stopped.`;

        ctx.onXmlComplete(
            `<dyad-stop-process process-id="${escapeXmlAttr(args.process_id)}" status="stopped">${escapeXmlContent(result)}</dyad-stop-process>`,
        );

        return result;
    },
};

// ============================================================================
// list_processes
// ============================================================================

const listProcessesSchema = z.object({
    _placeholder: z.string().optional().describe("Not used. This tool takes no arguments."),
});

export const listProcessesTool: ToolDefinition<
    z.infer<typeof listProcessesSchema>
> = {
    name: "list_processes",
    description:
        "List all background processes managed by start_process. Shows process IDs, commands, states, and uptimes.",
    inputSchema: listProcessesSchema,
    defaultConsent: "always",

    getConsentPreview: () => "Listar procesos",

    buildXml: (_args, isComplete) => {
        if (isComplete) return undefined;
        return `<dyad-list-processes>Listando...</dyad-list-processes>`;
    },

    execute: async (_args, ctx: AgentContext) => {
        const pm = ProcessManager.getInstance();
        const processes = pm.list();

        if (processes.length === 0) {
            const result = "No background processes running.";
            ctx.onXmlComplete(
                `<dyad-list-processes count="0">${escapeXmlContent(result)}</dyad-list-processes>`,
            );
            return result;
        }

        const lines = processes.map((p) => {
            const uptimeSec = Math.round(p.uptime_ms / 1000);
            const cmdStr = [p.cmd, ...p.args].join(" ");
            return `${p.id} | ${p.state} | pid=${p.pid ?? "?"} | ${cmdStr} | uptime=${uptimeSec}s`;
        });

        const result = lines.join("\n");
        ctx.onXmlComplete(
            `<dyad-list-processes count="${processes.length}">\n${escapeXmlContent(result)}\n</dyad-list-processes>`,
        );

        return result;
    },
};
