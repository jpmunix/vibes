/**
 * Node.js Runtime Manager
 *
 * Ensures that Node.js (node + npm) is available for Vibes to function.
 * Two-phase strategy:
 *
 * 1. **System Scan** — Checks PATH + well-known install locations for an
 *    existing Node.js installation (Homebrew, NVM, fnm, Volta, mise, etc.)
 * 2. **Portable Fallback** — If no system Node is found, downloads the
 *    official standalone Node.js binary to userData/node-runtime/ and uses
 *    it as a local runtime.
 *
 * Called during the splash screen startup sequence on every launch.
 * The scan is fast (~10ms). The download only happens once.
 */

import * as path from "node:path";
import * as fs from "node:fs";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { app } from "electron";
import log from "electron-log";
import fixPath from "fix-path";

const logger = log.scope("node_runtime");

// ─── Constants ──────────────────────────────────────────────────────────────
// Single source of truth for the Node.js version used by Vibes.
// This is the version downloaded as a portable runtime AND recommended
// to users in the SetupBanner for manual installation.
export const NODE_VERSION = "22.14.0";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface NodeRuntimeResult {
    /** Absolute path to the `node` binary */
    nodeBinDir: string;
    /** How Node was found */
    source: "system" | "portable";
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Ensure Node.js is available in process.env.PATH.
 *
 * 1. Fix PATH for GUI-launched apps (macOS fix-path)
 * 2. Scan well-known install directories
 * 3. If no system Node → check for existing portable runtime
 * 4. If no portable → download and extract
 *
 * @param onProgress - Callback for splash screen messages (e.g. "Instalando Node.js...")
 * @returns The bin directory and source of the Node.js installation
 */
export async function ensureNodeRuntime(
    onProgress?: (msg: string) => void,
): Promise<NodeRuntimeResult> {
    // Phase 0: Fix PATH for macOS GUI apps (reads login shell PATH)
    try {
        fixPath();
    } catch (e) {
        logger.warn("fix-path failed (non-fatal):", e);
    }

    // Phase 1: Inject well-known Node install dirs into PATH
    injectKnownNodePaths();

    // Phase 2: Check if node is now accessible
    const systemNode = findNodeInPath();
    if (systemNode) {
        logger.info(`System Node.js found: ${systemNode}`);
        return { nodeBinDir: path.dirname(systemNode), source: "system" };
    }

    // Phase 3: Check for existing portable runtime
    const portableBinDir = getPortableBinDir();
    const portableNodeBin = path.join(portableBinDir, "node");
    if (fs.existsSync(portableNodeBin)) {
        prependToPath(portableBinDir);
        logger.info(`Portable Node.js found at: ${portableBinDir}`);
        return { nodeBinDir: portableBinDir, source: "portable" };
    }

    // Phase 4: Download portable Node.js
    logger.info("No Node.js found — downloading portable runtime...");
    onProgress?.("Instalando Node.js...");

    const success = await downloadAndExtractNode(onProgress);
    if (success && fs.existsSync(portableNodeBin)) {
        prependToPath(portableBinDir);
        logger.info(`Portable Node.js installed at: ${portableBinDir}`);
        return { nodeBinDir: portableBinDir, source: "portable" };
    }

    // If download failed, return the best we have (bin dir will be added to PATH
    // but node won't be there — downstream code will handle gracefully)
    logger.error("Failed to provision Node.js runtime");
    return { nodeBinDir: portableBinDir, source: "portable" };
}

/**
 * Get the bin directory of the portable Node.js runtime (if any).
 * Can be used to check whether a portable runtime exists.
 */
export function getPortableNodeBinDir(): string | null {
    const binDir = getPortableBinDir();
    return fs.existsSync(path.join(binDir, "node")) ? binDir : null;
}

// ─── Internal: Path Scanning ────────────────────────────────────────────────

/**
 * Inject well-known Node.js installation directories into process.env.PATH.
 * This covers all major version managers and installers across macOS and Linux.
 * Windows paths are included but only activated on win32.
 */
function injectKnownNodePaths(): void {
    const HOME = process.env.HOME || process.env.USERPROFILE || `/home/${process.env.USER}`;
    const dirsToAdd: string[] = [];

    // ─── Homebrew ────────────────────────────────────────────────────
    // Apple Silicon: /opt/homebrew/bin
    // Intel macOS:   /usr/local/bin (also used by official Node installer)
    if (process.platform === "darwin") {
        dirsToAdd.push("/opt/homebrew/bin");
    }
    dirsToAdd.push("/usr/local/bin");

    // ─── NVM ─────────────────────────────────────────────────────────
    const nvmDir = path.join(HOME, ".nvm/versions/node");
    try {
        if (fs.existsSync(nvmDir)) {
            const versions = fs.readdirSync(nvmDir);
            // Sort descending so latest version is first in PATH
            versions.sort((a, b) => {
                const numA = a.replace("v", "").split(".").map(Number);
                const numB = b.replace("v", "").split(".").map(Number);
                for (let i = 0; i < Math.max(numA.length, numB.length); i++) {
                    if ((numA[i] || 0) !== (numB[i] || 0)) return (numB[i] || 0) - (numA[i] || 0);
                }
                return 0;
            });
            const nvmBins = versions.map(v => path.join(nvmDir, v, "bin"));
            dirsToAdd.push(...nvmBins);
            if (versions.length > 0) {
                logger.info(`Found ${nvmBins.length} NVM versions (latest: ${versions[0]})`);
            }
        }
    } catch (e) {
        logger.warn("Could not scan NVM dirs:", e);
    }

    // ─── fnm ─────────────────────────────────────────────────────────
    const fnmDir = path.join(HOME, ".fnm/aliases/default/bin");
    if (fs.existsSync(fnmDir)) {
        dirsToAdd.push(fnmDir);
    }

    // ─── Volta ───────────────────────────────────────────────────────
    const voltaDir = path.join(HOME, ".volta/bin");
    if (fs.existsSync(voltaDir)) {
        dirsToAdd.push(voltaDir);
    }

    // ─── mise (formerly rtx) ─────────────────────────────────────────
    const miseDir = path.join(HOME, ".local/share/mise/shims");
    if (fs.existsSync(miseDir)) {
        dirsToAdd.push(miseDir);
    }

    // ─── asdf ────────────────────────────────────────────────────────
    const asdfDir = path.join(HOME, ".asdf/shims");
    if (fs.existsSync(asdfDir)) {
        dirsToAdd.push(asdfDir);
    }

    // ─── nodenv ──────────────────────────────────────────────────────
    const nodenvDir = path.join(HOME, ".nodenv/shims");
    if (fs.existsSync(nodenvDir)) {
        dirsToAdd.push(nodenvDir);
    }

    // ─── Windows (prepared for future) ───────────────────────────────
    if (process.platform === "win32") {
        const programFiles = process.env.PROGRAMFILES || "C:\\Program Files";
        dirsToAdd.push(path.join(programFiles, "nodejs"));
        const appData = process.env.APPDATA;
        if (appData) {
            dirsToAdd.push(path.join(appData, "nvm"));
            // fnm on Windows
            dirsToAdd.push(path.join(appData, "fnm_multishells"));
        }
    }

    // ─── Portable runtime (our own) ──────────────────────────────────
    dirsToAdd.push(getPortableBinDir());

    // Prepend all found dirs to PATH
    const validDirs = dirsToAdd.filter(d => {
        try { return fs.existsSync(d); } catch { return false; }
    });

    if (validDirs.length > 0) {
        const currentPath = process.env.PATH || "";
        process.env.PATH = [...validDirs, currentPath].join(path.delimiter);
        logger.debug(`Injected ${validDirs.length} dirs into PATH`);
    }
}

/**
 * Try to find the `node` binary in the current PATH.
 * Returns the absolute path to the binary, or null if not found.
 */
function findNodeInPath(): string | null {
    const pathDirs = (process.env.PATH || "").split(path.delimiter);
    const nodeBin = process.platform === "win32" ? "node.exe" : "node";

    for (const dir of pathDirs) {
        if (!dir) continue;
        const candidate = path.join(dir, nodeBin);
        try {
            if (fs.existsSync(candidate)) {
                // Verify it's actually executable
                fs.accessSync(candidate, fs.constants.X_OK);
                return candidate;
            }
        } catch {
            // Not executable or can't access — continue
        }
    }
    return null;
}

// ─── Internal: Portable Runtime ─────────────────────────────────────────────

/**
 * Get the base directory where the portable Node.js runtime lives.
 */
function getPortableBaseDir(): string {
    return path.join(app.getPath("userData"), "node-runtime");
}

/**
 * Get the bin directory inside the extracted Node.js archive.
 * Layout: node-runtime/node-v{VERSION}-{platform}-{arch}/bin/
 */
function getPortableBinDir(): string {
    const platform = process.platform === "win32" ? "win" : process.platform;
    const archMap: Record<string, string> = {
        x64: "x64",
        arm64: "arm64",
        ia32: "x86",
    };
    const arch = archMap[process.arch] || process.arch;
    const dirName = `node-v${NODE_VERSION}-${platform}-${arch}`;

    // On Unix, the binary is inside a bin/ subdirectory
    // On Windows, it's at the root of the extracted folder
    if (process.platform === "win32") {
        return path.join(getPortableBaseDir(), dirName);
    }
    return path.join(getPortableBaseDir(), dirName, "bin");
}

/**
 * Get the download URL for the Node.js archive.
 */
function getDownloadUrl(): string {
    const platform = process.platform;
    const arch = process.arch;

    if (platform === "darwin") {
        return `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-darwin-${arch}.tar.gz`;
    }
    if (platform === "linux") {
        return `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${arch}.tar.xz`;
    }
    if (platform === "win32") {
        const winArch = arch === "arm64" ? "arm64" : "x64";
        return `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-${winArch}.zip`;
    }

    throw new Error(`Unsupported platform: ${platform}-${arch}`);
}

/**
 * Download and extract the Node.js portable runtime.
 */
async function downloadAndExtractNode(
    onProgress?: (msg: string) => void,
): Promise<boolean> {
    const url = getDownloadUrl();
    const baseDir = getPortableBaseDir();

    try {
        // Ensure the base directory exists
        fs.mkdirSync(baseDir, { recursive: true });

        logger.info(`Downloading Node.js from: ${url}`);
        onProgress?.("Instalando Node.js...");

        const response = await fetch(url);
        if (!response.ok || !response.body) {
            logger.error(`Download failed: ${response.status} ${response.statusText}`);
            return false;
        }

        if (process.platform === "win32") {
            // Windows: download zip and extract
            return await downloadAndExtractZip(response, baseDir);
        } else if (url.endsWith(".tar.xz")) {
            // Linux: .tar.xz
            return await downloadAndExtractTarXz(response, baseDir);
        } else {
            // macOS: .tar.gz
            return await downloadAndExtractTarGz(response, baseDir);
        }
    } catch (error: any) {
        logger.error("Failed to download/extract Node.js:", error.message);
        return false;
    }
}

/**
 * Extract a .tar.gz archive (macOS).
 * Uses native tar command for reliability.
 */
async function downloadAndExtractTarGz(
    response: Response,
    extractDir: string,
): Promise<boolean> {
    const { execFileSync } = await import("node:child_process");
    const tmpFile = path.join(extractDir, `node-download-${Date.now()}.tar.gz`);

    try {
        // Save to temp file
        const arrayBuffer = await response.arrayBuffer();
        fs.writeFileSync(tmpFile, Buffer.from(arrayBuffer));

        // Extract using system tar (more reliable than JS tar libraries)
        execFileSync("tar", ["xzf", tmpFile, "-C", extractDir], {
            timeout: 120_000,
        });

        logger.info("Node.js tar.gz extracted successfully");
        return true;
    } finally {
        // Clean up temp file
        try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
    }
}

/**
 * Extract a .tar.xz archive (Linux).
 * Uses native tar command which handles xz natively.
 */
async function downloadAndExtractTarXz(
    response: Response,
    extractDir: string,
): Promise<boolean> {
    const { execFileSync } = await import("node:child_process");
    const tmpFile = path.join(extractDir, `node-download-${Date.now()}.tar.xz`);

    try {
        // Save to temp file
        const arrayBuffer = await response.arrayBuffer();
        fs.writeFileSync(tmpFile, Buffer.from(arrayBuffer));

        // Extract using system tar (handles xz natively on modern Linux)
        execFileSync("tar", ["xJf", tmpFile, "-C", extractDir], {
            timeout: 120_000,
        });

        logger.info("Node.js tar.xz extracted successfully");
        return true;
    } finally {
        // Clean up temp file
        try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
    }
}

/**
 * Extract a .zip archive (Windows).
 * Uses PowerShell's Expand-Archive for zero-dependency extraction.
 */
async function downloadAndExtractZip(
    response: Response,
    extractDir: string,
): Promise<boolean> {
    const { execFileSync } = await import("node:child_process");
    const tmpFile = path.join(extractDir, `node-download-${Date.now()}.zip`);

    try {
        // Save to temp file
        const arrayBuffer = await response.arrayBuffer();
        fs.writeFileSync(tmpFile, Buffer.from(arrayBuffer));

        // Extract using PowerShell (available on all modern Windows)
        execFileSync("powershell", [
            "-NoProfile", "-NonInteractive",
            "-Command", `Expand-Archive -Path '${tmpFile}' -DestinationPath '${extractDir}' -Force`,
        ], {
            timeout: 120_000,
        });

        logger.info("Node.js zip extracted successfully");
        return true;
    } finally {
        // Clean up temp file
        try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
    }
}

// ─── Internal: Helpers ──────────────────────────────────────────────────────

/**
 * Prepend a directory to process.env.PATH (idempotent).
 */
function prependToPath(dir: string): void {
    const currentPath = process.env.PATH || "";
    if (!currentPath.split(path.delimiter).includes(dir)) {
        process.env.PATH = `${dir}${path.delimiter}${currentPath}`;
    }
}
