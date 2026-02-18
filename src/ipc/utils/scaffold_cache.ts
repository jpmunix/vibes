import path from "node:path";
import fs from "fs-extra";
import { spawn } from "node:child_process";
import log from "electron-log";
import { getUserDataPath } from "../../paths/paths";

const logger = log.scope("scaffold-cache");

// Sentinel file that records the hash of the scaffold's package-lock.json
// that was used to install the cached node_modules.
const SENTINEL_FILE = ".scaffold-cache-hash";

/**
 * Returns the path to the scaffold cache directory inside userData.
 * Layout:
 *   <userData>/scaffold-cache/
 *     node_modules/        ← pre-installed deps
 *     .scaffold-cache-hash ← hash of the package-lock.json used
 */
export function getScaffoldCachePath(): string {
    return path.join(getUserDataPath(), "scaffold-cache");
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
 * Returns the path to the scaffold source directory (the template bundled
 * with the app).
 */
function getScaffoldSourcePath(): string {
    // In both dev and packaged builds, __dirname points to the compiled output.
    // The scaffold sits at ../../scaffold relative to the compiled handler files.
    return path.join(__dirname, "..", "..", "scaffold");
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
 * Warm up the scaffold cache in background.
 * This should be called once at app startup (non-blocking).
 *
 * Steps:
 * 1. Check if the scaffold source has a package-lock.json
 * 2. Compare its hash with the cached sentinel
 * 3. If different (or no cache), run `npm ci --legacy-peer-deps` in the cache dir
 * 4. Write the sentinel with the new hash
 */
export async function warmUpScaffoldCache(): Promise<void> {
    const scaffoldSource = getScaffoldSourcePath();
    const lockfilePath = path.join(scaffoldSource, "package-lock.json");
    logger.info(`Scaffold source path: ${scaffoldSource}`);
    logger.info(`Looking for lockfile at: ${lockfilePath}`);

    if (!await fs.pathExists(lockfilePath)) {
        logger.warn("No package-lock.json found in scaffold source, skipping cache warmup");
        return;
    }

    const cachePath = getScaffoldCachePath();
    const sentinelPath = path.join(cachePath, SENTINEL_FILE);
    logger.info(`Scaffold cache path: ${cachePath}`);

    // Compute hash of current scaffold lockfile
    const currentHash = await hashFile(lockfilePath);

    // Check if cache is already up-to-date
    if (await fs.pathExists(sentinelPath)) {
        const cachedHash = (await fs.readFile(sentinelPath, "utf-8")).trim();
        if (cachedHash === currentHash) {
            logger.info("Scaffold cache is up-to-date (hash match), skipping install");
            return;
        }
        logger.info(`Scaffold cache outdated (cached=${cachedHash}, current=${currentHash}), re-installing`);
    } else {
        logger.info("No scaffold cache found, performing initial install");
    }

    // Ensure the cache directory exists
    await fs.ensureDir(cachePath);

    // Copy package.json and package-lock.json to the cache directory
    // (npm ci needs both to install deterministically)
    await fs.copyFile(
        path.join(scaffoldSource, "package.json"),
        path.join(cachePath, "package.json"),
    );
    await fs.copyFile(
        lockfilePath,
        path.join(cachePath, "package-lock.json"),
    );

    // Remove stale node_modules if present (npm ci does this anyway, but let's be safe)
    const nodeModulesPath = path.join(cachePath, "node_modules");
    if (await fs.pathExists(nodeModulesPath)) {
        logger.info("Removing stale cached node_modules");
        await fs.remove(nodeModulesPath);
    }

    // Run npm install for a reproducible install
    // Uses shell: true to support nvm-managed npm installations
    // We use `npm install` instead of `npm ci` because the scaffold's
    // package-lock.json may drift from package.json (e.g. version bumps).
    // npm install handles this gracefully and updates the lockfile.
    logger.info(`Running npm install --legacy-peer-deps in: ${cachePath}`);
    const startTime = Date.now();

    try {
        const result = await runCommand("npm install --legacy-peer-deps", cachePath);
        if (result.stderr) {
            logger.debug(`npm install stderr (may include warnings): ${result.stderr.slice(0, 500)}`);
        }

        const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
        logger.info(`Scaffold cache install completed in ${elapsedSec}s`);

        // Write sentinel hash
        await fs.writeFile(sentinelPath, currentHash, "utf-8");
        logger.info("Scaffold cache sentinel written successfully");
    } catch (error) {
        logger.error("Failed to install scaffold cache:", error);
        // Clean up on failure so we retry next time
        await fs.remove(cachePath).catch(() => { });
    }
}

/**
 * Copies the cached node_modules to a target app directory.
 * Returns true if the copy was successful, false if no cache is available.
 *
 * Uses fs-extra's copy which is optimized for large directory trees.
 */
export async function copyScaffoldNodeModules(targetAppPath: string): Promise<boolean> {
    const cachePath = getScaffoldCachePath();
    const cachedNodeModules = path.join(cachePath, "node_modules");
    const sentinelPath = path.join(cachePath, SENTINEL_FILE);

    // Only copy if cache exists AND has a valid sentinel (completed install)
    if (!await fs.pathExists(cachedNodeModules) || !await fs.pathExists(sentinelPath)) {
        logger.info("No valid scaffold cache available, skipping node_modules copy");
        return false;
    }

    const targetNodeModules = path.join(targetAppPath, "node_modules");

    // Don't overwrite if target already has node_modules
    if (await fs.pathExists(targetNodeModules)) {
        logger.info("Target already has node_modules, skipping cache copy");
        return true;
    }

    logger.info(`Copying cached node_modules to ${targetAppPath}`);
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
        logger.info(`Cached node_modules copied in ${elapsedMs}ms`);
        return true;
    } catch (error) {
        logger.error("Failed to copy cached node_modules:", error);
        // Clean up partial copy
        await fs.remove(targetNodeModules).catch(() => { });
        return false;
    }
}
