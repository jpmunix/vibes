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
}

export class OpenCodeManager {
  private instances = new Map<string, OpenCodeInstance>();
  private basePort = 4200;
  private nextPortOffset = 0;

  /**
   * Get or create an OpenCode instance for a user.
   */
  async getOrCreate(userId: string): Promise<{ port: number }> {
    const existing = this.instances.get(userId);
    if (existing && existing.process.exitCode === null) {
      return { port: existing.port };
    }

    // Clean up dead instance
    if (existing) {
      this.instances.delete(userId);
    }

    const port = this.basePort + this.nextPortOffset++;
    const workspaceDir = this.getWorkspaceDir(userId);

    console.log(`[OpenCode] Starting instance for ${userId} on port ${port}`);

    const proc = spawn("opencode", ["server", "--port", String(port)], {
      cwd: workspaceDir,
      env: {
        ...process.env,
        HOME: workspaceDir,
        OPENCODE_PORT: String(port),
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

    const instance: OpenCodeInstance = { port, process: proc, userId };
    this.instances.set(userId, instance);

    return { port };
  }

  /**
   * Restart a user's OpenCode instance.
   */
  async restart(userId: string): Promise<{ port: number }> {
    const existing = this.instances.get(userId);
    if (existing) {
      console.log(`[OpenCode] Restarting instance for ${userId}`);
      existing.process.kill("SIGTERM");
      this.instances.delete(userId);
      // Wait for process to die
      await new Promise<void>((resolve) => setTimeout(resolve, 500));
    }
    return this.getOrCreate(userId);
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
    return path.join(baseDir, userId);
  }
}
