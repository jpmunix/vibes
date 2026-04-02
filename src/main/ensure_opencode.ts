/**
 * OpenCode Binary Auto-Installer & Updater
 *
 * Checks if the `opencode` CLI is available in the system PATH.
 * If not, installs it to a user-local prefix (~/.local/share/vibes/opencode)
 * and adds the bin directory to PATH.
 *
 * Also checks for updates every 36 hours and auto-updates if a new version
 * is available.
 *
 * This is called during the splash screen startup sequence.
 */

import { exec } from "node:child_process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as path from "node:path";
import * as fs from "node:fs";
import log from "electron-log";
import { app } from "electron";
import { readSettings, writeSettings } from "./settings";

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);
const logger = log.scope("ensure_opencode");

/** How often we check for updates (36 hours in ms) */
const UPDATE_CHECK_INTERVAL_MS = 36 * 60 * 60 * 1000;

/**
 * Get the local install prefix for opencode.
 * Uses Electron's userData path so it persists across updates.
 */
function getOpenCodePrefix(): string {
    return path.join(app.getPath("userData"), "opencode");
}

/**
 * Get the bin directory where opencode binary will be after install.
 */
function getOpenCodeBinDir(): string {
    return path.join(getOpenCodePrefix(), "bin");
}

/**
 * Prepend NVM bin directories to PATH so we can find npm/node
 * even when launched from a GUI context (not a terminal).
 * Also prepends our local opencode bin dir.
 */
function ensurePathDirs(): void {
    const HOME = process.env.HOME || "/home/" + process.env.USER;
    const nvmDir = path.join(HOME, ".nvm/versions/node");
    const dirsToAdd: string[] = [];

    // Add our local opencode bin dir
    dirsToAdd.push(getOpenCodeBinDir());

    try {
        if (fs.existsSync(nvmDir)) {
            const versions = fs.readdirSync(nvmDir);
            versions.sort((a: string, b: string) => {
                const numA = a.replace("v", "").split(".").map(Number);
                const numB = b.replace("v", "").split(".").map(Number);
                for (let i = 0; i < Math.max(numA.length, numB.length); i++) {
                    const partA = numA[i] || 0;
                    const partB = numB[i] || 0;
                    if (partA !== partB) return partB - partA;
                }
                return 0;
            });

            const nvmBins = versions.map((v: string) => path.join(nvmDir, v, "bin"));
            dirsToAdd.push(...nvmBins);
            logger.info(`Injected ${nvmBins.length} NVM bin dirs (latest: ${versions[0]})`);
        }
    } catch (e) {
        logger.warn("Could not scan NVM dirs:", e);
    }

    // Also add node_modules/.bin from our prefix (npm --prefix puts binaries here)
    const localBinDir = path.join(getOpenCodePrefix(), "node_modules", ".bin");
    dirsToAdd.push(localBinDir);

    const currentPath = process.env.PATH || "";
    process.env.PATH = [...dirsToAdd, currentPath].join(":");
}

/**
 * Check if `opencode` binary is available in PATH.
 */
async function isOpenCodeInstalled(): Promise<boolean> {
    try {
        const cmd = process.platform === "win32" ? "where" : "which";
        await execFileAsync(cmd, ["opencode"]);
        return true;
    } catch {
        return false;
    }
}

/**
 * Get the installed version of the opencode binary.
 */
async function getInstalledVersion(): Promise<string | null> {
    try {
        const { stdout } = await execAsync("opencode --version");
        // Output format varies: "opencode v1.3.13" or just "1.3.13"
        const match = stdout.trim().match(/(\d+\.\d+\.\d+)/);
        return match ? match[1] : null;
    } catch {
        return null;
    }
}

/**
 * Get the latest published version from npm registry.
 */
async function getLatestNpmVersion(): Promise<string | null> {
    try {
        const { stdout } = await execAsync("npm view opencode-ai version", {
            timeout: 15_000,
        });
        return stdout.trim();
    } catch {
        return null;
    }
}

/**
 * Run npm install to install or update opencode-ai.
 */
async function npmInstallOpenCode(): Promise<boolean> {
    const prefix = getOpenCodePrefix();
    try {
        fs.mkdirSync(prefix, { recursive: true });
    } catch (e: any) {
        logger.error(`Failed to create prefix dir ${prefix}: ${e.message}`);
        return false;
    }

    try {
        const cmd = `npm install --prefix ${JSON.stringify(prefix)} opencode-ai@latest`;
        logger.info(`Running: ${cmd}`);

        const { stdout, stderr } = await execAsync(cmd, {
            env: { ...process.env },
            timeout: 120_000,
        });

        if (stdout) logger.info("npm stdout:", stdout.trim());
        if (stderr) logger.warn("npm stderr:", stderr.trim());

        // Verify binary exists
        const localBinDir = path.join(prefix, "node_modules", ".bin");
        if (fs.existsSync(path.join(localBinDir, "opencode"))) {
            process.env.PATH = `${localBinDir}:${process.env.PATH}`;
            return true;
        }

        const prefixBinDir = getOpenCodeBinDir();
        if (fs.existsSync(path.join(prefixBinDir, "opencode"))) {
            return true;
        }

        logger.error("opencode install command succeeded but binary not found");
        return false;
    } catch (error: any) {
        logger.error("Failed to install opencode:", error.message);
        return false;
    }
}

/**
 * Check if an update check is needed (based on 36h interval).
 */
function shouldCheckForUpdate(): boolean {
    const settings = readSettings();
    const lastCheck = settings.lastOpenCodeUpdateCheck;
    if (!lastCheck) return true;

    const lastCheckTime = new Date(lastCheck as string).getTime();
    return Date.now() - lastCheckTime > UPDATE_CHECK_INTERVAL_MS;
}

/**
 * Ensure OpenCode CLI is installed and up-to-date.
 *
 * - If not installed → install
 * - If installed but outdated (checked every 36h) → update
 *
 * @returns Object with installation status and version info
 */
export async function ensureOpenCodeInstalled(): Promise<{
    ok: boolean;
    version: string | null;
    updated?: boolean;
}> {
    ensurePathDirs();

    const installed = await isOpenCodeInstalled();

    if (!installed) {
        // Fresh install
        logger.info("opencode binary NOT found — installing to local prefix...");
        const success = await npmInstallOpenCode();
        if (success) {
            const version = await getInstalledVersion();
            logger.info(`opencode installed successfully (v${version}) ✓`);
            writeSettings({ lastOpenCodeUpdateCheck: new Date().toISOString() });
            return { ok: true, version, updated: true };
        }
        return { ok: false, version: null };
    }

    // Already installed — check for updates if interval elapsed
    const currentVersion = await getInstalledVersion();
    logger.info(`opencode binary found in PATH (v${currentVersion}) ✓`);

    if (shouldCheckForUpdate()) {
        logger.info("Checking for opencode updates...");
        const latestVersion = await getLatestNpmVersion();

        if (latestVersion && currentVersion && latestVersion !== currentVersion) {
            logger.info(`opencode update available: v${currentVersion} → v${latestVersion}`);
            const success = await npmInstallOpenCode();
            if (success) {
                const newVersion = await getInstalledVersion();
                logger.info(`opencode updated to v${newVersion} ✓`);
                writeSettings({ lastOpenCodeUpdateCheck: new Date().toISOString() });
                return { ok: true, version: newVersion, updated: true };
            }
            // Update failed but old version still works
            writeSettings({ lastOpenCodeUpdateCheck: new Date().toISOString() });
            return { ok: true, version: currentVersion };
        } else {
            logger.info(`opencode is up to date (v${currentVersion})`);
            writeSettings({ lastOpenCodeUpdateCheck: new Date().toISOString() });
        }
    }

    return { ok: true, version: currentVersion };
}
