import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { IS_TEST_BUILD } from "../ipc/utils/test_utils";

let migrationAttempted = false;

/**
 * Migrate ~/dyad-apps → ~/vibes-apps if the old directory exists.
 * Runs once per app lifecycle, silently skips if already migrated or
 * if both directories exist (to avoid data loss).
 */
function migrateDyadAppsDir(newDir: string): void {
  if (migrationAttempted) return;
  migrationAttempted = true;

  try {
    const oldDir = newDir.replace(/vibes-apps$/, "dyad-apps");
    if (
      fs.existsSync(oldDir) &&
      fs.statSync(oldDir).isDirectory() &&
      !fs.existsSync(newDir)
    ) {
      fs.renameSync(oldDir, newDir);
      console.log(`[migration] Renamed ${oldDir} → ${newDir}`);
    }
  } catch (err) {
    console.error("[migration] Failed to rename dyad-apps → vibes-apps:", err);
  }
}

/**
 * Gets the base vibes-apps directory path (without a specific app subdirectory)
 */
export function getVibesAppsBaseDirectory(): string {
  if (IS_TEST_BUILD) {
    const electron = getElectron();
    return path.join(electron!.app.getPath("userData"), "vibes-apps");
  }
  const dir = path.join(os.homedir(), "vibes-apps");
  migrateDyadAppsDir(dir);
  return dir;
}

export function getVibesAppPath(appPath: string): string {
  // If appPath is already absolute, use it as-is
  if (path.isAbsolute(appPath)) {
    return appPath;
  }
  // Otherwise, use the default base path
  return path.join(getVibesAppsBaseDirectory(), appPath);
}

export function getTypeScriptCachePath(): string {
  const electron = getElectron();
  return path.join(electron!.app.getPath("sessionData"), "typescript-cache");
}

/**
 * Gets the user data path, handling both Electron and non-Electron environments
 * In Electron: returns the app's userData directory
 * In non-Electron: returns "./userData" in the current directory
 */

export function getUserDataPath(): string {
  const electron = getElectron();

  // When running in Electron and app is ready
  if (electron) {
    return electron!.app.getPath("userData");
  }

  // For when the Electron app object isn't available
  return path.resolve("./userData");
}

/**
 * Get a reference to electron in a way that won't break in non-electron environments
 */
export function getElectron(): typeof import("electron") | undefined {
  let electron: typeof import("electron") | undefined;
  try {
    // Check if we're in an Electron environment
    if (process.versions.electron) {
      electron = require("electron");
    }
  } catch {
    // Not in Electron environment
  }
  return electron;
}
