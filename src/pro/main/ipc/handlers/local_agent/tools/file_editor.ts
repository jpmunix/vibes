/**
 * Unified file_editor tool — consolidates write_file, edit_file,
 * search_replace and patch_file into a single tool with an
 * `action` enum so the LLM doesn't have to guess which tool to use.
 *
 * The frontend XML tags (dyad-write, dyad-edit, dyad-search-replace,
 * dyad-patch) are preserved for backward compatibility with the UI.
 */

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
import { resolveFileUploadContent } from "./file_upload_utils";
import {
    applySearchReplace,
    formatMatchFailureSummary,
} from "@/pro/main/ipc/processors/search_replace_processor";
import { escapeSearchReplaceMarkers } from "@/pro/shared/search_replace_markers";
import { engineFetch } from "./engine_fetch";
import { sendTelemetryEvent } from "@/ipc/utils/telemetry";

const readFile = fs.promises.readFile;
const logger = log.scope("file_editor");

// ============================================================================
// Sub-schemas
// ============================================================================

const searchReplaceOperationSchema = z.object({
    old_string: z
        .string()
        .describe(
            "The text to replace (must be unique within the file, and must match the file contents exactly, including all whitespace and indentation)",
        ),
    new_string: z
        .string()
        .describe(
            "The edited text to replace the old_string (must be different from the old_string)",
        ),
});

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

// ============================================================================
// Main schema
// ============================================================================

const fileEditorSchema = z
    .object({
        action: z
            .enum(["create", "overwrite", "edit", "search_replace", "patch"])
            .describe(
                `The editing strategy to use:
- "create": Create a new file. Will fail if the file already exists.
- "overwrite": Completely rewrite an existing file with new content.
- "edit": Apply a sketched edit using "// ... existing code ..." placeholders. Best for changing a function or section while leaving the rest untouched.
- "search_replace": Find and replace an exact text match. Best for small, surgical edits (1-5 lines). Requires unique context lines.
- "patch": Line-number-based edits. Requires reading the file first with read_file to know line numbers. Best for precise multi-region edits.`,
            ),
        file_path: z.string().describe("The file path relative to the app root"),

        // Fields for create / overwrite
        content: z
            .string()
            .optional()
            .describe(
                "The full file content. Required for 'create' and 'overwrite' actions.",
            ),

        // Fields for edit
        edit_content: z
            .string()
            .optional()
            .describe(
                "The sketched edit content using '// ... existing code ...' markers. Required for 'edit' action.",
            ),
        instructions: z
            .string()
            .optional()
            .describe(
                "Instructions describing the edit (for the less intelligent merge model). Required for 'edit' action.",
            ),

        // Fields for search_replace
        search_replace: searchReplaceOperationSchema.optional().describe(
            "The search/replace operation. Required for 'search_replace' action.",
        ),

        // Fields for patch
        patch_operations: z
            .array(patchOperationSchema)
            .optional()
            .describe(
                "Array of line-range patch operations. Required for 'patch' action. Operations must be in ascending order and must not overlap.",
            ),

        // Shared
        description: z
            .string()
            .optional()
            .describe("Brief description of the change"),
    });

type FileEditorArgs = z.infer<typeof fileEditorSchema>;

// ============================================================================
// Helpers — carried over from original tools
// ============================================================================

function containsPlaceholders(content: string): boolean {
    return (
        content.includes("// ... existing code ...") ||
        content.includes("// ... existing code") ||
        content.includes("/* ... existing code ... */")
    );
}

function getRetryAttr(ctx: AgentContext | undefined, filePath: string): string {
    if (!ctx?.fileEditTracker?.[filePath]) return "";
    const counts = ctx.fileEditTracker[filePath];
    const total =
        counts.edit_file +
        counts.write_file +
        counts.search_replace +
        (counts.patch_file ?? 0);
    return total > 0 ? ` retry-count="${total}"` : "";
}

const turboFileEditResponseSchema = z.object({
    result: z.string(),
});

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
            `Fallo crítico en la fusión de archivos (Network Error). Reintenta usando action 'search_replace' con al menos 5 líneas de contexto. NO uses 'overwrite'.`,
            {
                retryable: true,
                hint: "Use action 'search_replace' instead of 'edit'.",
            },
        );
    }

    if (!response || !response.ok) {
        const errorText = await response?.text().catch(() => "Unknown error");
        logger.error("Turbo edit failed", errorText);
        throw new ToolError(
            `No se pudo fusionar el archivo correctamente (Engine Error: ${response?.status}). Reintenta usando action 'search_replace' con al menos 5 líneas de contexto. NO uses 'overwrite'.`,
            {
                retryable: true,
                hint: "Use action 'search_replace' instead of 'edit'.",
            },
        );
    }

    const data = turboFileEditResponseSchema.parse(await response.json());

    if (containsPlaceholders(data.result)) {
        logger.error("Turbo edit returned content with placeholders", data.result);
        throw new ToolError(
            "El motor de fusión devolvió un archivo incompleto (contiene marcadores de posición). Reintenta usando action 'search_replace' con al menos 5 líneas de contexto. NO uses 'overwrite'.",
            {
                retryable: true,
                hint: "Use action 'search_replace' instead of 'edit'.",
            },
        );
    }

    return data.result;
}

/**
 * Apply patch operations to file lines.
 * Operations must be sorted by start_line ascending and must not overlap.
 */
function applyPatchOperations(
    originalLines: string[],
    operations: NonNullable<FileEditorArgs["patch_operations"]>,
): string {
    const totalLines = originalLines.length;
    const sorted = [...operations].sort((a, b) => a.start_line - b.start_line);

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
                `Line ${op.end_line} is out of range. The file has ${totalLines} lines. Use explore_codebase with action 'read_file' to check file contents first.`,
                {
                    retryable: false,
                    hint: "Use explore_codebase with action 'read_file' to check current line count.",
                },
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

    const result = [...originalLines];
    for (let i = sorted.length - 1; i >= 0; i--) {
        const op = sorted[i];
        const startIdx = op.start_line - 1;
        const deleteCount = op.end_line - op.start_line + 1;
        const newLines = op.content === "" ? [] : op.content.split("\n");
        result.splice(startIdx, deleteCount, ...newLines);
    }

    return result.join("\n");
}

/**
 * Deploy Supabase function if applicable. Returns warning message or null.
 */
async function maybeDeploySupabase(
    filePath: string,
    ctx: AgentContext,
): Promise<string | null> {
    if (
        ctx.supabaseProjectId &&
        isServerFunction(filePath) &&
        !ctx.isSharedModulesChanged
    ) {
        try {
            await deploySupabaseFunction({
                supabaseProjectId: ctx.supabaseProjectId,
                functionName: path.basename(path.dirname(filePath)),
                appPath: ctx.appPath,
                organizationSlug: ctx.supabaseOrganizationSlug ?? null,
            });
        } catch (error) {
            return `File modified, but failed to deploy Supabase function: ${error}`;
        }
    }
    return null;
}

// ============================================================================
// Tool Description
// ============================================================================

const DESCRIPTION = `Unified tool for all file modifications.

Choose the right action via the "action" field:

| action           | When to use                                                        |
|------------------|--------------------------------------------------------------------|
| create           | Create a brand-new file that doesn't exist yet.                    |
| overwrite        | Rewrite an entire existing file with complete new content.         |
| edit             | Modify a section/function using "// ... existing code ..." sketch. |
| search_replace   | Small surgical edit (1-5 lines). Must provide unique context.      |
| patch            | Precise line-number edits. Requires reading file first.            |

RULES:
- For "create" and "overwrite": provide "content" with the FULL file content.
- For "edit": provide "edit_content" (the sketch) and "instructions".
- For "search_replace": provide "search_replace" with old_string and new_string. Include 3-5 context lines.
- For "patch": provide "patch_operations" array. Always use read_file first to get current line numbers.
- NEVER use "overwrite" with placeholder comments like "// ... existing code ...". Use "edit" instead.
`;

// ============================================================================
// Unified Tool Definition
// ============================================================================

export const fileEditorTool: ToolDefinition<FileEditorArgs> = {
    name: "file_editor",
    description: DESCRIPTION,
    inputSchema: fileEditorSchema,
    defaultConsent: "always",
    modifiesState: true,

    getConsentPreview: (args) => {
        const verb =
            args.action === "create"
                ? "Create"
                : args.action === "overwrite"
                    ? "Overwrite"
                    : "Edit";
        return `${verb} ${args.file_path}`;
    },

    buildXml: (args, isComplete, ctx) => {
        if (!args.file_path) return undefined;

        const retryAttr = getRetryAttr(ctx, args.file_path);
        const desc = escapeXmlAttr(
            args.description ?? args.instructions ?? "",
        );

        switch (args.action) {
            // ── create / overwrite → dyad-write ──
            case "create":
            case "overwrite": {
                let xml = `<dyad-write path="${escapeXmlAttr(args.file_path)}"${retryAttr} description="${desc}">\n${args.content ?? ""}`;
                if (isComplete) xml += "\n</dyad-write>";
                return xml;
            }

            // ── edit → dyad-edit ──
            case "edit": {
                let xml = `<dyad-edit path="${escapeXmlAttr(args.file_path)}"${retryAttr} description="${desc}">\n${args.edit_content ?? ""}`;
                if (isComplete) xml += "\n</dyad-edit>";
                return xml;
            }

            // ── search_replace → dyad-search-replace ──
            case "search_replace": {
                const escapedOld = escapeSearchReplaceMarkers(
                    args.search_replace?.old_string ?? "",
                );
                let xml = `<dyad-search-replace path="${escapeXmlAttr(args.file_path)}"${retryAttr} description="">\n<<<<<<< SEARCH\n${escapeXmlContent(escapedOld)}`;
                if (args.search_replace?.new_string !== undefined) {
                    const escapedNew = escapeSearchReplaceMarkers(
                        args.search_replace.new_string,
                    );
                    xml += `\n=======\n${escapeXmlContent(escapedNew)}`;
                }
                if (isComplete) {
                    if (args.search_replace?.new_string === undefined) {
                        xml += "\n=======\n";
                    }
                    xml += "\n>>>>>>> REPLACE\n</dyad-search-replace>";
                }
                return xml;
            }

            // ── patch → dyad-patch ──
            case "patch": {
                const ops = args.patch_operations ?? [];
                const opsPreview = ops
                    .map((op) =>
                        op.start_line === op.end_line
                            ? `L${op.start_line}`
                            : `L${op.start_line}-${op.end_line}`,
                    )
                    .join(", ");

                let xml = `<dyad-patch path="${escapeXmlAttr(args.file_path)}"${retryAttr} lines="${escapeXmlAttr(opsPreview)}" description="">`;
                if (isComplete && ops.length > 0) {
                    for (const op of ops) {
                        const range =
                            op.start_line === op.end_line
                                ? `L${op.start_line}`
                                : `L${op.start_line}-${op.end_line}`;
                        xml += `\n[${range}]\n${escapeXmlContent(op.content ?? "")}`;
                    }
                }
                if (isComplete) xml += "\n</dyad-patch>";
                return xml;
            }

            default:
                return undefined;
        }
    },

    execute: async (args, ctx: AgentContext) => {
        const fullFilePath = safeJoin(ctx.appPath, args.file_path);

        // Track shared module changes
        if (isSharedServerModule(args.file_path)) {
            ctx.isSharedModulesChanged = true;
        }

        switch (args.action) {
            // ────────────────────────────────────────────────
            // CREATE
            // ────────────────────────────────────────────────
            case "create": {
                if (!args.content) {
                    throw new ToolError("'content' is required for action 'create'.", {
                        retryable: true,
                    });
                }
                if (fs.existsSync(fullFilePath)) {
                    throw new ToolError(
                        `File already exists: ${args.file_path}. Use action 'overwrite' to replace it, or 'edit'/'search_replace'/'patch' to modify it.`,
                        { retryable: true },
                    );
                }

                // Resolve file upload IDs
                const resolved = await resolveFileUploadContent(
                    args.content,
                    ctx.chatId,
                );
                const contentToWrite = resolved.content;

                if (
                    typeof contentToWrite === "string" &&
                    containsPlaceholders(contentToWrite)
                ) {
                    throw new ToolError(
                        "No se puede usar 'create' con marcadores de posición ('// ... existing code ...'). Proporciona el contenido completo del archivo.",
                        { retryable: true },
                    );
                }

                const dirPath = path.dirname(fullFilePath);
                fs.mkdirSync(dirPath, { recursive: true });
                fs.writeFileSync(fullFilePath, contentToWrite);
                logger.log(`Successfully created file: ${fullFilePath}`);

                const deployMsg = await maybeDeploySupabase(args.file_path, ctx);
                return deployMsg ?? `Successfully created ${args.file_path}`;
            }

            // ────────────────────────────────────────────────
            // OVERWRITE
            // ────────────────────────────────────────────────
            case "overwrite": {
                if (!args.content) {
                    throw new ToolError(
                        "'content' is required for action 'overwrite'.",
                        { retryable: true },
                    );
                }

                // Resolve file upload IDs
                const resolved = await resolveFileUploadContent(
                    args.content,
                    ctx.chatId,
                );
                const contentToWrite = resolved.content;

                if (
                    typeof contentToWrite === "string" &&
                    containsPlaceholders(contentToWrite)
                ) {
                    throw new ToolError(
                        "No se puede usar 'overwrite' con marcadores de posición. Usa action 'edit' para ediciones parciales, o proporciona el contenido COMPLETO del archivo.",
                        {
                            retryable: true,
                            hint: "Use action 'edit' with edit_content for partial edits.",
                        },
                    );
                }

                const dirPath = path.dirname(fullFilePath);
                fs.mkdirSync(dirPath, { recursive: true });
                fs.writeFileSync(fullFilePath, contentToWrite);
                logger.log(`Successfully overwrote file: ${fullFilePath}`);

                const deployMsg = await maybeDeploySupabase(args.file_path, ctx);
                return deployMsg ?? `Successfully overwrote ${args.file_path}`;
            }

            // ────────────────────────────────────────────────
            // EDIT (TurboEdit)
            // ────────────────────────────────────────────────
            case "edit": {
                if (!args.edit_content) {
                    throw new ToolError(
                        "'edit_content' is required for action 'edit'.",
                        { retryable: true },
                    );
                }

                if (!fs.existsSync(fullFilePath)) {
                    throw new ToolError(`File does not exist: ${args.file_path}`, {
                        retryable: false,
                        hint: "Check the file path. Use action 'create' for new files.",
                    });
                }

                const originalContent = await readFile(fullFilePath, "utf8");
                const newContent = await callTurboFileEdit(
                    {
                        path: args.file_path,
                        content: args.edit_content,
                        originalContent,
                        instructions: args.instructions,
                    },
                    ctx,
                );

                if (!newContent) {
                    throw new ToolError(
                        "Failed to extract content from turbo-file-edit response",
                        {
                            retryable: true,
                            hint: "Try using action 'search_replace' instead.",
                        },
                    );
                }

                const dirPath = path.dirname(fullFilePath);
                fs.mkdirSync(dirPath, { recursive: true });
                fs.writeFileSync(fullFilePath, newContent);
                logger.log(`Successfully edited file: ${fullFilePath}`);

                const deployMsg = await maybeDeploySupabase(args.file_path, ctx);
                return deployMsg ?? `Successfully edited ${args.file_path}`;
            }

            // ────────────────────────────────────────────────
            // SEARCH_REPLACE
            // ────────────────────────────────────────────────
            case "search_replace": {
                if (!args.search_replace) {
                    throw new ToolError(
                        "'search_replace' object is required for action 'search_replace'.",
                        { retryable: true },
                    );
                }

                const { old_string, new_string } = args.search_replace;

                // Hard cap: after 2 failed attempts, force fallback
                if (ctx?.fileEditTracker?.[args.file_path]) {
                    const srCount = ctx.fileEditTracker[args.file_path].search_replace;
                    if (srCount >= 2) {
                        throw new ToolError(
                            `search_replace has failed ${srCount} times on ${args.file_path}. You MUST use explore_codebase with action 'read_file' to check the current file contents and then use file_editor with action 'overwrite' to rewrite the entire file. Do NOT attempt search_replace on this file again.`,
                            {
                                retryable: false,
                                hint: "Use explore_codebase(read_file) + file_editor(overwrite) instead.",
                            },
                        );
                    }
                }

                if (old_string === new_string) {
                    throw new ToolError(
                        "old_string and new_string must be different",
                        { retryable: false },
                    );
                }

                if (!fs.existsSync(fullFilePath)) {
                    throw new ToolError(
                        `File does not exist: ${args.file_path}`,
                        {
                            retryable: false,
                            hint: "Check the file path and try again.",
                        },
                    );
                }

                const original = await readFile(fullFilePath, "utf8");
                const escapedOld = escapeSearchReplaceMarkers(old_string);
                const escapedNew = escapeSearchReplaceMarkers(new_string);
                const operations = `<<<<<<< SEARCH\n${escapedOld}\n=======\n${escapedNew}\n>>>>>>> REPLACE`;

                const result = applySearchReplace(original, operations);

                if (!result.success || typeof result.content !== "string") {
                    sendTelemetryEvent("local_agent:search_replace:failure", {
                        filePath: args.file_path,
                        error: result.error ?? "unknown",
                    });
                    throw new ToolError(
                        `search_replace failed: old_string not found in ${args.file_path}. Use explore_codebase(read_file) to check current content, then use file_editor(overwrite).`,
                        {
                            retryable: false,
                            hint: "Do NOT retry search_replace. Use explore_codebase(read_file) then file_editor(overwrite).",
                        },
                    );
                }

                await fs.promises.writeFile(fullFilePath, result.content);
                logger.log(
                    `Successfully applied search-replace to: ${fullFilePath}`,
                );

                sendTelemetryEvent("local_agent:search_replace:success", {
                    filePath: args.file_path,
                    recoveryStrategy: result.recoveryStrategy,
                });

                const deployMsg = await maybeDeploySupabase(args.file_path, ctx);
                return (
                    deployMsg ??
                    `Successfully applied edits to ${args.file_path}`
                );
            }

            // ────────────────────────────────────────────────
            // PATCH
            // ────────────────────────────────────────────────
            case "patch": {
                if (
                    !args.patch_operations ||
                    args.patch_operations.length === 0
                ) {
                    throw new ToolError(
                        "'patch_operations' array is required and must not be empty for action 'patch'.",
                        { retryable: true },
                    );
                }

                if (!fs.existsSync(fullFilePath)) {
                    throw new ToolError(
                        `File does not exist: ${args.file_path}`,
                        {
                            retryable: false,
                            hint: "Check the file path and try again.",
                        },
                    );
                }

                const original = await readFile(fullFilePath, "utf8");
                const originalLines = original.split("\n");
                const newContent = applyPatchOperations(
                    originalLines,
                    args.patch_operations,
                );

                if (newContent === original) {
                    return `No changes needed — file ${args.file_path} already has the expected content.`;
                }

                await fs.promises.writeFile(fullFilePath, newContent);

                const opsCount = args.patch_operations.length;
                const linesAffected = args.patch_operations.reduce(
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

                const deployMsg = await maybeDeploySupabase(args.file_path, ctx);
                return (
                    deployMsg ??
                    `Successfully patched ${args.file_path} (${opsCount} operation${opsCount > 1 ? "s" : ""}, ${linesAffected} line${linesAffected > 1 ? "s" : ""} affected)`
                );
            }

            default:
                throw new ToolError(`Unknown action: ${args.action}`, {
                    retryable: false,
                });
        }
    },
};
