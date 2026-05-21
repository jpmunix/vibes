/**
 * Documentation Handlers
 *
 * Reads the recursive `assets/vibes-docs/` directory structure
 * and serves it as a navigable tree + individual page content.
 *
 * Each directory must contain an `index.md` with:
 *   - YAML frontmatter: title, icon (optional), description (optional)
 *   - Ordered `<!-- @section file.md "Title" -->` directives
 */

import log from "electron-log";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { createTypedHandler } from "./base";
import { systemContracts } from "../types/system";
import type { DocTreeNode, DocTree, DocPageContent, DocSearchResult } from "../../types/docsTypes";

const logger = log.scope("docs_handlers");

// ── Frontmatter parser ──────────────────────────────────────────────────────

interface FrontMatter {
  title: string;
  icon?: string;
  description?: string;
}

function parseFrontMatter(content: string): { meta: FrontMatter; body: string } {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!match) {
    return { meta: { title: "Sin título" }, body: content };
  }

  const yamlBlock = match[1];
  const body = match[2];
  const meta: FrontMatter = { title: "Sin título" };

  // Simple line-by-line YAML parser (avoids external dependency)
  for (const line of yamlBlock.split("\n")) {
    const kv = line.match(/^(\w+)\s*:\s*(.+)$/);
    if (!kv) continue;
    const key = kv[1].trim();
    const value = kv[2].trim().replace(/^["']|["']$/g, "");
    if (key === "title") meta.title = value;
    if (key === "icon") meta.icon = value;
    if (key === "description") meta.description = value;
  }

  return { meta, body };
}

// ── Section directive parser ────────────────────────────────────────────────

interface SectionDirective {
  /** Filename (e.g. "bienvenida.md") or directory name with trailing slash (e.g. "despliegue/") */
  target: string;
  /** Display title for the sidebar */
  title: string;
}

function parseSectionDirectives(body: string): SectionDirective[] {
  const directives: SectionDirective[] = [];
  const regex = /<!--\s*@section\s+(\S+)\s+"([^"]+)"\s*-->/g;
  let match;
  while ((match = regex.exec(body)) !== null) {
    directives.push({ target: match[1], title: match[2] });
  }
  return directives;
}

// ── H2 heading extractor ────────────────────────────────────────────────────

interface AnchorEntry {
  id: string;
  title: string;
}

/** Extract all ## headings from a markdown file body, skipping code fences */
function extractH2Anchors(body: string): AnchorEntry[] {
  const anchors: AnchorEntry[] = [];

  // Remove code fences to avoid false positives
  const clean = body.replace(/`{3,}[^\n]*\n[\s\S]*?\n`{3,}/g, "");

  const regex = /^##\s+(.+)$/gm;
  let match;
  while ((match = regex.exec(clean)) !== null) {
    const rawTitle = match[1]
      .replace(/<[^>]+>/g, "")  // strip HTML tags (like <anchor>)
      .trim();
    if (!rawTitle) continue;

    const id = rawTitle
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .trim();

    anchors.push({ id, title: rawTitle });
  }

  return anchors;
}

// ── Tree builder ────────────────────────────────────────────────────────────

function getDocsBasePath(baseDir: string = "vibes-docs"): string {
  return path.join(app.getAppPath(), "assets", baseDir);
}

function buildTreeNode(dirPath: string, parentId: string, rootBasePath: string): DocTreeNode | null {
  const indexPath = path.join(dirPath, "index.md");
  if (!fs.existsSync(indexPath)) {
    logger.warn(`No index.md found in ${dirPath}`);
    return null;
  }

  const content = fs.readFileSync(indexPath, "utf-8");
  const { meta, body } = parseFrontMatter(content);
  const directives = parseSectionDirectives(body);

  const dirName = path.basename(dirPath);
  const id = parentId ? `${parentId}/${dirName}` : dirName;

  const children: DocTreeNode[] = [];

  for (const directive of directives) {
    const isDirectory = directive.target.endsWith("/");

    if (isDirectory) {
      // Recurse into subdirectory
      const subDirName = directive.target.replace(/\/$/, "");
      const subDirPath = path.join(dirPath, subDirName);
      if (fs.existsSync(subDirPath) && fs.statSync(subDirPath).isDirectory()) {
        const childNode = buildTreeNode(subDirPath, id, rootBasePath);
        if (childNode) {
          // Override title from the parent's directive (it takes precedence)
          childNode.title = directive.title;
          children.push(childNode);
        }
      } else {
        logger.warn(`Section directory not found: ${subDirPath}`);
      }
    } else {
      // Leaf page
      const filePath = path.join(dirPath, directive.target);
      if (fs.existsSync(filePath)) {
        const pageId = `${id}/${directive.target.replace(/\.md$/, "")}`;
        const relativePath = path.relative(rootBasePath, filePath).replace(/\\/g, "/");

        // Extract ## headings for sidebar sub-items
        const pageContent = fs.readFileSync(filePath, "utf-8");
        const { body: pageBody } = parseFrontMatter(pageContent);
        const anchors = extractH2Anchors(pageBody);

        children.push({
          id: pageId,
          title: directive.title,
          relativePath,
          type: "page",
          ...(anchors.length > 0 ? { anchors } : {}),
        });
      } else {
        logger.warn(`Section file not found: ${filePath}`);
      }
    }
  }

  const relativePath = path.relative(rootBasePath, dirPath).replace(/\\/g, "/");

  return {
    id: id || "root",
    title: meta.title,
    icon: meta.icon,
    description: meta.description,
    relativePath: relativePath || ".",
    type: "section",
    children,
  };
}

// Always rebuild from disk — the filesystem read is cheap enough,
// and this allows the refresh button to pick up changes instantly.

function getDocTree(baseDir: string = "vibes-docs"): DocTree {
  const basePath = getDocsBasePath(baseDir);
  if (!fs.existsSync(basePath)) {
    logger.warn(`Documentation directory not found: ${basePath}`);
    return {
      root: {
        id: "root",
        title: "Documentación",
        relativePath: ".",
        type: "section",
        children: [],
      },
    };
  }

  const root = buildTreeNode(basePath, "", basePath);
  return {
    root: root || {
      id: "root",
      title: "Documentación",
      relativePath: ".",
      type: "section",
      children: [],
    },
  };
}

// ── Handler registration ────────────────────────────────────────────────────

export function registerDocsHandlers() {
  createTypedHandler(systemContracts.getDocTree, async (_, args) => {
    return getDocTree(args?.baseDir);
  });

  createTypedHandler(systemContracts.getDocPage, async (_, { relativePath, baseDir }) => {
    const basePath = getDocsBasePath(baseDir);
    const fullPath = path.join(basePath, relativePath);

    // Security: prevent path traversal
    const resolved = path.resolve(fullPath);
    if (!resolved.startsWith(path.resolve(basePath))) {
      throw new Error("Path traversal detected");
    }

    if (!fs.existsSync(fullPath)) {
      throw new Error(`Documentation page not found: ${relativePath}`);
    }

    const content = fs.readFileSync(fullPath, "utf-8");
    const { meta, body } = parseFrontMatter(content);

    return {
      markdown: body,
      meta,
    } satisfies DocPageContent;
  });

  createTypedHandler(systemContracts.searchDocs, async (_, { query, baseDir }) => {
    if (!query || query.length < 2) return [];

    const basePath = getDocsBasePath(baseDir);
    if (!fs.existsSync(basePath)) return [];

    const results: DocSearchResult[] = [];

    // Normalize: lowercase + strip diacritics (accent-insensitive)
    const normalize = (s: string) =>
      s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

    const queryNorm = normalize(query);

    // Recursively collect all .md files
    function collectMdFiles(dirPath: string): string[] {
      const files: string[] = [];
      if (!fs.existsSync(dirPath)) return files;
      for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
        const entryPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          files.push(...collectMdFiles(entryPath));
        } else if (entry.name.endsWith(".md") && entry.name !== "index.md") {
          files.push(entryPath);
        }
      }
      return files;
    }

    // Generate anchor ID from heading text (same logic as frontend DocsHeading)
    function textToAnchor(text: string): string {
      return text
        .toLowerCase()
        .replace(/[^\w\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .trim();
    }

    // Find the nearest heading above a given character position in the original body
    function findNearestHeading(body: string, charPos: number): { anchor?: string; sectionTitle?: string } {
      const lines = body.split("\n");
      let currentPos = 0;
      let lastHeading: { anchor: string; sectionTitle: string } | null = null;

      for (const line of lines) {
        if (currentPos > charPos) break;
        const headingMatch = line.match(/^#{1,6}\s+(.+)$/);
        if (headingMatch) {
          const headingText = headingMatch[1].trim();
          lastHeading = {
            anchor: textToAnchor(headingText),
            sectionTitle: headingText,
          };
        }
        currentPos += line.length + 1; // +1 for \n
      }

      return lastHeading || {};
    }

    const mdFiles = collectMdFiles(basePath);
    const SNIPPET_RADIUS = 80;
    const MAX_RESULTS = 20;

    for (const filePath of mdFiles) {
      if (results.length >= MAX_RESULTS) break;

      const raw = fs.readFileSync(filePath, "utf-8");
      const { meta, body } = parseFrontMatter(raw);

      // Clean body for searching (strip HTML comments and code blocks)
      const cleanBody = body
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/`{3,}[\s\S]*?`{3,}/g, "");

      const bodyNorm = normalize(cleanBody);
      const matchIdx = bodyNorm.indexOf(queryNorm);

      // Also check title
      const titleMatch = normalize(meta.title).includes(queryNorm);

      if (matchIdx === -1 && !titleMatch) continue;

      const relativePath = path.relative(basePath, filePath).replace(/\\/g, "/");

      if (matchIdx !== -1) {
        // Find the actual matched text length in the original (may differ from query due to accents)
        // Walk the original string to find corresponding position
        const originalMatchText = cleanBody.slice(matchIdx, matchIdx + queryNorm.length);
        // The normalized match might span a different number of chars in the original
        // due to combined characters. Use the actual original text length.
        let origEnd = matchIdx;
        let normCount = 0;
        while (normCount < queryNorm.length && origEnd < cleanBody.length) {
          const normChar = normalize(cleanBody[origEnd]);
          normCount += normChar.length;
          origEnd++;
        }
        const actualMatchLength = origEnd - matchIdx;

        // Build snippet with context
        const start = Math.max(0, matchIdx - SNIPPET_RADIUS);
        const end = Math.min(cleanBody.length, matchIdx + actualMatchLength + SNIPPET_RADIUS);
        let snippet = cleanBody.slice(start, end).replace(/\n+/g, " ").trim();
        if (start > 0) snippet = "…" + snippet;
        if (end < cleanBody.length) snippet = snippet + "…";

        // Calculate match position within snippet
        const ellipsisOffset = start > 0 ? 1 : 0; // "…" is 1 char
        const snippetMatchStart = matchIdx - start + ellipsisOffset;

        // Find nearest heading for anchor navigation
        const { anchor, sectionTitle } = findNearestHeading(body, matchIdx);

        results.push({
          relativePath,
          title: meta.title,
          snippet,
          matchStart: snippetMatchStart,
          matchLength: actualMatchLength,
          anchor,
          sectionTitle,
        });
      } else {
        // Title-only match
        results.push({
          relativePath,
          title: meta.title,
          snippet: cleanBody.slice(0, 120).replace(/\n+/g, " ").trim() + "…",
          matchStart: -1,
          matchLength: 0,
        });
      }
    }

    if (baseDir === "release-notes") {
      // Sort by relative path descending for release notes (e.g., v8 > v7)
      results.sort((a, b) =>
        b.relativePath.localeCompare(a.relativePath, undefined, {
          numeric: true,
          sensitivity: "base",
        })
      );
    }

    return results;
  });

  logger.debug("Registered documentation IPC handlers");
}
