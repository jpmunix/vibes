import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import log from "electron-log";
import { ToolDefinition, ToolError, AgentContext, escapeXmlAttr } from "./types";
import { safeJoin } from "@/ipc/utils/path_utils";
import { deploySupabaseFunction } from "../../../../../../supabase_admin/supabase_management_client";
import {
  isServerFunction,
  isSharedServerModule,
} from "../../../../../../supabase_admin/supabase_utils";
import { engineFetch } from "./engine_fetch";

const readFile = fs.promises.readFile;
const logger = log.scope("edit_file");

const editFileSchema = z.object({
  path: z.string().describe("The file path relative to the app root"),
  content: z.string().describe("The updated code snippet to apply"),
  instructions: z
    .string()
    .optional()
    .describe(
      "Instructions for the edit. A single sentence describing what you are going to do for the sketched edit. This helps the less intelligent model apply the edit correctly. Use first person to describe what you are doing. Don't repeat what you've said in previous messages. Use it to disambiguate any uncertainty in the edit.",
    ),
});

const turboFileEditResponseSchema = z.object({
  result: z.string(),
});

function containsPlaceholders(content: string): boolean {
  return (
    content.includes("// ... existing code ...") ||
    content.includes("// ... existing code") ||
    content.includes("/* ... existing code ... */")
  );
}

async function callTurboFileEdit(
  params: {
    path: string;
    content: string;
    originalContent: string;
    instructions?: string;
  },
  ctx: AgentContext,
): Promise<string> {
  logger.log("TurboEdit", "callTurboFileEdit", params);
  let response: Response | null = null;
  try {
    response = await engineFetch(ctx, "/tools/turbo-file-edit", {
      method: "POST",
      body: JSON.stringify({
        path: params.path,
        content: params.content,
        originalContent: params.originalContent,
        instructions: params.instructions ?? "",
      }),
    });
  } catch (error) {
    logger.warn("Turbo edit request failed", error);
    throw new ToolError(
      `Fallo crítico en la fusión de archivos (Network Error). Reintenta usando 'search_replace' con al menos 5 líneas de contexto antes y después de cada cambio. NO uses 'write_file'.`,
      { retryable: true, hint: "Use search_replace instead of edit_file." },
    );
  }

  if (!response || !response.ok) {
    const errorText = await response?.text().catch(() => "Unknown error");
    logger.error("Turbo edit failed", errorText);
    throw new ToolError(
      `No se pudo fusionar el archivo correctamente (Engine Error: ${response?.status}). Reintenta usando 'search_replace' con al menos 5 líneas de contexto antes y después de cada cambio. NO uses 'write_file'.`,
      { retryable: true, hint: "Use search_replace instead of edit_file." },
    );
  }

  const data = turboFileEditResponseSchema.parse(await response.json());

  // FINAL SAFETY CHECK: Never allow returning content that still has placeholders
  if (containsPlaceholders(data.result)) {
    logger.error("Turbo edit returned content with placeholders", data.result);
    throw new ToolError(
      "El motor de fusión devolvió un archivo incompleto (contiene marcadores de posición). Reintenta usando 'search_replace' con al menos 5 líneas de contexto antes y después de cada cambio. NO uses 'write_file'.",
      { retryable: true, hint: "Use search_replace instead of edit_file." },
    );
  }

  return data.result;
}

const DESCRIPTION = `
## When to Use edit_file

Use the \`edit_file\` tool when you need to modify **a section or function** within an existing file. The edit output will be read by a less intelligent model, which will quickly apply the edit. You should make it clear what the edit is, while also minimizing the unchanged code you write.

**Use only ONE edit_file call per file.** If you need to make multiple changes to the same file, include all edits in sequence within a single call using \`// ... existing code ...\` comments between them.

## When NOT to Use edit_file

Do NOT use this tool when:
- You are making a **small, surgical edit** (1-3 lines) like fixing a typo, renaming a variable, updating a single value, or changing an import. Use \`search_replace\` instead for these precise changes.
- You are creating a brand-new file (use \`write_file\` instead).
- You are rewriting most of an existing file (in those cases, use \`write_file\` to output the complete file instead).

## Basic Format

When writing the edit, you should specify each edit in sequence, with the special comment // ... existing code ... to represent unchanged code in between edited lines.

## General Principles

You should bias towards repeating as few lines of the original file as possible to convey the change.

NEVER show unmodified code in the edit, unless sufficient context of unchanged lines around the code you're editing is needed to resolve ambiguity.

DO NOT omit spans of pre-existing code without using the // ... existing code ... comment to indicate its absence.

## Example: Basic Edit
\\\`\\\`\\\`json
{
  "path": "LandingPage.tsx",
  "instructions": "I am changing the return statement in LandingPage to render a div with 'hello' instead of the previous content.",
  "content": "// ... existing code ...\\n\\nconst LandingPage = () => {\\n  // ... existing code ...\\n  return (\\n    <div>hello</div>\\n  );\\n};\\n\\n// ... existing code ..."
}
\\\`\\\`\\\`

## Example: Deleting Code

**When deleting code, you must provide surrounding context and leave an explicit comment indicating what was removed.**
\\\`\\\`\\\`json
{
  "path": "utils.ts",
  "instructions": "I am removing the deprecatedHelper function located between currentHelper and anotherHelper.",
  "content": "// ... existing code ...\\n\\nexport function currentHelper() {\\n  return \\"active\\";\\n}\\n\\n// REMOVED: deprecatedHelper() function\\n\\nexport function anotherHelper() {\\n  return \\"working\\";\\n}\\n\\n// ... existing code ..."
}
\\\`\\\`\\\`
`;
export const editFileTool: ToolDefinition<z.infer<typeof editFileSchema>> = {
  name: "edit_file",
  description: DESCRIPTION,
  inputSchema: editFileSchema,
  defaultConsent: "always",
  modifiesState: true,

  // Disable in Basic Agent mode (free tier) - requires engine
  isEnabled: (_ctx) => true,

  getConsentPreview: (args) => `Edit ${args.path}`,

  buildXml: (args, isComplete, ctx) => {
    if (!args.path) return undefined;

    let retryAttr = "";
    if (ctx?.fileEditTracker?.[args.path]) {
      const counts = ctx.fileEditTracker[args.path];
      const total = counts.edit_file + counts.write_file + counts.search_replace;
      if (total > 0) {
        retryAttr = ` retry-count="${total}"`;
      }
    }

    let xml = `<vibes-edit path="${escapeXmlAttr(args.path)}"${retryAttr} description="${escapeXmlAttr(args.instructions ?? "")}">\n${args.content ?? ""}`;
    if (isComplete) {
      xml += "\n</vibes-edit>";
    }
    return xml;
  },

  execute: async (args, ctx: AgentContext) => {
    const fullFilePath = safeJoin(ctx.appPath, args.path);

    // Track if this is a shared module
    if (isSharedServerModule(args.path)) {
      ctx.isSharedModulesChanged = true;
    }

    // Read original file content
    if (!fs.existsSync(fullFilePath)) {
      throw new ToolError(`File does not exist: ${args.path}`, {
        retryable: false,
        hint: "Check the file path. Use list_files to see available files.",
      });
    }

    const originalContent = await readFile(fullFilePath, "utf8");

    // Call the turbo-file-edit endpoint

    logger.log("TurboEdit", "args", args);
    const newContent = await callTurboFileEdit(
      {
        path: args.path,
        content: args.content,
        originalContent,
        instructions: args.instructions,
      },
      ctx,
    );

    if (!newContent) {
      throw new ToolError(
        "Failed to extract content from turbo-file-edit response",
        { retryable: true, hint: "Try using search_replace instead." },
      );
    }

    // Ensure directory exists
    const dirPath = path.dirname(fullFilePath);
    fs.mkdirSync(dirPath, { recursive: true });

    // Write file content
    fs.writeFileSync(fullFilePath, newContent);
    logger.log(`Successfully edited file: ${fullFilePath}`);

    // Deploy Supabase function if applicable
    if (
      ctx.supabaseProjectId &&
      isServerFunction(args.path) &&
      !ctx.isSharedModulesChanged
    ) {
      try {
        await deploySupabaseFunction({
          supabaseProjectId: ctx.supabaseProjectId,
          functionName: path.basename(path.dirname(args.path)),
          appPath: ctx.appPath,
          organizationSlug: ctx.supabaseOrganizationSlug ?? null,
        });
      } catch (error) {
        return `File edited, but failed to deploy Supabase function: ${error}`;
      }
    }

    return `Successfully edited ${args.path}`;
  },
};
