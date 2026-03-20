/**
 * ProcessManager — Singleton that manages long-running background processes.
 *
 * Features:
 * - Ring buffer log storage (max 2MB per source per process)
 * - Tree-kill on stop (kills entire process group)
 * - Automatic cleanup on Electron app exit
 * - Ready detection (regex, port, http, or none)
 */

import { ChildProcess, spawn } from "node:child_process";
import path from "node:path";
import { createServer, type AddressInfo } from "node:net";
import log from "electron-log";
import { app } from "electron";

const logger = log.scope("process_manager");

// ============================================================================
// Constants
// ============================================================================

const MAX_LOG_BYTES = 2 * 1024 * 1024; // 2MB per source (stdout/stderr)
const KILL_GRACE_MS = 5_000; // Grace period before SIGKILL

// ============================================================================
// Types
// ============================================================================

export type ProcessState = "starting" | "running" | "stopped" | "crashed";

export interface ManagedProcess {
    id: string;
    cmd: string;
    args: string[];
    cwd: string;
    state: ProcessState;
    pid: number | undefined;
    startedAt: number;
    stoppedAt?: number;
    exitCode?: number | null;
    stdout: RingBuffer;
    stderr: RingBuffer;
    process: ChildProcess | null;
}

export interface ProcessInfo {
    id: string;
    cmd: string;
    args: string[];
    state: ProcessState;
    pid: number | undefined;
    uptime_ms: number;
    started_at: string;
    exit_code?: number | null;
}

// ============================================================================
// Ring Buffer — FIFO log storage with max byte limit
// ============================================================================

class RingBuffer {
    private chunks: string[] = [];
    private totalBytes = 0;

    constructor(private readonly maxBytes: number = MAX_LOG_BYTES) { }

    append(data: string): void {
        this.chunks.push(data);
        this.totalBytes += Buffer.byteLength(data);

        // Evict old chunks until we're under the limit
        while (this.totalBytes > this.maxBytes && this.chunks.length > 1) {
            const evicted = this.chunks.shift()!;
            this.totalBytes -= Buffer.byteLength(evicted);
        }
    }

    toString(): string {
        return this.chunks.join("");
    }

    get byteLength(): number {
        return this.totalBytes;
    }

    /** Get the last N characters of the buffer */
    tail(chars: number): string {
        const full = this.toString();
        return full.length > chars ? full.slice(-chars) : full;
    }
}

// ============================================================================
// ProcessManager Singleton
// ============================================================================

class ProcessManager {
    private static instance: ProcessManager;
    private processes = new Map<string, ManagedProcess>();
    private idCounter = 0;

    private constructor() {
        // Cleanup all processes when Electron exits
        app.on("before-quit", () => {
            logger.log("Cleaning up all managed processes...");
            for (const proc of this.processes.values()) {
                if (proc.process && proc.state !== "stopped") {
                    this.killTree(proc);
                }
            }
        });
    }

    static getInstance(): ProcessManager {
        if (!ProcessManager.instance) {
            ProcessManager.instance = new ProcessManager();
        }
        return ProcessManager.instance;
    }

    /**
     * Start a new background process.
     * Returns the process ID immediately. Use waitForReady() to wait for readiness.
     */
    start(opts: {
        cmd: string;
        args: string[];
        cwd: string;
        env: Record<string, string>;
    }): ManagedProcess {
        const id = `proc_${++this.idCounter}`;

        const managed: ManagedProcess = {
            id,
            cmd: opts.cmd,
            args: opts.args,
            cwd: opts.cwd,
            state: "starting",
            pid: undefined,
            startedAt: Date.now(),
            stdout: new RingBuffer(),
            stderr: new RingBuffer(),
            process: null,
        };

        try {
            const proc = spawn(opts.cmd, opts.args, {
                cwd: opts.cwd,
                env: opts.env,
                shell: false,
                stdio: ["ignore", "pipe", "pipe"],
                detached: true,
            });

            managed.process = proc;
            managed.pid = proc.pid;

            proc.stdout?.on("data", (data: Buffer) => {
                managed.stdout.append(data.toString());
            });

            proc.stderr?.on("data", (data: Buffer) => {
                managed.stderr.append(data.toString());
            });

            proc.on("close", (code) => {
                managed.exitCode = code;
                managed.stoppedAt = Date.now();
                if (managed.state !== "stopped") {
                    managed.state = code === 0 ? "stopped" : "crashed";
                    logger.log(
                        `Process ${id} ${managed.state}: exit_code=${code}`,
                    );
                }
                managed.process = null;
            });

            proc.on("error", (err) => {
                logger.error(`Process ${id} error: ${err.message}`);
                managed.state = "crashed";
                managed.process = null;
            });

            managed.state = "running";
            this.processes.set(id, managed);
            logger.log(
                `Started process ${id}: ${opts.cmd} ${opts.args.join(" ")} (pid: ${proc.pid})`,
            );
        } catch (err) {
            managed.state = "crashed";
            this.processes.set(id, managed);
            throw err;
        }

        return managed;
    }

    /**
     * Wait for a process to become ready.
     */
    async waitForReady(
        proc: ManagedProcess,
        ready: {
            type: "none" | "regex" | "port" | "http";
            value?: string;
            timeout_ms: number;
        },
    ): Promise<boolean> {
        if (ready.type === "none") return true;

        const deadline = Date.now() + ready.timeout_ms;

        switch (ready.type) {
            case "regex": {
                const pattern = new RegExp(ready.value ?? "");
                return new Promise<boolean>((resolve) => {
                    const checkInterval = setInterval(() => {
                        if (Date.now() > deadline) {
                            clearInterval(checkInterval);
                            resolve(false);
                            return;
                        }
                        if (proc.state === "crashed" || proc.state === "stopped") {
                            clearInterval(checkInterval);
                            resolve(false);
                            return;
                        }
                        const logs =
                            proc.stdout.toString() + proc.stderr.toString();
                        if (pattern.test(logs)) {
                            clearInterval(checkInterval);
                            resolve(true);
                        }
                    }, 500);
                });
            }

            case "port": {
                const port = parseInt(ready.value ?? "0", 10);
                if (!port) return false;
                return new Promise<boolean>((resolve) => {
                    const checkInterval = setInterval(() => {
                        if (Date.now() > deadline) {
                            clearInterval(checkInterval);
                            resolve(false);
                            return;
                        }
                        if (proc.state === "crashed" || proc.state === "stopped") {
                            clearInterval(checkInterval);
                            resolve(false);
                            return;
                        }
                        // Try connecting to the port
                        const testServer = createServer();
                        testServer.once("error", (err: NodeJS.ErrnoException) => {
                            if (err.code === "EADDRINUSE") {
                                // Port is in use = service is listening
                                clearInterval(checkInterval);
                                resolve(true);
                            }
                        });
                        testServer.once("listening", () => {
                            // Port is free = service not ready yet
                            testServer.close();
                        });
                        testServer.listen(port, "127.0.0.1");
                    }, 1000);
                });
            }

            case "http": {
                const url = ready.value ?? "http://localhost:3000";
                return new Promise<boolean>((resolve) => {
                    const checkInterval = setInterval(async () => {
                        if (Date.now() > deadline) {
                            clearInterval(checkInterval);
                            resolve(false);
                            return;
                        }
                        if (proc.state === "crashed" || proc.state === "stopped") {
                            clearInterval(checkInterval);
                            resolve(false);
                            return;
                        }
                        try {
                            const resp = await fetch(url, {
                                signal: AbortSignal.timeout(3000),
                            });
                            if (resp.ok || resp.status < 500) {
                                clearInterval(checkInterval);
                                resolve(true);
                            }
                        } catch {
                            // Not ready yet
                        }
                    }, 1000);
                });
            }

            default:
                return true;
        }
    }

    /**
     * Stop a managed process by ID.
     */
    stop(
        id: string,
        signal: "SIGTERM" | "SIGKILL" = "SIGTERM",
    ): boolean {
        const managed = this.processes.get(id);
        if (!managed) return false;
        if (!managed.process || managed.state === "stopped") return true;

        managed.state = "stopped";
        managed.stoppedAt = Date.now();
        this.killTree(managed, signal);
        return true;
    }

    /**
     * List all managed processes.
     */
    list(): ProcessInfo[] {
        return [...this.processes.values()].map((p) => ({
            id: p.id,
            cmd: p.cmd,
            args: p.args,
            state: p.state,
            pid: p.pid,
            uptime_ms: (p.stoppedAt ?? Date.now()) - p.startedAt,
            started_at: new Date(p.startedAt).toISOString(),
            exit_code: p.exitCode,
        }));
    }

    /**
     * Get a managed process by ID.
     */
    get(id: string): ManagedProcess | undefined {
        return this.processes.get(id);
    }

    /**
     * Get recent logs for a process.
     */
    getLogs(
        id: string,
        maxChars = 10_000,
    ): { stdout: string; stderr: string } | null {
        const proc = this.processes.get(id);
        if (!proc) return null;
        return {
            stdout: proc.stdout.tail(maxChars),
            stderr: proc.stderr.tail(maxChars),
        };
    }

    /**
     * Kill a process and its entire process tree.
     */
    private killTree(
        managed: ManagedProcess,
        signal: "SIGTERM" | "SIGKILL" = "SIGTERM",
    ): void {
        const proc = managed.process;
        if (!proc || !proc.pid) return;

        try {
            // Kill process group (negative PID)
            process.kill(-proc.pid, signal);
            logger.log(
                `Sent ${signal} to process group -${proc.pid} (${managed.id})`,
            );

            // If SIGTERM, schedule SIGKILL after grace period
            if (signal === "SIGTERM") {
                setTimeout(() => {
                    if (managed.process && managed.state !== "stopped") {
                        try {
                            process.kill(-proc.pid!, "SIGKILL");
                            logger.log(
                                `Force-killed process group -${proc.pid} (${managed.id})`,
                            );
                        } catch {
                            // Already dead
                        }
                    }
                }, KILL_GRACE_MS);
            }
        } catch {
            // Process may already be dead
            try {
                proc.kill(signal);
            } catch {
                // Truly dead
            }
        }
    }
}

export { ProcessManager };
