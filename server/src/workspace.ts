/**
 * Workspace Manager — Auto-provision user workspaces.
 *
 * On first login, creates the user's workspace directory structure
 * and symlinks shared scaffolds.
 */
import fs from "node:fs";
import path from "node:path";

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

export class WorkspaceManager {
  private baseDir: string;
  private sharedDir: string;

  constructor() {
    this.baseDir = process.env.VIBES_WORKSPACES_DIR || "/data/vibes/workspaces";
    this.sharedDir = process.env.VIBES_SHARED_DIR || "/data/vibes/shared";
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
