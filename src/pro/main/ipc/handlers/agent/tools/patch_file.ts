import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import log from "electron-log";
import {
    ToolDefinition,
    ToolError,
    AgentContext,
    escapeXmlAttr,
    escapeXmlContent,
} from "./types";
import { safeJoin } from "@/ipc/utils/path_utils";
import { deploySupabaseFunction } from "@/supabase_admin/supabase_management_client";
import {
    isServerFunction,
    isSharedServerModule,
} from "@/supabase_admin/supabase_utils";
import { sendTelemetryEvent } from "@/ipc/utils/telemetry";

const logger = log.scope("patch_file");

/**
 * Single patch operation schema.
 * Each operation targets a line range and provides replacement content.
 */
const patchOperationSchema = z.object({
    start_line: z
        .number()
        .int()
        .min(1)
        .describe("The 1-based starting line number of the region to modify."),
    end_line: z
        .number()
        .int()
        .min(1)
        .describe(
            "The 1-based ending line number (inclusive) of the region to modify.",
        ),
    content: z
        .string()
        .describe(
            "The new content to replace the specified line range with. Use empty string to delete lines.",
        ),
});

const patchFileSchema = z.object({
    file_path: z
        .string()
        .describe("The path to the file to patch."),
    operations: z
        .array(patchOperationSchema)
        .min(1)
        .describe(
            "Array of patch operations. Each specifies a line range and new content. Operations must be in order from top to bottom (ascending start_line) and must NOT overlap.",
        ),
});

type PatchFileArgs = z.infer<typeof patchFileSchema>;

/**
 * Apply patch operations to file lines.
 * Operations must be sorted by start_line ascending and must not overlap.
 * Returns the new file content or throws on validation failure.
 */
function applyPatchOperations(
    originalLines: string[],
    operations: PatchFileArgs["operations"],
): string {
    const totalLines = originalLines.length;

    // Validate and sort operations
    const sorted = [...operations].sort((a, b) => a.start_line - b.start_line);

    // Check for overlaps and out-of-range
    for (let i = 0; i < sorted.length; i++) {
        const op = sorted[i];
        if (op.start_line > op.end_line) {
            throw new ToolError(
                `Invalid operation: start_line (${op.start_line}) > end_line (${op.end_line}).`,
                { retryable: false },
            );
        }
        if (op.end_line > totalLines) {
            throw new ToolError(
                `Line ${op.end_line} is out of range. The file has ${totalLines} lines. Use read_file to check the file contents first.`,
                { retryable: false, hint: "Use read_file to check current line count." },
            );
        }
        if (i > 0) {
            const prev = sorted[i - 1];
            if (op.start_line <= prev.end_line) {
                throw new ToolError(
                    `Overlapping operations: operation at lines ${prev.start_line}-${prev.end_line} overlaps with operation at lines ${op.start_line}-${op.end_line}.`,
                    { retryable: false },
                );
            }
        }
    }

    // Apply operations in reverse order to preserve line numbers
    const result = [...originalLines];
    for (let i = sorted.length - 1; i >= 0; i--) {
        const op = sorted[i];
        const startIdx = op.start_line - 1; // 0-based
        const deleteCount = op.end_line - op.start_line + 1;
        const newLines = op.content === "" ? [] : op.content.split("\n");
        result.splice(startIdx, deleteCount, ...newLines);
    }

    return result.join("\n");
}

export const patchFileTool: ToolDefinition<PatchFileArgs> = {
    name: "patch_file",
    description: `Apply precise line-based edits to an existing file.

Unlike search_replace, this tool uses LINE NUMBERS instead of text matching, making it deterministic and reliable.

REQUIREMENTS:
1. You MUST use read_file first to see the file with line numbers before using this tool.
2. Each operation specifies start_line, end_line (1-based, inclusive) and the new content.
3. Operations must NOT overlap and should be ordered from top to bottom.
4. To DELETE lines, set content to an empty string.
5. To INSERT lines, set start_line and end_line to the line AFTER which you want to insert, and include the original line plus the new lines in content.

EXAMPLE — Replace lines 10-12 with new code:
{
  "file_path": "src/app.ts",
  "operations": [
    { "start_line": 10, "end_line": 12, "content": "const x = 1;\\nconst y = 2;" }
  ]
}
`,
    inputSchema: patchFileSchema,
    defaultConsent: "always",
    modifiesState: true,

    getConsentPreview: (args) => `Patch ${args.file_path}`,

    buildXml: (args, isComplete, ctx) => {
        if (!args.file_path) return undefined;

        let retryAttr = "";
        if (ctx?.fileEditTracker?.[args.file_path]) {
            const counts = ctx.fileEditTracker[args.file_path];
            const total =
                counts.edit_file +
                counts.write_file +
                counts.search_replace +
                (counts.patch_file ?? 0);
            if (total > 0) {
                retryAttr = ` retry-count="${total}"`;
            }
        }

        // Build a human-readable summary of operations
        const ops = args.operations ?? [];
        const opsPreview = ops
            .map((op, i) => {
                const range =
                    op.start_line === op.end_line
                        ? `L${op.start_line}`
                        : `L${op.start_line}-${op.end_line}`;
                return `${range}`;
            })
            .join(", ");

        let xml = `<vibes-patch path="${escapeXmlAttr(args.file_path)}"${retryAttr} lines="${escapeXmlAttr(opsPreview)}" description="">`;

        if (isComplete && ops.length > 0) {
            // Include the operations content for the UI
            for (const op of ops) {
                const range =
                    op.start_line === op.end_line
                        ? `L${op.start_line}`
                        : `L${op.start_line}-${op.end_line}`;
                xml += `\n[${range}]\n${escapeXmlContent(op.content ?? "")}`;
            }
        }

        if (isComplete) {
            xml += "\n</vibes-patch>";
        }

        return xml;
    },

    execute: async (args, ctx: AgentContext) => {
        const fullFilePath = safeJoin(ctx.appPath, args.file_path);

        // Track shared module changes
        if (isSharedServerModule(args.file_path)) {
            ctx.isSharedModulesChanged = true;
        }

        if (!fs.existsSync(fullFilePath)) {
            throw new ToolError(`File does not exist: ${args.file_path}`, {
                retryable: false,
                hint: "Check the file path and try again.",
            });
        }

        const original = await fs.promises.readFile(fullFilePath, "utf8");
        const originalLines = original.split("\n");

        const newContent = applyPatchOperations(originalLines, args.operations);

        // Check if anything actually changed
        if (newContent === original) {
            return `No changes needed — file ${args.file_path} already has the expected content.`;
        }

        await fs.promises.writeFile(fullFilePath, newContent);

        const opsCount = args.operations.length;
        const linesAffected = args.operations.reduce(
            (sum, op) => sum + (op.end_line - op.start_line + 1),
            0,
        );
        logger.log(
            `Successfully patched ${args.file_path}: ${opsCount} operations, ${linesAffected} lines affected`,
        );

        sendTelemetryEvent("local_agent:patch_file:success", {
            filePath: args.file_path,
            operationCount: opsCount,
            linesAffected,
        });

        // Deploy Supabase function if applicable
        if (
            ctx.supabaseProjectId &&
            isServerFunction(args.file_path) &&
            !ctx.isSharedModulesChanged
        ) {
            try {
                await deploySupabaseFunction({
                    supabaseProjectId: ctx.supabaseProjectId,
                    functionName: path.basename(path.dirname(args.file_path)),
                    appPath: ctx.appPath,
                    organizationSlug: ctx.supabaseOrganizationSlug ?? null,
                });
            } catch (error) {
                return `Patch applied, but failed to deploy Supabase function: ${error}`;
            }
        }

        return `Successfully patched ${args.file_path} (${opsCount} operation${opsCount > 1 ? "s" : ""}, ${linesAffected} line${linesAffected > 1 ? "s" : ""} affected)`;
    },
};
