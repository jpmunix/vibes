import { z } from "zod";
import log from "electron-log";
import {
  ToolDefinition,
  AgentContext,
  escapeXmlAttr,
  escapeXmlContent,
} from "./types";
import { getIncrementalIndexer } from "../../../../../../ipc/utils/file_watcher";

const codeSearchSchema = z.object({
  query: z.string().describe("Search query to find relevant files"),
});

const logger = log.scope("code_search");

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
  isEnabled: () => true,

  getConsentPreview: (args) => `Search for "${args.query}"`,

  buildXml: (args, isComplete) => {
    if (!args.query) return undefined;
    if (isComplete) return undefined;
    return `<dyad-code-search query="${escapeXmlAttr(args.query)}">Searching...`;
  },

  execute: async (args, ctx: AgentContext) => {
    logger.log(`Executing semantic code search: ${args.query}`);

    try {
      // Use the vector index for semantic search
      const indexer = getIncrementalIndexer(ctx.appPath);
      const index = indexer.getIndex();

      // Search the vector index directly
      const relevantFiles = await index.search(args.query, 30);

      logger.log(`Semantic search returned ${relevantFiles.length} files`);

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
    } catch (error) {
      logger.error(`Error in code_search:`, error);
      return `Error performing semantic search: ${error instanceof Error ? error.message : String(error)}`;
    }
  },
};

