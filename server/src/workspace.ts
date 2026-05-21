/**
 * Workspace Manager — Auto-provision user workspaces.
 *
 * On first login, creates the user's workspace directory structure
 * and symlinks shared scaffolds.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const SHARED_SCAFFOLDS = [
  "scaffold",
  "scaffold-vue",
  "scaffold-astro",
  "scaffold-svelte",
  "scaffold-express",
  "scaffold-next",
  "scaffold-react-beta",
  "scaffold-tools",
];

function getBaseWorkspacesDir(): string {
  if (process.env.VIBES_WORKSPACES_DIR) {
    return process.env.VIBES_WORKSPACES_DIR;
  }
  const prodDir = "/data/vibes/workspaces";
  try {
    if (fs.existsSync(prodDir)) {
      return prodDir;
    }
    if (fs.existsSync("/data")) {
      fs.accessSync("/data", fs.constants.W_OK);
      return prodDir;
    }
  } catch {}
  return path.join(os.homedir(), ".vibes", "workspaces");
}

function getSharedDir(): string {
  if (process.env.VIBES_SHARED_DIR) {
    return process.env.VIBES_SHARED_DIR;
  }
  const prodDir = "/data/vibes/shared";
  try {
    if (fs.existsSync(prodDir)) {
      return prodDir;
    }
    if (fs.existsSync("/data")) {
      fs.accessSync("/data", fs.constants.W_OK);
      return prodDir;
    }
  } catch {}
  return path.join(os.homedir(), ".vibes", "shared");
}

export class WorkspaceManager {
  private baseDir: string;
  private sharedDir: string;

  constructor() {
    this.baseDir = getBaseWorkspacesDir();
    this.sharedDir = getSharedDir();
  }

  /**
   * Ensure a user's workspace exists. Creates it + symlinks scaffolds if new.
   */
  async ensureWorkspace(userId: string): Promise<string> {
    const appsDir = this.getAppsDir(userId);

    if (!fs.existsSync(appsDir)) {
      await fs.promises.mkdir(appsDir, { recursive: true });
      console.log(`[Workspace] Created workspace for user ${userId}: ${appsDir}`);

      // Symlink shared scaffolds (read-only, saves disk space)
      for (const scaffold of SHARED_SCAFFOLDS) {
        const target = path.join(this.sharedDir, scaffold);
        const link = path.join(this.getUserDir(userId), scaffold);

        if (fs.existsSync(target) && !fs.existsSync(link)) {
          try {
            await fs.promises.symlink(target, link, "dir");
            console.log(`[Workspace] Symlinked ${scaffold} for user ${userId}`);
          } catch (err) {
            console.warn(`[Workspace] Failed to symlink ${scaffold}:`, err);
          }
        }
      }
    }

    return appsDir;
  }

  /**
   * Get the vibes-apps directory for a user.
   */
  getAppsDir(userId: string): string {
    return path.join(this.baseDir, userId, "vibes-apps");
  }

  /**
   * Get the base directory for a user.
   */
  getUserDir(userId: string): string {
    return path.join(this.baseDir, userId);
  }

  /**
   * List all user workspaces.
   */
  async listWorkspaces(): Promise<string[]> {
    if (!fs.existsSync(this.baseDir)) return [];
    const entries = await fs.promises.readdir(this.baseDir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  }
}
