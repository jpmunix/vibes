import { z } from "zod";
import log from "electron-log";
import {
  ToolDefinition,
  AgentContext,
  escapeXmlAttr,
  escapeXmlContent,
} from "./types";
import { extractCodebase } from "../../../../../../utils/codebase";

const codeSearchSchema = z.object({
  query: z.string().describe("Search query to find relevant files"),
});

const FileContextSchema = z.object({
  path: z.string(),
  content: z.string(),
});


function rankFilesLocally({
  query,
  files,
  maxResults = 20,
}: {
  query: string;
  files: z.infer<typeof FileContextSchema>[];
  maxResults?: number;
}): string[] {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (terms.length === 0) return [];

  const scored = files.map((file) => {
    const pathLower = file.path.toLowerCase();
    const contentLower = file.content.toLowerCase();
    let score = 0;

    for (const term of terms) {
      if (pathLower.includes(term)) {
        score += 5; // path match is strong
      }
      // Count occurrences in content (cheap heuristic, capped)
      const matches = contentLower.split(term).length - 1;
      score += Math.min(matches, 5);
    }

    // Light bonus for shorter files (often more focused)
    const lengthBonus = Math.max(0, 3 - Math.floor(file.content.length / 5000));
    score += lengthBonus;

    return { path: file.path, score };
  });

  return scored
    .filter((f) => f.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map((f) => f.path);
}

const DESCRIPTION = `Search the codebase semantically to find files relevant to a query. Use this tool when you need to discover which files contain code related to a specific concept, feature, or functionality. Returns a list of file paths that are most relevant to the search query.

### When to Use This Tool

- Explore unfamiliar codebases
- Ask "how / where / what" questions to understand behavior
- Find code by meaning rather than exact text

### When NOT to Use

Skip this tool for:
1. Exact text matches (use \`grep\`)
2. Reading known files (use \`read_file\`)
3. Simple symbol lookups (use \`grep\`)
`;

export const codeSearchTool: ToolDefinition<z.infer<typeof codeSearchSchema>> =
  {
    name: "code_search",
    description: DESCRIPTION,
    inputSchema: codeSearchSchema,
    defaultConsent: "always",

    // Disable in Basic Agent mode (free tier) - requires engine
    isEnabled: (ctx) => true,

    getConsentPreview: (args) => `Search for "${args.query}"`,

    buildXml: (args, isComplete) => {
      if (!args.query) return undefined;
      if (isComplete) return undefined;
      return `<dyad-code-search query="${escapeXmlAttr(args.query)}">Searching...`;
    },

    execute: async (args, ctx: AgentContext) => {
      logger.log(`Executing code search: ${args.query}`);

      // Gather all files from the project (respecting chatContext includes/excludes)
      const { files } = await extractCodebase({
        appPath: ctx.appPath,
        chatContext: {
          contextPaths: [],
          smartContextAutoIncludes: [],
          excludePaths: [],
        },
      });

      // Map files to FileContext format (content may be trimmed/omitted upstream)
      const filesContext = files.map((file) => ({
        path: file.path,
        content: file.content,
      }));

      logger.log(`Locally searching ${filesContext.length} files`);

      // Local ranking (MCP/engine-free)
      const relevantFiles = rankFilesLocally({
        query: args.query,
        files: filesContext,
        maxResults: 30,
      });

      // Format results
      const resultText =
        relevantFiles.length === 0
          ? "No relevant files found."
          : relevantFiles.map((f) => ` - ${f}`).join("\n");

      // Write final result to UI and DB with dyad-code-search wrapper
      ctx.onXmlComplete(
        `<dyad-code-search query="${escapeXmlAttr(args.query)}">${escapeXmlContent(resultText)}</dyad-code-search>`,
      );

      logger.log(
        `Code search completed for query: ${args.query}, ${relevantFiles.length} hits`,
      );

      if (relevantFiles.length === 0) {
        return "No relevant files found for the given query.";
      }

      return `Found ${relevantFiles.length} relevant file(s):\n${resultText}`;
    },
  };
