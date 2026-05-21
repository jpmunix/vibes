/**
 * OpenCode Manager — Manages 1 OpenCode instance per user.
 *
 * Each user gets their own OpenCode process with an isolated workspace.
 * Restart one user's instance without affecting others.
 */
import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";

interface OpenCodeInstance {
  port: number;
  process: ChildProcess;
  userId: string;
  configString: string;
}

export class OpenCodeManager {
  private instances = new Map<string, OpenCodeInstance>();
  private basePort = 4200;
  private nextPortOffset = 0;

  /**
   * Get or create an OpenCode instance for a user.
   */
  async getOrCreate(userId: string, config: any, envVars: Record<string, string>): Promise<{ port: number }> {
    const configString = JSON.stringify(config);
    const existing = this.instances.get(userId);

    if (existing && existing.process.exitCode === null) {
      if (existing.configString === configString) {
        return { port: existing.port };
      }
      console.log(`[OpenCode] Configuration changed for ${userId}. Restarting...`);
      existing.process.kill("SIGTERM");
      this.instances.delete(userId);
      // Wait for process to die
      await new Promise<void>((resolve) => setTimeout(resolve, 500));
    } else if (existing) {
      this.instances.delete(userId);
    }

    const port = this.basePort + this.nextPortOffset++;
    const workspaceDir = this.getWorkspaceDir(userId);

    console.log(`[OpenCode] Starting instance for ${userId} on port ${port}`);

    // SECURE ENVIRONMENT INJECTION:
    // Only pass minimal environment variables (PATH, HOME) and the user-specific API keys
    const proc = spawn("opencode", ["serve", "--hostname=127.0.0.1", `--port=${port}`], {
      cwd: workspaceDir,
      env: {
        PATH: process.env.PATH,
        HOME: workspaceDir,
        OPENCODE_PORT: String(port),
        OPENCODE_CONFIG_CONTENT: configString,
        ...envVars,
      },
      stdio: "pipe",
    });

    proc.stdout?.on("data", (data: Buffer) => {
      console.log(`[OpenCode:${userId}] ${data.toString().trim()}`);
    });

    proc.stderr?.on("data", (data: Buffer) => {
      console.error(`[OpenCode:${userId}] ${data.toString().trim()}`);
    });

    proc.on("exit", (code, signal) => {
      console.warn(
        `[OpenCode] Instance for ${userId} exited (code=${code}, signal=${signal})`,
      );
      this.instances.delete(userId);
    });

    const instance: OpenCodeInstance = { port, process: proc, userId, configString };
    this.instances.set(userId, instance);

    // Wait slightly to verify start (or check if exits immediately)
    await new Promise<void>((resolve) => setTimeout(resolve, 300));

    return { port };
  }

  /**
   * Restart a user's OpenCode instance.
   */
  async restart(userId: string, config: any, envVars: Record<string, string>): Promise<{ port: number }> {
    const existing = this.instances.get(userId);
    if (existing) {
      console.log(`[OpenCode] Restarting instance for ${userId}`);
      existing.process.kill("SIGTERM");
      this.instances.delete(userId);
      // Wait for process to die
      await new Promise<void>((resolve) => setTimeout(resolve, 500));
    }
    return this.getOrCreate(userId, config, envVars);
  }

  /**
   * Stop all instances (used during server shutdown).
   */
  async stopAll(): Promise<void> {
    for (const [userId, instance] of this.instances) {
      console.log(`[OpenCode] Stopping instance for ${userId}`);
      instance.process.kill("SIGTERM");
    }
    this.instances.clear();
  }

  /**
   * Get the status of all instances.
   */
  getStatus(): Array<{ userId: string; port: number; alive: boolean }> {
    return Array.from(this.instances.entries()).map(([userId, inst]) => ({
      userId,
      port: inst.port,
      alive: inst.process.exitCode === null,
    }));
  }

  private getWorkspaceDir(userId: string): string {
    const baseDir = process.env.VIBES_WORKSPACES_DIR || "/data/vibes/workspaces";
    const dir = path.join(baseDir, userId);
    const fs = require("node:fs");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }
}
