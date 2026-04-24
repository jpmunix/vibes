import log from "electron-log";
import { createTypedHandler } from "./base";
import { designContracts } from "../types/design";
import { getVibesAppPath } from "../../paths/paths";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { promises as fsPromises } from "node:fs";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const execFileAsync = promisify(execFile);
const logger = log.scope("design_handlers");

// =============================================================================
// In-memory cache for getdesign list (TTL: 24 hours)
// =============================================================================

interface DesignListCache {
  data: { id: string; description: string }[];
  fetchedAt: number;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
let designListCache: DesignListCache | null = null;

/**
 * Parses the output of `npx getdesign list`.
 * Each line has the format: "brand - Description text here."
 */
function parseDesignList(stdout: string): { id: string; description: string }[] {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line.includes(" - "))
    .map((line) => {
      const dashIndex = line.indexOf(" - ");
      return {
        id: line.substring(0, dashIndex).trim(),
        description: line.substring(dashIndex + 3).trim(),
      };
    });
}

/**
 * Writes DESIGN.md content to docs/DESIGN.md inside an app folder.
 */
async function writeDesignToApp(appPath: string, content: string): Promise<void> {
  const fullAppPath = getVibesAppPath(appPath);
  const docsDir = path.join(fullAppPath, "docs");
  const designMdPath = path.join(docsDir, "DESIGN.md");

  await fsPromises.mkdir(docsDir, { recursive: true });
  await fsPromises.writeFile(designMdPath, content, "utf-8");
  logger.info(`[Design] Wrote DESIGN.md to ${designMdPath} (${content.length} chars)`);

  // Register docs/DESIGN.md in the project's opencode.json so OpenCode
  // loads it natively as part of its instructions context.
  await patchOpencodeJsonInstructions(fullAppPath, "docs/DESIGN.md");
}

/**
 * Ensures `docs/DESIGN.md` is listed in the project's `opencode.json` `instructions` array.
 * Creates the file if it doesn't exist; merges if it does.
 */
async function patchOpencodeJsonInstructions(projectDir: string, instructionPath: string): Promise<void> {
  const ocJsonPath = path.join(projectDir, "opencode.json");

  let config: Record<string, any> = {};
  try {
    const existing = await fsPromises.readFile(ocJsonPath, "utf-8");
    config = JSON.parse(existing);
  } catch {
    // File doesn't exist or is invalid — start fresh
  }

  // Ensure instructions is an array
  if (!Array.isArray(config.instructions)) {
    config.instructions = [];
  }

  // Add the instruction path if not already present
  if (!config.instructions.includes(instructionPath)) {
    config.instructions.push(instructionPath);
  }

  await fsPromises.writeFile(ocJsonPath, JSON.stringify(config, null, 2), "utf-8");
  logger.info(`[Design] Updated opencode.json — instructions: ${JSON.stringify(config.instructions)}`);
}

export function registerDesignHandlers() {
  logger.debug("Registering design handlers");

  // ─── List available designs ───────────────────────────────────────────────
  createTypedHandler(designContracts.listDesigns, async () => {
    // Return cached data if still fresh
    if (designListCache && Date.now() - designListCache.fetchedAt < CACHE_TTL_MS) {
      logger.info(`[Design] Returning cached design list (${designListCache.data.length} items)`);
      return designListCache.data;
    }

    logger.info("[Design] Fetching design list via npx getdesign list...");

    try {
      const { stdout } = await execFileAsync("npx", ["-y", "getdesign@latest", "list"], {
        timeout: 30_000,
        env: { ...process.env },
      });

      const designs = parseDesignList(stdout);
      logger.info(`[Design] Parsed ${designs.length} designs from getdesign list`);

      // Update cache
      designListCache = {
        data: designs,
        fetchedAt: Date.now(),
      };

      return designs;
    } catch (error: any) {
      logger.error("[Design] Failed to fetch design list:", error.message);

      // If we have stale cache, return it rather than failing
      if (designListCache) {
        logger.warn("[Design] Returning stale cached data due to fetch error");
        return designListCache.data;
      }

      throw new Error(`Error al obtener la lista de diseños: ${error.message}`);
    }
  });

  // ─── Add a brand design to a project ──────────────────────────────────────
  // Runs `npx getdesign add <brand>` in a temp directory, then copies the
  // resulting DESIGN.md to <appPath>/docs/DESIGN.md. This avoids the CLI's
  // relative-path quirks with --out.
  createTypedHandler(designContracts.addDesign, async (_, { brand, appPath }) => {
    logger.info(`[Design] Adding design "${brand}" to app "${appPath}"`);

    // Create a temp dir where getdesign will write its output
    const tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), "vibes-design-"));

    try {
      await execFileAsync(
        "npx",
        ["-y", "getdesign@latest", "add", brand, "--force"],
        {
          timeout: 30_000,
          cwd: tmpDir,
          env: { ...process.env },
        },
      );

      // getdesign writes DESIGN.md in the CWD
      const tmpDesignPath = path.join(tmpDir, "DESIGN.md");
      if (!fs.existsSync(tmpDesignPath)) {
        throw new Error(`getdesign did not create DESIGN.md in ${tmpDir}`);
      }

      const content = await fsPromises.readFile(tmpDesignPath, "utf-8");
      logger.info(`[Design] Downloaded DESIGN.md for "${brand}" (${content.length} chars)`);

      // Write to the actual app docs/ folder
      await writeDesignToApp(appPath, content);

      return { content };
    } catch (error: any) {
      logger.error(`[Design] Failed to add design "${brand}":`, error.message);
      throw new Error(`Error al instalar el diseño "${brand}": ${error.message}`);
    } finally {
      // Cleanup temp dir
      try {
        await fsPromises.rm(tmpDir, { recursive: true, force: true });
      } catch { /* best effort */ }
    }
  });

  // ─── Write custom (uploaded/pasted) DESIGN.md to a project ────────────────
  createTypedHandler(designContracts.writeCustomDesign, async (_, { content, appPath }) => {
    logger.info(`[Design] Writing custom DESIGN.md to app "${appPath}" (${content.length} chars)`);

    try {
      await writeDesignToApp(appPath, content);
      return { written: true };
    } catch (error: any) {
      logger.error("[Design] Failed to write custom DESIGN.md:", error.message);
      throw new Error(`Error al guardar el diseño personalizado: ${error.message}`);
    }
  });
}
