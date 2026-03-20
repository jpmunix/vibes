/**
 * OpenCode Binary Auto-Installer
 *
 * Checks if the `opencode` CLI is available in the system PATH.
 * If not, installs it to a user-local prefix (~/.local/share/vibes/opencode)
 * and adds the bin directory to PATH.
 *
 * This avoids permission issues with `npm install -g` (which needs root on
 * systems where npm's global prefix is /usr/lib/node_modules/).
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

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);
const logger = log.scope("ensure_opencode");

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
 * Ensure OpenCode CLI is installed. If not, install it to a local prefix.
 *
 * @returns `true` if opencode is available (already existed or was installed),
 *          `false` if installation failed (non-fatal).
 */
export async function ensureOpenCodeInstalled(): Promise<boolean> {
    ensurePathDirs();

    // Check if already installed (either globally or in our local prefix)
    if (await isOpenCodeInstalled()) {
        logger.info("opencode binary found in PATH ✓");
        return true;
    }

    logger.info("opencode binary NOT found — installing to local prefix...");

    const prefix = getOpenCodePrefix();

    // Ensure prefix directory exists
    try {
        fs.mkdirSync(prefix, { recursive: true });
    } catch (e: any) {
        logger.error(`Failed to create prefix dir ${prefix}: ${e.message}`);
        return false;
    }

    try {
        // Install to local prefix (no root required)
        // --prefix installs the package under our user-writable directory
        const cmd = `npm install --prefix ${JSON.stringify(prefix)} opencode-ai`;
        logger.info(`Running: ${cmd}`);

        const { stdout, stderr } = await execAsync(cmd, {
            env: { ...process.env },
            timeout: 120_000, // 2 minute timeout
        });

        if (stdout) logger.info("npm stdout:", stdout.trim());
        if (stderr) logger.warn("npm stderr:", stderr.trim());

        // npm --prefix puts the binary in <prefix>/node_modules/.bin/
        // We need to symlink or add that path too
        const localBinDir = path.join(prefix, "node_modules", ".bin");
        if (fs.existsSync(path.join(localBinDir, "opencode"))) {
            // Add the local bin dir to PATH
            process.env.PATH = `${localBinDir}:${process.env.PATH}`;
            logger.info(`opencode installed successfully at ${localBinDir} ✓`);
            return true;
        }

        // Also check the standard prefix bin dir
        const prefixBinDir = getOpenCodeBinDir();
        if (fs.existsSync(path.join(prefixBinDir, "opencode"))) {
            logger.info(`opencode installed successfully at ${prefixBinDir} ✓`);
            return true;
        }

        logger.error("opencode install command succeeded but binary not found");
        // Log what's in the prefix for debugging
        try {
            const binContents = fs.existsSync(localBinDir) ? fs.readdirSync(localBinDir) : [];
            logger.info(`Contents of ${localBinDir}: ${binContents.join(", ") || "(empty)"}`);
        } catch { /* ignore */ }
        return false;
    } catch (error: any) {
        logger.error("Failed to install opencode:", error.message);
        return false;
    }
}
