/**
 * Unified explore_codebase tool — consolidates read_file, list_files,
 * grep and code_search into a single tool with an `action` enum.
 *
 * The frontend XML tags (dyad-read, dyad-list-files, dyad-grep,
 * dyad-code-search) are preserved for backward compatibility.
 */

import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import log from "electron-log";
import {
    ToolDefinition,
    AgentContext,
    escapeXmlAttr,
    escapeXmlContent,
} from "./types";
import { safeJoin } from "@/ipc/utils/path_utils";
import { extractCodebase } from "@/utils/codebase";
import { resolveDirectoryWithinAppPath } from "./path_safety";
import {
    getRgExecutablePath,
    MAX_FILE_SEARCH_SIZE,
    RIPGREP_EXCLUDED_GLOBS,
} from "@/ipc/utils/ripgrep_utils";

const execFileAsync = promisify(execFile);
const readFileFs = fs.promises.readFile;
const logger = log.scope("explore_codebase");

// ============================================================================
// Constants
// ============================================================================

const GREP_DEFAULT_LIMIT = 100;
const GREP_MAX_LIMIT = 250;
const GREP_MAX_LINE_LENGTH = 500;
const CODE_SEARCH_MAX_FILES = 30;
const LIST_MAX_FILES_UI = 20;

// ============================================================================
// Schema
// ============================================================================

const exploreCodebaseSchema = z.object({
    action: z
        .enum(["read_file", "list_files", "search_text", "search_code"])
        .describe(
            `The type of exploration to perform:
- "read_file": Read the content of a specific file (optionally a line range).
- "list_files": List files in a directory.
- "search_text": Search for a regex pattern across the codebase using ripgrep. Returns matching lines with file paths and line numbers.
- "search_code": Search for files relevant to a concept/feature/function name. Returns a list of matching file paths. Use this when you need to discover which files are related to a specific topic.`,
        ),

    // ── read_file fields ──
    path: z
        .string()
        .optional()
        .describe("File path relative to the app root. Required for 'read_file'."),
    start_line: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe(
            "One-indexed start line for reading a range (inclusive). For 'read_file' only.",
        ),
    end_line: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe(
            "One-indexed end line for reading a range (inclusive). For 'read_file' only.",
        ),

    // ── list_files fields ──
    directory: z
        .string()
        .optional()
        .describe("Subdirectory to list. For 'list_files' only."),
    recursive: z
        .boolean()
        .optional()
        .describe(
            "Whether to list files recursively (default: false). For 'list_files' only.",
        ),

    // ── search_text / search_code fields ──
    query: z
        .string()
        .optional()
        .describe(
            "Search query or regex pattern. Required for 'search_text' and 'search_code'.",
        ),
    include_pattern: z
        .string()
        .optional()
        .describe(
            "Glob pattern for files to include (e.g. '*.ts'). For 'search_text' only.",
        ),
    exclude_pattern: z
        .string()
        .optional()
        .describe("Glob pattern for files to exclude. For 'search_text' only."),
    case_sensitive: z
        .boolean()
        .optional()
        .describe(
            "Whether search should be case sensitive (default: false). For 'search_text' only.",
        ),
    limit: z
        .number()
        .int()
        .min(1)
        .max(GREP_MAX_LIMIT)
        .optional()
        .describe(
            `Maximum number of matches to return (default ${GREP_DEFAULT_LIMIT}, max ${GREP_MAX_LIMIT}). For 'search_text' only.`,
        ),
});

type ExploreCodebaseArgs = z.infer<typeof exploreCodebaseSchema>;

// ============================================================================
// Helpers — ripgrep runner (from grep.ts)
// ============================================================================

interface RipgrepMatch {
    path: string;
    lineNumber: number;
    lineText: string;
}

async function runRipgrep({
    appPath,
    query,
    includePat,
    excludePat,
    caseSensitive,
}: {
    appPath: string;
    query: string;
    includePat?: string;
    excludePat?: string;
    caseSensitive?: boolean;
}): Promise<RipgrepMatch[]> {
    return new Promise((resolve, reject) => {
        const results: RipgrepMatch[] = [];
        const args: string[] = [
            "--json",
            "--no-config",
            "--max-filesize",
            `${MAX_FILE_SEARCH_SIZE}`,
            ...RIPGREP_EXCLUDED_GLOBS.flatMap((glob) => ["--glob", glob]),
        ];

        if (!caseSensitive) {
            args.push("--ignore-case");
        }

        if (includePat) {
            args.push("--glob", includePat);
        }

        if (excludePat) {
            args.push("--glob", `!${excludePat}`);
        }

        args.push("--", query, ".");

        const rg = spawn(getRgExecutablePath(), args, { cwd: appPath });
        let buffer = "";

        rg.stdout.on("data", (data) => {
            buffer += data.toString();
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const event = JSON.parse(line);
                    if (event.type !== "match" || !event.data) continue;

                    const matchPath = event.data.path?.text as string;
                    if (!matchPath) continue;

                    const lineText = event.data.lines?.text as string;
                    const lineNumber = event.data.line_number as number;

                    if (typeof lineText !== "string" || typeof lineNumber !== "number")
                        continue;

                    const normalizedPath = matchPath.replace(/^\.\//, "");
                    results.push({
                        path: normalizedPath,
                        lineNumber,
                        lineText: lineText.replace(/\r?\n$/, ""),
                    });
                } catch {
                    // Skip malformed JSON lines
                }
            }
        });

        rg.stderr.on("data", (data) => {
            logger.warn("ripgrep stderr", data.toString());
        });

        rg.on("close", (code) => {
            if (code !== 0 && code !== 1) {
                reject(new Error(`ripgrep exited with code ${code}`));
                return;
            }
            resolve(results);
        });

        rg.on("error", (error) => {
            reject(error);
        });
    });
}

// ============================================================================
// Helpers — grep attributes for UI XML
// ============================================================================

function buildGrepAttributes(
    args: Partial<ExploreCodebaseArgs>,
    count?: number,
    total?: number,
    truncated?: boolean,
): string {
    const attrs: string[] = [];
    if (args.query) attrs.push(`query="${escapeXmlAttr(args.query)}"`);
    if (args.include_pattern)
        attrs.push(`include="${escapeXmlAttr(args.include_pattern)}"`);
    if (args.exclude_pattern)
        attrs.push(`exclude="${escapeXmlAttr(args.exclude_pattern)}"`);
    if (args.case_sensitive) attrs.push(`case-sensitive="true"`);
    if (count !== undefined) attrs.push(`count="${count}"`);
    if (total !== undefined) attrs.push(`total="${total}"`);
    if (truncated) attrs.push(`truncated="true"`);
    return attrs.join(" ");
}

// ============================================================================
// Tool Description
// ============================================================================

const DESCRIPTION = `Explore and search the codebase.

Choose the right action via the "action" field:

| action        | When to use                                                         |
|---------------|---------------------------------------------------------------------|
| read_file     | Read the content of a specific file. Provide "path".                |
| list_files    | List files in a directory. Optionally provide "directory".          |
| search_text   | Search for a regex pattern with ripgrep. Provide "query".           |
| search_code   | Find files related to a concept or feature name. Provide "query".   |

You can call this tool multiple times in parallel to read several files at once.

IMPORTANT: read_file returns line-numbered output in the format "N: content" with a metadata header showing total lines. Use these exact line numbers when using patch_file operations.
`;

// ============================================================================
// Unified Tool Definition
// ============================================================================

export const exploreCodebaseTool: ToolDefinition<ExploreCodebaseArgs> = {
    name: "explore_codebase",
    description: DESCRIPTION,
    inputSchema: exploreCodebaseSchema,
    defaultConsent: "always",

    getConsentPreview: (args) => {
        switch (args.action) {
            case "read_file": {
                const start = args.start_line;
                const end = args.end_line;
                if (start != null && end != null)
                    return `Read ${args.path} (lines ${start}-${end})`;
                if (start != null) return `Read ${args.path} (from line ${start})`;
                if (end != null) return `Read ${args.path} (to line ${end})`;
                return `Read ${args.path}`;
            }
            case "list_files": {
                const recursiveText = args.recursive ? " (recursive)" : "";
                return args.directory
                    ? `List ${args.directory}${recursiveText}`
                    : `List all files${recursiveText}`;
            }
            case "search_text":
            case "search_code":
                return `Search for "${args.query}"`;
            default:
                return "Explore codebase";
        }
    },

    buildXml: (args, isComplete) => {
        switch (args.action) {
            // ── read_file → dyad-read ──
            case "read_file": {
                if (!args.path) return undefined;
                const attrs = [`path="${escapeXmlAttr(args.path)}"`];
                if (args.start_line != null)
                    attrs.push(`start_line="${escapeXmlAttr(String(args.start_line))}"`);
                if (args.end_line != null)
                    attrs.push(`end_line="${escapeXmlAttr(String(args.end_line))}"`);
                return `<dyad-read ${attrs.join(" ")}></dyad-read>`;
            }

            // ── list_files → dyad-list-files ──
            case "list_files": {
                if (isComplete) return undefined;
                const dirAttr = args.directory
                    ? ` directory="${escapeXmlAttr(args.directory)}"`
                    : "";
                const recursiveAttr =
                    args.recursive !== undefined
                        ? ` recursive="${args.recursive}"`
                        : "";
                return `<dyad-list-files${dirAttr}${recursiveAttr}></dyad-list-files>`;
            }

            // ── search_text → dyad-grep ──
            case "search_text": {
                if (isComplete) return undefined;
                if (!args.query) return undefined;
                const attrs = buildGrepAttributes(args);
                return `<dyad-grep ${attrs}>Searching...</dyad-grep>`;
            }

            // ── search_code → dyad-code-search ──
            case "search_code": {
                if (!args.query) return undefined;
                if (isComplete) return undefined;
                return `<dyad-code-search query="${escapeXmlAttr(args.query)}">Searching...`;
            }

            default:
                return undefined;
        }
    },

    execute: async (args, ctx: AgentContext) => {
        switch (args.action) {
            // ────────────────────────────────────────────────
            // READ FILE
            // ────────────────────────────────────────────────
            case "read_file": {
                if (!args.path) {
                    return "Error: 'path' is required for action 'read_file'.";
                }

                const fullFilePath = safeJoin(ctx.appPath, args.path);
                if (!fs.existsSync(fullFilePath)) {
                    return `File does not exist: ${args.path}`;
                }

                const content = await readFileFs(fullFilePath, "utf8");
                if (!content) return "";

                const hasTrailingNewline = content.endsWith("\n");
                const allLines = (
                    hasTrailingNewline ? content.slice(0, -1) : content
                ).split("\n");
                const totalLines = allLines.length;

                const start = args.start_line;
                const end = args.end_line;

                const startIdx = Math.max(0, (start ?? 1) - 1);
                const endIdx = Math.min(totalLines, end ?? totalLines);
                const selectedLines = allLines.slice(startIdx, endIdx);

                // Always prefix with line numbers for precise patch operations
                const numberedLines = selectedLines.map(
                    (line, i) => `${startIdx + i + 1}: ${line}`,
                );

                const rangeInfo =
                    start != null || end != null
                        ? ` | Showing: ${startIdx + 1}-${endIdx}`
                        : "";
                const header = `[File: ${args.path} | Total lines: ${totalLines}${rangeInfo}]`;

                return `${header}\n${numberedLines.join("\n")}`;
            }

            // ────────────────────────────────────────────────
            // LIST FILES
            // ────────────────────────────────────────────────
            case "list_files": {
                let sanitizedDirectory: string | undefined;
                if (args.directory) {
                    const relativePathFromApp = resolveDirectoryWithinAppPath({
                        appPath: ctx.appPath,
                        directory: args.directory,
                    });
                    const normalizedRelativePath = relativePathFromApp
                        .split(path.sep)
                        .join("/")
                        .replace(/\\/g, "/");
                    sanitizedDirectory = normalizedRelativePath || undefined;
                }

                const globSuffix = args.recursive ? "/**" : "/*";
                const globPath = sanitizedDirectory
                    ? sanitizedDirectory + globSuffix
                    : globSuffix.slice(1);

                const { files } = await extractCodebase({
                    appPath: ctx.appPath,
                    chatContext: {
                        contextPaths: [{ globPath }],
                        smartContextAutoIncludes: [],
                        excludePaths: [],
                    },
                });

                const allFilesList =
                    files.map((file) => " - " + file.path).join("\n") || "";

                // Abbreviated list for UI
                const totalCount = files.length;
                const displayedFiles = files.slice(0, LIST_MAX_FILES_UI);
                const abbreviatedList =
                    displayedFiles.map((file) => " - " + file.path).join("\n") || "";
                const countInfo =
                    totalCount > LIST_MAX_FILES_UI
                        ? `\n... and ${totalCount - LIST_MAX_FILES_UI} more files (${totalCount} total)`
                        : `\n(${totalCount} files total)`;

                // Build list_files XML attributes
                const dirAttr = args.directory
                    ? ` directory="${escapeXmlAttr(args.directory)}"`
                    : "";
                const recursiveAttr =
                    args.recursive !== undefined
                        ? ` recursive="${args.recursive}"`
                        : "";

                ctx.onXmlComplete(
                    `<dyad-list-files${dirAttr}${recursiveAttr}>${escapeXmlContent(abbreviatedList + countInfo)}</dyad-list-files>`,
                );

                return allFilesList;
            }

            // ────────────────────────────────────────────────
            // SEARCH TEXT (ripgrep)
            // ────────────────────────────────────────────────
            case "search_text": {
                if (!args.query) {
                    return "Error: 'query' is required for action 'search_text'.";
                }

                const includePatWasWildcard = args.include_pattern === "*";
                const matches = await runRipgrep({
                    appPath: ctx.appPath,
                    query: args.query,
                    includePat: includePatWasWildcard
                        ? undefined
                        : args.include_pattern,
                    excludePat: args.exclude_pattern,
                    caseSensitive: args.case_sensitive,
                });

                const sortedMatches = [...matches].sort(
                    (a, b) =>
                        a.path.localeCompare(b.path) || a.lineNumber - b.lineNumber,
                );

                const totalCount = sortedMatches.length;
                const limit = Math.min(
                    args.limit ?? GREP_DEFAULT_LIMIT,
                    GREP_MAX_LIMIT,
                );
                const limitedMatches = sortedMatches.slice(0, limit);
                const wasTruncated = totalCount > limit;

                const attrs = buildGrepAttributes(
                    args,
                    limitedMatches.length,
                    totalCount,
                    wasTruncated,
                );

                if (limitedMatches.length === 0) {
                    ctx.onXmlComplete(
                        `<dyad-grep ${attrs}>No matches found.</dyad-grep>`,
                    );
                    return "No matches found.";
                }

                const lines = limitedMatches.map((m) => {
                    const text =
                        m.lineText.length > GREP_MAX_LINE_LENGTH
                            ? m.lineText.slice(0, GREP_MAX_LINE_LENGTH) + "..."
                            : m.lineText;
                    return `${m.path}:${m.lineNumber}: ${text}`;
                });
                let resultText = lines.join("\n");

                if (wasTruncated) {
                    resultText += `\n\n[TRUNCATED: Showing ${limitedMatches.length} of ${totalCount} matches. Usa include_pattern (p. ej. "*.ts") o una consulta más específica para acotar.]`;
                }
                if (includePatWasWildcard) {
                    resultText += `\n\n[NOTA: include_pattern="*" se ignoró porque coincide con todo (incluido git-ignored). Omite include_pattern para buscar todo o usa un glob específico como "*.ts".]`;
                }

                ctx.onXmlComplete(
                    `<dyad-grep ${attrs}>\n${escapeXmlContent(resultText)}\n</dyad-grep>`,
                );

                return resultText;
            }

            // ────────────────────────────────────────────────
            // SEARCH CODE (file-level grep)
            // ────────────────────────────────────────────────
            case "search_code": {
                if (!args.query) {
                    return "Error: 'query' is required for action 'search_code'.";
                }

                logger.log(`Executing code search: ${args.query}`);

                try {
                    const { stdout } = await execFileAsync(
                        "grep",
                        [
                            "-r",
                            "-l",
                            "-i",
                            "--include=*.ts",
                            "--include=*.tsx",
                            "--include=*.js",
                            "--include=*.jsx",
                            "--include=*.css",
                            "--include=*.html",
                            "--include=*.json",
                            "--include=*.md",
                            "--include=*.yaml",
                            "--include=*.yml",
                            "--include=*.toml",
                            "--include=*.py",
                            "--include=*.go",
                            "--include=*.rs",
                            "--include=*.vue",
                            "--include=*.svelte",
                            "--exclude-dir=node_modules",
                            "--exclude-dir=.git",
                            "--exclude-dir=dist",
                            "--exclude-dir=.next",
                            "--exclude-dir=.vite",
                            "--exclude-dir=build",
                            args.query,
                            ".",
                        ],
                        {
                            cwd: ctx.appPath,
                            maxBuffer: 1024 * 1024,
                            timeout: 10000,
                        },
                    );

                    const files = stdout
                        .trim()
                        .split("\n")
                        .filter(Boolean)
                        .map((f) => f.replace(/^\.\//, ""))
                        .slice(0, CODE_SEARCH_MAX_FILES);

                    logger.log(`Code search returned ${files.length} files`);

                    const resultText =
                        files.length === 0
                            ? "No relevant files found."
                            : files.map((f) => ` - ${f}`).join("\n");

                    ctx.onXmlComplete(
                        `<dyad-code-search query="${escapeXmlAttr(args.query)}">${escapeXmlContent(resultText)}</dyad-code-search>`,
                    );

                    if (files.length === 0) {
                        return "No relevant files found for the given query.";
                    }

                    return `Found ${files.length} relevant file(s):\n${resultText}`;
                } catch (error: any) {
                    // grep returns exit code 1 when no matches found
                    if (error.code === 1) {
                        const noResult =
                            "No relevant files found for the given query.";
                        ctx.onXmlComplete(
                            `<dyad-code-search query="${escapeXmlAttr(args.query)}">${escapeXmlContent(noResult)}</dyad-code-search>`,
                        );
                        return noResult;
                    }
                    logger.error(`Error in code search:`, error);
                    return `Error performing code search: ${error instanceof Error ? error.message : String(error)}`;
                }
            }

            default:
                return `Error: Unknown action '${args.action}'.`;
        }
    },
};
