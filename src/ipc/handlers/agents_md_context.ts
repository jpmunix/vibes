import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Maximum directory depth for the recursive AGENTS.md search.
 * Depth 0 = workspace root, 1 = first-level subdirs, 2 = second-level.
 * We stop at depth 2 (3 levels total) to avoid scanning huge trees.
 */
const MAX_DEPTH = 2;

/**
 * Directory basenames to NEVER descend into during the search.
 * These are either dependency dirs, VCS dirs, or build artifacts
 * that would never contain a user-authored AGENTS.md.
 */
const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".svn",
  ".hg",
  "dist",
  "build",
  ".next",
  ".nuxt",
  ".output",
  ".turbo",
  ".cache",
  "coverage",
  ".vite",
  ".svelte-kit",
  "vendor",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  "target",
  "out",
  "e2e-tests",
  "test-results",
  "playwright-report",
  "blob-report",
  ".idea",
  ".vscode",
]);

/**
 * Recursively finds all AGENTS.md files under `rootDir`, up to a
 * maximum depth of `MAX_DEPTH + 1` levels (root + MAX_DEPTH sublevels).
 * Returns an array of absolute file paths, ordered root-first.
 *
 * Ignored directories (node_modules, .git, dist, build, etc.) are never
 * traversed, so the search is fast even on large workspaces.
 */
export function findAgentsMdFiles(rootDir: string): string[] {
  const results: string[] = [];

  function scan(dir: string, depth: number) {
    if (depth > MAX_DEPTH) return;

    let entries: import("node:fs").Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true }) as import("node:fs").Dirent[];
    } catch {
      return; // permission error, gone, etc.
    }

    // Check for AGENTS.md in THIS directory (case-insensitive on the base name).
    for (const entry of entries) {
      const name = String(entry.name);
      if (
        entry.isFile() &&
        name.toLowerCase() === "agents.md"
      ) {
        results.push(join(dir, name));
      }
    }

    // Recurse into subdirectories (if within depth limit and not ignored).
    if (depth < MAX_DEPTH) {
      for (const entry of entries) {
        const name = String(entry.name);
        if (!entry.isDirectory()) continue;
        if (IGNORED_DIRS.has(name)) continue;
        scan(join(dir, name), depth + 1);
      }
    }
  }

  scan(rootDir, 0);
  return results;
}

/**
 * Reads all AGENTS.md files found under `rootDir` and concatenates them
 * into a single text block suitable for injection into the system prompt.
 *
 * If no AGENTS.md is found, returns an empty string.
 *
 * The output format is:
 *
 *   # Workspace AGENTS.md
 *
 *   ## /relative/path/to/AGENTS.md
 *   <content>
 *
 *   ## /another/AGENTS.md
 *   <content>
 *
 * Each file is prefixed with its path relative to `rootDir` so the model
 * knows which subproject/area each set of rules applies to.
 */
export function buildAgentsMdBlock(rootDir: string): string {
  const files = findAgentsMdFiles(rootDir);
  if (files.length === 0) return "";

  const parts: string[] = ["# Workspace AGENTS.md\n"];
  let added = 0;

  for (const filePath of files) {
    try {
      const content = readFileSync(filePath, "utf-8").trim();
      if (!content) continue;

      // Show path relative to workspace root for context.
      const relPath = filePath
        .replace(rootDir, "")
        .replace(/^[/\\]/, "");

      parts.push(`## ${relPath || "AGENTS.md"}\n${content}\n`);
      added++;
    } catch {
      // ignore read errors per-file
    }
  }

  if (added === 0) return "";
  return parts.join("\n");
}
