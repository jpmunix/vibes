import path from "node:path";
import fs from "fs-extra";
import fsNode from "node:fs/promises";
import { spawn } from "node:child_process";
import log from "electron-log";
import { getUserDataPath } from "../../paths/paths";
import { SCAFFOLD_TEMPLATE_IDS } from "../../shared/templates";

const logger = log.scope("scaffold-cache");

// Per-scaffold lock to prevent concurrent installs (warmup vs createApp race)
const installLocks = new Map<string, Promise<void>>();

// Sentinel file that records the hash of the scaffold's package-lock.json
// that was used to install the cached node_modules.
const SENTINEL_FILE = ".scaffold-cache-hash";

/**
 * Returns the path to the scaffold cache directory inside userData.
 * Each scaffold variant gets its own cache subdirectory.
 * Layout:
 *   <userData>/scaffold-cache/<scaffoldDirName>/
 *     node_modules/        ← pre-installed deps
 *     .scaffold-cache-hash ← hash of the package-lock.json used
 */
export function getScaffoldCachePath(scaffoldDirName = "scaffold"): string {
    return path.join(getUserDataPath(), "scaffold-cache", scaffoldDirName);
}

/**
 * Computes a fast content hash (first 16 chars of SHA-256) of a file.
 * We use this to detect when the scaffold's package-lock.json changes,
 * which means we need to re-install the cached node_modules.
 */
async function hashFile(filePath: string): Promise<string> {
    const crypto = await import("node:crypto");
    const content = await fs.readFile(filePath);
    return crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
}

/**
 * Returns the path to a scaffold source directory (the template bundled
 * with the app).
 */
function getScaffoldSourcePath(scaffoldDirName = "scaffold"): string {
    // In both dev and packaged builds, __dirname points to the compiled output.
    // The scaffold sits at ../../<scaffoldDirName> relative to the compiled handler files.
    return path.join(__dirname, "..", "..", scaffoldDirName);
}

/**
 * Runs a shell command in a given directory and returns a promise.
 * Uses `spawn` with `shell: true` which is consistent with how the rest
 * of the app runs npm (required for nvm-managed npm on Linux).
 */
function runCommand(command: string, cwd: string): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
        let stdout = "";
        let stderr = "";
        const proc = spawn(command, [], {
            cwd,
            shell: true,
            stdio: "pipe",
            env: { ...process.env },
        });

        proc.stdout?.on("data", (data) => { stdout += data.toString(); });
        proc.stderr?.on("data", (data) => { stderr += data.toString(); });

        proc.on("close", (code) => {
            if (code === 0) {
                resolve({ stdout, stderr });
            } else {
                reject(new Error(
                    `Command "${command}" exited with code ${code}\nstderr: ${stderr}\nstdout: ${stdout}`,
                ));
            }
        });

        proc.on("error", (err) => {
            reject(new Error(`Failed to spawn "${command}": ${err.message}`));
        });

        // 5 minute timeout
        setTimeout(() => {
            proc.kill();
            reject(new Error(`Command "${command}" timed out after 5 minutes`));
        }, 5 * 60 * 1000);
    });
}

/**
 * Ensure node_modules are cached for a given scaffold variant.
 * On first call (or when package.json changes), runs `npm install`.
 * On subsequent calls, returns immediately if cache is valid.
 */
export async function ensureScaffoldCached(scaffoldDirName: string): Promise<void> {
    // Serialize access per scaffold to prevent warmup/createApp race conditions
    const existing = installLocks.get(scaffoldDirName);
    if (existing) {
        logger.info(`[${scaffoldDirName}] Waiting for in-progress install to complete...`);
        await existing;
        return;
    }

    const promise = _ensureScaffoldCachedImpl(scaffoldDirName);
    installLocks.set(scaffoldDirName, promise);
    try {
        await promise;
    } finally {
        installLocks.delete(scaffoldDirName);
    }
}

async function _ensureScaffoldCachedImpl(scaffoldDirName: string): Promise<void> {
    const scaffoldSource = getScaffoldSourcePath(scaffoldDirName);
    const lockfilePath = path.join(scaffoldSource, "package-lock.json");
    logger.info(`[${scaffoldDirName}] Scaffold source path: ${scaffoldSource}`);

    if (!await fs.pathExists(lockfilePath)) {
        // New scaffolds won't have a lockfile until npm install is run.
        // Fall back to package.json hash if no lockfile.
        const pkgJsonPath = path.join(scaffoldSource, "package.json");
        if (!await fs.pathExists(pkgJsonPath)) {
            logger.warn(`[${scaffoldDirName}] No package.json found, skipping cache warmup`);
            return;
        }
    }

    const hashSourcePath = await fs.pathExists(lockfilePath)
        ? lockfilePath
        : path.join(scaffoldSource, "package.json");

    const cachePath = getScaffoldCachePath(scaffoldDirName);
    const sentinelPath = path.join(cachePath, SENTINEL_FILE);
    logger.info(`[${scaffoldDirName}] Scaffold cache path: ${cachePath}`);

    // Compute hash of current scaffold lockfile/package.json
    const currentHash = await hashFile(hashSourcePath);

    // Check if cache is already up-to-date
    if (await fs.pathExists(sentinelPath)) {
        const cachedHash = (await fs.readFile(sentinelPath, "utf-8")).trim();
        if (cachedHash === currentHash) {
            logger.info(`[${scaffoldDirName}] Scaffold cache is up-to-date (hash match), skipping install`);
            return;
        }
        logger.info(`[${scaffoldDirName}] Scaffold cache outdated (cached=${cachedHash}, current=${currentHash}), re-installing`);
    } else {
        logger.info(`[${scaffoldDirName}] No scaffold cache found, performing initial install`);
    }

    // Ensure the cache directory exists
    await fs.ensureDir(cachePath);

    // Copy package.json to the cache directory
    await fs.copyFile(
        path.join(scaffoldSource, "package.json"),
        path.join(cachePath, "package.json"),
    );
    // Copy package-lock.json if it exists
    if (await fs.pathExists(lockfilePath)) {
        await fs.copyFile(
            lockfilePath,
            path.join(cachePath, "package-lock.json"),
        );
    }

    // Remove stale node_modules if present (use native rm for symlink safety)
    const nodeModulesPath = path.join(cachePath, "node_modules");
    if (await fs.pathExists(nodeModulesPath)) {
        logger.info(`[${scaffoldDirName}] Removing stale cached node_modules`);
        await fsNode.rm(nodeModulesPath, { recursive: true, force: true });
    }

    logger.info(`[${scaffoldDirName}] Running npm install --legacy-peer-deps in: ${cachePath}`);
    const startTime = Date.now();

    try {
        const result = await runCommand("npm install --legacy-peer-deps", cachePath);
        if (result.stderr) {
            logger.debug(`[${scaffoldDirName}] npm install stderr (may include warnings): ${result.stderr.slice(0, 500)}`);
        }

        const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
        logger.info(`[${scaffoldDirName}] Scaffold cache install completed in ${elapsedSec}s`);

        // Write sentinel hash
        await fs.writeFile(sentinelPath, currentHash, "utf-8");
        logger.info(`[${scaffoldDirName}] Scaffold cache sentinel written successfully`);
    } catch (error) {
        logger.error(`[${scaffoldDirName}] Failed to install scaffold cache:`, error);
        // Clean up on failure so we retry next time
        await fsNode.rm(cachePath, { recursive: true, force: true }).catch(() => { });
    }
}

/**
 * Warm up the scaffold cache in background.
 * This should be called once at app startup (non-blocking).
 * Iterates over all scaffolds defined in SCAFFOLD_TEMPLATE_IDS.
 *
 * Steps per scaffold:
 * 1. Check if the scaffold source has a package-lock.json (or package.json)
 * 2. Compare its hash with the cached sentinel
 * 3. If different (or no cache), run `npm install --legacy-peer-deps` in the cache dir
 * 4. Write the sentinel with the new hash
 */
export async function warmUpScaffoldCache(): Promise<void> {
    // Get unique scaffold directory names
    const scaffoldDirNames = [...new Set(Object.values(SCAFFOLD_TEMPLATE_IDS))];
    logger.info(`Warming up scaffold caches for: ${scaffoldDirNames.join(", ")}`);

    // Warm up sequentially to avoid overwhelming the system
    for (const dirName of scaffoldDirNames) {
        try {
            await ensureScaffoldCached(dirName);
        } catch (error) {
            logger.error(`Failed to warm up cache for ${dirName}:`, error);
        }
    }
}

/**
 * Resolves which scaffold cache to use for a given target app directory.
 * Reads the target's package.json name to determine the matching scaffold.
 * Falls back to the default "scaffold" cache if no match is found.
 */
async function resolveScaffoldDirForApp(targetAppPath: string): Promise<string> {
    try {
        const pkgJsonPath = path.join(targetAppPath, "package.json");
        if (await fs.pathExists(pkgJsonPath)) {
            const pkgJson = await fs.readJson(pkgJsonPath);
            // Match by package name pattern to scaffold dir
            const name: string = pkgJson.name || "";
            if (name.includes("vue")) return "scaffold-vue";
            if (name.includes("astro")) return "scaffold-astro";
            if (name.includes("svelte") || name.includes("sveltekit")) return "scaffold-svelte";
            // Check for Express-style projects (no react/vue deps, has express dep)
            if (pkgJson.dependencies?.express) return "scaffold-express";
        }
    } catch {
        // Fall through to default
    }
    return "scaffold";
}

/**
 * Copies the cached node_modules to a target app directory.
 * Returns true if the copy was successful, false if no cache is available.
 *
 * Automatically resolves the correct scaffold cache based on the target app's
 * package.json. Uses fs-extra's copy which is optimized for large directory trees.
 */
export async function copyScaffoldNodeModules(targetAppPath: string): Promise<boolean> {
    const scaffoldDirName = await resolveScaffoldDirForApp(targetAppPath);
    const cachePath = getScaffoldCachePath(scaffoldDirName);
    const cachedNodeModules = path.join(cachePath, "node_modules");
    const sentinelPath = path.join(cachePath, SENTINEL_FILE);

    // Only copy if cache exists AND has a valid sentinel (completed install)
    if (!await fs.pathExists(cachedNodeModules) || !await fs.pathExists(sentinelPath)) {
        logger.info(`[${scaffoldDirName}] No valid scaffold cache available, skipping node_modules copy`);
        return false;
    }

    const targetNodeModules = path.join(targetAppPath, "node_modules");

    // Don't overwrite if target already has node_modules
    if (await fs.pathExists(targetNodeModules)) {
        logger.info(`[${scaffoldDirName}] Target already has node_modules, skipping cache copy`);
        return true;
    }

    logger.info(`[${scaffoldDirName}] Copying cached node_modules to ${targetAppPath}`);
    const startTime = Date.now();

    try {
        await fs.copy(cachedNodeModules, targetNodeModules, {
            // IMPORTANT: Preserve symlinks (dereference: false).
            // npm creates symlinks in node_modules/.bin/ (e.g. vite → ../vite/bin/vite.cjs).
            // Dereferencing them breaks the relative paths and causes MODULE_NOT_FOUND errors.
            // On Windows, symlinks might need admin privileges, but fs-extra handles this gracefully.
            dereference: false,
        });

        const elapsedMs = Date.now() - startTime;
        logger.info(`[${scaffoldDirName}] Cached node_modules copied in ${elapsedMs}ms`);
        return true;
    } catch (error) {
        logger.error(`[${scaffoldDirName}] Failed to copy cached node_modules:`, error);
        // Clean up partial copy
        await fs.remove(targetNodeModules).catch(() => { });
        return false;
    }
}
