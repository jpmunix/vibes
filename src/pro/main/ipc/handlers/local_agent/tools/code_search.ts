import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import log from "electron-log";
import {
  ToolDefinition,
  AgentContext,
  escapeXmlAttr,
  escapeXmlContent,
} from "./types";

const execFileAsync = promisify(execFile);

const codeSearchSchema = z.object({
  query: z.string().describe("Search query to find relevant files"),
});

const logger = log.scope("code_search");

const DESCRIPTION = `Search the codebase using text-based grep to find files relevant to a query. Use this tool when you need to discover which files contain code related to a specific concept, feature, or functionality. Returns a list of file paths that match the search query.

### When to Use This Tool

- Explore unfamiliar codebases
- Ask "how / where / what" questions to understand behavior
- Find code by keyword or pattern

### When NOT to Use

Skip this tool for:
1. Reading known files (use \`read_file\`)
2. Listing directory contents (use \`list_files\`)
`;

export const codeSearchTool: ToolDefinition<z.infer<typeof codeSearchSchema>> =
{
  name: "code_search",
  description: DESCRIPTION,
  inputSchema: codeSearchSchema,
  defaultConsent: "always",

  isEnabled: () => true,

  getConsentPreview: (args) => `Search for "${args.query}"`,

  buildXml: (args, isComplete) => {
    if (!args.query) return undefined;
    if (isComplete) return undefined;
    return `<vibes-code-search query="${escapeXmlAttr(args.query)}">Searching...`;
  },

  execute: async (args, ctx: AgentContext) => {
    logger.log(`Executing code search: ${args.query}`);

    try {
      // Use grep to search for the query in the codebase
      const { stdout } = await execFileAsync(
        "grep",
        [
          "-r",         // recursive
          "-l",         // files-with-matches only
          "-i",         // case-insensitive
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

      // Parse results and make paths relative
      const files = stdout
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((f) => f.replace(/^\.\//, ""))
        .slice(0, 30); // Limit to 30 results

      logger.log(`Code search returned ${files.length} files`);

      const resultText =
        files.length === 0
          ? "No relevant files found."
          : files.map((f) => ` - ${f}`).join("\n");

      ctx.onXmlComplete(
        `<vibes-code-search query="${escapeXmlAttr(args.query)}">${escapeXmlContent(resultText)}</vibes-code-search>`,
      );

      logger.log(
        `Code search completed for query: ${args.query}, ${files.length} hits`,
      );

      if (files.length === 0) {
        return "No relevant files found for the given query.";
      }

      return `Found ${files.length} relevant file(s):\n${resultText}`;
    } catch (error: any) {
      // grep returns exit code 1 when no matches found — that's not an error
      if (error.code === 1) {
        const noResult = "No relevant files found for the given query.";
        ctx.onXmlComplete(
          `<vibes-code-search query="${escapeXmlAttr(args.query)}">${escapeXmlContent(noResult)}</vibes-code-search>`,
        );
        return noResult;
      }
      logger.error(`Error in code_search:`, error);
      return `Error performing code search: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
};
