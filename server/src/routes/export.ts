/**
 * Export Routes — Download projects as ZIP files.
 *
 * GET /api/export/:appId
 *   → Generates a ZIP excluding node_modules, .git, and .gitignore patterns.
 */
import type { FastifyInstance } from "fastify";
import AdmZip from "adm-zip";
import fs from "node:fs";
import path from "node:path";

/**
 * Parse a .gitignore file and return an array of patterns.
 */
function parseGitignore(gitignorePath: string): string[] {
  if (!fs.existsSync(gitignorePath)) return [];
  return fs
    .readFileSync(gitignorePath, "utf-8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

/**
 * Check if a relative path matches any of the ignore patterns.
 * Simple glob matching — supports basic patterns like *.log, dist/, etc.
 */
function isIgnored(relativePath: string, patterns: string[]): boolean {
  const parts = relativePath.split(path.sep);

  for (const pattern of patterns) {
    const cleanPattern = pattern.replace(/\/$/, ""); // Remove trailing slash

    // Direct name match (e.g., "node_modules" matches any depth)
    if (parts.includes(cleanPattern)) return true;

    // Glob extension match (e.g., "*.log")
    if (pattern.startsWith("*.")) {
      const ext = pattern.slice(1); // ".log"
      if (relativePath.endsWith(ext)) return true;
    }

    // Path prefix match (e.g., "dist/" matches "dist/index.js")
    if (relativePath.startsWith(cleanPattern + "/") || relativePath === cleanPattern) {
      return true;
    }
  }

  return false;
}

/**
 * Recursively add directory contents to a ZIP, respecting ignore patterns.
 */
function addDirectoryToZip(
  zip: AdmZip,
  dirPath: string,
  zipPrefix: string,
  ignorePatterns: string[],
  basePath: string = dirPath,
): void {
  const entries = fs.readdirSync(dirPath);

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry);
    const relativePath = path.relative(basePath, fullPath);

    if (isIgnored(relativePath, ignorePatterns)) continue;

    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      addDirectoryToZip(zip, fullPath, zipPrefix, ignorePatterns, basePath);
    } else {
      const zipPath = path.join(zipPrefix, relativePath);
      zip.addLocalFile(fullPath, path.dirname(zipPath));
    }
  }
}

export function registerExportRoutes(app: FastifyInstance) {
  app.get<{ Params: { appId: string } }>(
    "/api/export/:appId",
    async (request, reply) => {
      const userId = (request as any).userId;
      if (!userId) {
        reply.code(401).send({ error: "Unauthorized" });
        return;
      }

      const appId = Number(request.params.appId);

      try {
        // Look up the app in the database
        const { getRemoteDb } = await import("../../../src/db/remote.ts");
        const { apps } = await import("../../../src/db/remote-schema.ts");
        const { eq, and } = await import("drizzle-orm");
        const { getVibesAppPath } = await import("../../../src/paths/paths.ts");

        const db = getRemoteDb();
        const appRecord = await db.query.apps.findFirst({
          where: and(eq(apps.id, appId), eq(apps.userId, userId)),
        });

        if (!appRecord) {
          reply.code(404).send({ error: "App not found" });
          return;
        }

        const appPath = getVibesAppPath(appRecord.path);
        if (!fs.existsSync(appPath)) {
          reply.code(404).send({ error: "App directory not found on disk" });
          return;
        }

        // Build ignore patterns: always exclude node_modules + .git, plus .gitignore entries
        const ignorePatterns = ["node_modules", ".git"];
        const gitignorePatterns = parseGitignore(path.join(appPath, ".gitignore"));
        ignorePatterns.push(...gitignorePatterns);

        // Generate ZIP
        const zip = new AdmZip();
        addDirectoryToZip(zip, appPath, appRecord.name, ignorePatterns);

        const zipBuffer = zip.toBuffer();

        reply
          .header("Content-Type", "application/zip")
          .header(
            "Content-Disposition",
            `attachment; filename="${appRecord.name}.zip"`,
          )
          .send(zipBuffer);
      } catch (err: any) {
        app.log.error(`[Export] Failed for appId ${appId}:`, err);
        reply.code(500).send({ error: err.message || "Export failed" });
      }
    },
  );
}
