/**
 * morph_patcher.ts — Morph V3 Patch Engine
 *
 * Core service that powers the Morph custom tool overrides for OpenCode.
 * Handles:
 *  - morphPatch(): call Morph via OpenRouter with XML format
 *  - Tool template generation for .opencode/tools/ overrides
 *  - Deploy / remove lifecycle for OPENCODE_CONFIG_DIR
 *
 * Morph V3 models are specialized code-merge models (~400ms via OpenRouter).
 * They receive <instruction> + <code> + <update> and return merged code.
 */

import log from "electron-log";
import path from "node:path";
import fs from "node:fs";
import { app } from "electron";
import { openRouterCompletion } from "./openrouter";
import { readSettings } from "../../main/settings";

const logger = log.scope("morph_patcher");

// ============================================================================
// Types
// ============================================================================

export interface MorphPatchParams {
    /** First-person description of the change (e.g. "Fix the off-by-one error") */
    instruction: string;
    /** Complete original source code */
    originalCode: string;
    /** Partial update hint with `// ... existing code ...` markers (optional) */
    updateHint?: string;
    /** Model override — default: auto-select based on file size */
    model?: "morph/morph-v3-fast" | "morph/morph-v3-large" | "auto";
}

export interface MorphPatchResult {
    mergedCode: string;
    model: string;
    durationMs: number;
    inputTokens?: number;
    outputTokens?: number;
}

// ============================================================================
// Core patch function
// ============================================================================

/**
 * Call Morph via OpenRouter to merge code.
 * Constructs the XML prompt and returns the merged result.
 */
export async function morphPatch(params: MorphPatchParams): Promise<MorphPatchResult> {
    const { instruction, originalCode, updateHint } = params;

    // Auto-select model based on file size
    const lineCount = originalCode.split("\n").length;
    const settings = readSettings();
    const settingsModel = (settings as any).morphPatchModel as string | undefined;

    let model: string;
    if (params.model && params.model !== "auto") {
        model = params.model;
    } else if (settingsModel && settingsModel !== "auto") {
        model = settingsModel;
    } else {
        model = lineCount > 300 ? "morph/morph-v3-large" : "morph/morph-v3-fast";
    }

    // Build the XML prompt
    const parts: string[] = [
        `<instruction>${instruction}</instruction>`,
        `<code>${originalCode}</code>`,
    ];

    if (updateHint) {
        parts.push(`<update>${updateHint}</update>`);
    }

    const morphPrompt = parts.join("\n");

    const startTime = performance.now();

    const data = await openRouterCompletion({
        model,
        messages: [{ role: "user", content: morphPrompt }],
        temperature: 0,
        title: "vibes-morph-patch",
    });

    const durationMs = performance.now() - startTime;
    const mergedCode = data?.choices?.[0]?.message?.content;

    if (!mergedCode) {
        throw new Error("Morph returned empty response");
    }

    logger.info(`[Morph] Patched ${lineCount} lines in ${durationMs.toFixed(0)}ms (model: ${model})`);

    return {
        mergedCode,
        model,
        durationMs,
        inputTokens: data?.usage?.prompt_tokens,
        outputTokens: data?.usage?.completion_tokens,
    };
}

// ============================================================================
// Config directory management
// ============================================================================

/**
 * Returns the Vibes-managed OpenCode config directory.
 * Used as OPENCODE_CONFIG_DIR to inject custom tools without polluting user projects.
 */
export function getMorphConfigDir(): string {
    return path.join(app.getPath("userData"), "opencode-config");
}

/**
 * Returns the tools subdirectory inside the Morph config dir.
 */
function getMorphToolsDir(): string {
    return path.join(getMorphConfigDir(), "tools");
}

/**
 * Deploy the Morph custom tool overrides to the OPENCODE_CONFIG_DIR/tools/ directory.
 * Creates three files to cover all possible built-in tool names:
 *  - `apply_patch.ts` — overrides the `apply_patch` tool
 *  - `patch.ts`       — overrides the `patch` tool (may be an alias of apply_patch)
 *  - `edit.ts`        — overrides the `edit` tool
 */
export function deployMorphTools(): void {
    const toolsDir = getMorphToolsDir();

    try {
        fs.mkdirSync(toolsDir, { recursive: true });

        // Always overwrite to ensure latest template version
        // apply_patch + patch use the same template (same functionality, different names)
        fs.writeFileSync(path.join(toolsDir, "apply_patch.ts"), APPLY_PATCH_TOOL_TEMPLATE, "utf-8");
        fs.writeFileSync(path.join(toolsDir, "patch.ts"), APPLY_PATCH_TOOL_TEMPLATE, "utf-8");
        fs.writeFileSync(path.join(toolsDir, "edit.ts"), EDIT_TOOL_TEMPLATE, "utf-8");

        logger.info(`[Morph] ✅ Tools deployed (apply_patch + patch + edit) → ${toolsDir}`);
    } catch (e: any) {
        logger.error(`[Morph] ❌ Failed to deploy tools: ${e.message}`);
    }
}

/**
 * Remove the Morph custom tool overrides, restoring OpenCode's built-in tools.
 */
export function removeMorphTools(): void {
    const toolsDir = getMorphToolsDir();

    try {
        for (const name of ["apply_patch.ts", "patch.ts", "edit.ts"]) {
            const p = path.join(toolsDir, name);
            if (fs.existsSync(p)) {
                fs.unlinkSync(p);
                logger.info(`[Morph] 🗑️ Removed ${name}`);
            }
        }
        logger.info(`[Morph] ❌ Tools removed — built-in tools restored`);
    } catch (e: any) {
        logger.error(`[Morph] Failed to remove tools: ${e.message}`);
    }
}

/**
 * Check if Morph tools are currently deployed.
 */
export function areMorphToolsDeployed(): boolean {
    const toolsDir = getMorphToolsDir();
    return (
        fs.existsSync(path.join(toolsDir, "apply_patch.ts")) &&
        fs.existsSync(path.join(toolsDir, "patch.ts")) &&
        fs.existsSync(path.join(toolsDir, "edit.ts"))
    );
}


// ============================================================================
// Tool Templates
// ============================================================================
// These are written as raw strings that get saved as .ts files to the
// OPENCODE_CONFIG_DIR/tools/ directory. OpenCode discovers them at startup
// and uses them instead of the built-in tools with the same name.
//
// IMPORTANT: These templates are SELF-CONTAINED — they use fetch() and
// process.env directly, with NO imports from Vibes/Electron.

const APPLY_PATCH_TOOL_TEMPLATE = /* ts */ `import { tool } from "@opencode-ai/plugin"

export default tool({
    description:
        "Apply patches to files. Accepts the standard patch format with " +
        "'*** Update File:', '*** Add File:', '*** Delete File:' headers. " +
        "Uses Morph AI for ultrafast, accurate code merging (~400ms). " +
        "Replaces the built-in apply_patch tool.",
    args: {
        patchText: tool.schema.string().describe(
            "The patch to apply, using the standard patch format with *** headers"
        ),
    },
    async execute(args, context) {
        const startTotal = Date.now();
        console.log("[PATCH-TOOL] \\u2501\\u2501\\u2501 apply_patch tool invoked \\u2501\\u2501\\u2501");
        console.log("[PATCH-TOOL] Directory:", context.directory);
        console.log("[PATCH-TOOL] Patch text length:", args.patchText.length, "chars");
        console.log("[PATCH-TOOL] Patch text preview:", args.patchText.substring(0, 200));

        const fs = await import("fs/promises");
        const fsSync = await import("fs");
        const pathMod = await import("path");

        // \\u2500\\u2500 API Key check
        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
            console.error("[PATCH-TOOL] \\u274c FATAL: OPENROUTER_API_KEY not set in process.env");
            throw new Error("OPENROUTER_API_KEY not set \\u2014 cannot call Morph");
        }
        console.log("[PATCH-TOOL] \\u2713 API key found (length:", apiKey.length, ")");

        const { patchText } = args;
        const results: string[] = [];

        // \\u2500\\u2500 Parse patch
        console.log("[PATCH-TOOL] Parsing patch text...");
        let operations: PatchOp[];
        try {
            operations = parsePatch(patchText);
            console.log("[PATCH-TOOL] \\u2713 Parsed", operations.length, "operation(s):");
            for (const op of operations) {
                console.log("[PATCH-TOOL]   -", op.type, ":", op.filePath, 
                    op.type === "update" ? "(" + op.hunks.length + " hunks)" : 
                    op.type === "add" ? "(" + op.addedLines.length + " lines)" : "");
            }
        } catch (parseErr: any) {
            console.error("[PATCH-TOOL] \\u274c Parse failed:", parseErr.message);
            throw new Error("Failed to parse patch: " + parseErr.message);
        }

        if (operations.length === 0) {
            console.warn("[PATCH-TOOL] \\u26a0 No operations found in patch text. Returning empty result.");
            return "No operations found in patch text.";
        }

        // \\u2500\\u2500 Process each operation
        for (let opIdx = 0; opIdx < operations.length; opIdx++) {
            const op = operations[opIdx];
            const fullPath = pathMod.join(context.directory, op.filePath);
            console.log("[PATCH-TOOL] \\u2500\\u2500 Operation " + (opIdx + 1) + "/" + operations.length + ": " + op.type + " " + op.filePath);
            console.log("[PATCH-TOOL]    Full path:", fullPath);

            // ---- DELETE ----
            if (op.type === "delete") {
                console.log("[PATCH-TOOL]    Type: DELETE");
                if (fsSync.existsSync(fullPath)) {
                    try {
                        await fs.unlink(fullPath);
                        console.log("[PATCH-TOOL]    \\u2713 File deleted successfully");
                        results.push("Deleted " + op.filePath);
                    } catch (delErr: any) {
                        console.error("[PATCH-TOOL]    \\u274c Delete failed:", delErr.message);
                        results.push("Delete failed: " + op.filePath + " (" + delErr.message + ")");
                    }
                } else {
                    console.log("[PATCH-TOOL]    File already missing, skipping");
                    results.push("Already deleted: " + op.filePath);
                }
                continue;
            }

            // ---- ADD ----
            if (op.type === "add") {
                console.log("[PATCH-TOOL]    Type: ADD (" + op.addedLines.length + " lines)");
                try {
                    const dir = pathMod.dirname(fullPath);
                    await fs.mkdir(dir, { recursive: true });
                    const content = op.addedLines.map((l: string) => l.replace(/^\\+/, "")).join("\\n");
                    await fs.writeFile(fullPath, content, "utf-8");
                    console.log("[PATCH-TOOL]    \\u2713 File created (" + content.length + " chars)");
                    results.push("Created " + op.filePath);
                } catch (addErr: any) {
                    console.error("[PATCH-TOOL]    \\u274c Create failed:", addErr.message);
                    results.push("Create failed: " + op.filePath + " (" + addErr.message + ")");
                }
                continue;
            }

            // ---- UPDATE (Morph merge) ----
            console.log("[PATCH-TOOL]    Type: UPDATE via Morph (" + op.hunks.length + " hunks)");

            if (!fsSync.existsSync(fullPath)) {
                console.error("[PATCH-TOOL]    \\u274c File not found on disk:", fullPath);
                results.push("File not found: " + op.filePath);
                continue;
            }

            // Read original file
            let originalCode: string;
            try {
                originalCode = await fs.readFile(fullPath, "utf-8");
                console.log("[PATCH-TOOL]    \\u2713 Read original file:", originalCode.length, "chars,", originalCode.split("\\n").length, "lines");
            } catch (readErr: any) {
                console.error("[PATCH-TOOL]    \\u274c Read failed:", readErr.message);
                results.push("Read failed: " + op.filePath + " (" + readErr.message + ")");
                continue;
            }

            // Build Morph update block
            let updateBlock: string;
            try {
                updateBlock = buildMorphUpdate(op.hunks);
                console.log("[PATCH-TOOL]    \\u2713 Built Morph update block:", updateBlock.length, "chars");
                console.log("[PATCH-TOOL]    Update preview:", updateBlock.substring(0, 300));
            } catch (buildErr: any) {
                console.error("[PATCH-TOOL]    \\u274c Build update block failed:", buildErr.message);
                results.push("Build failed: " + op.filePath + " (" + buildErr.message + ")");
                continue;
            }

            // Select model
            const lineCount = originalCode.split("\\n").length;
            const model = lineCount > 300 ? "morph/morph-v3-large" : "morph/morph-v3-fast";
            console.log("[PATCH-TOOL]    Model selected:", model, "(file has", lineCount, "lines, threshold: 300)");

            // Build prompt
            const morphPrompt =
                "<instruction>Apply the following changes to the file</instruction>\\n" +
                "<code>" + originalCode + "</code>\\n" +
                "<update>" + updateBlock + "</update>";
            console.log("[PATCH-TOOL]    Morph prompt built:", morphPrompt.length, "chars total");

            // Call Morph via OpenRouter
            const startApi = Date.now();
            console.log("[PATCH-TOOL]    \\u27a1 Calling OpenRouter (model: " + model + ")...");

            let response: Response;
            try {
                response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": "Bearer " + apiKey,
                        "X-Title": "vibes-morph-patch",
                    },
                    body: JSON.stringify({
                        model,
                        messages: [{ role: "user", content: morphPrompt }],
                        temperature: 0,
                    }),
                });
            } catch (fetchErr: any) {
                const elapsed = Date.now() - startApi;
                console.error("[PATCH-TOOL]    \\u274c Fetch failed after " + elapsed + "ms:", fetchErr.message);
                results.push("Morph fetch failed: " + op.filePath + " (" + fetchErr.message + ")");
                continue;
            }

            const apiElapsed = Date.now() - startApi;
            console.log("[PATCH-TOOL]    \\u2b05 Response received in " + apiElapsed + "ms, status:", response.status);

            if (!response.ok) {
                let errorText = "";
                try { errorText = await response.text(); } catch {}
                console.error("[PATCH-TOOL]    \\u274c API error " + response.status + ":", errorText.substring(0, 500));
                results.push("Morph API error for " + op.filePath + ": " + response.status);
                continue;
            }

            // Parse response
            let data: any;
            try {
                data = await response.json();
                console.log("[PATCH-TOOL]    \\u2713 Response parsed. Usage:", JSON.stringify(data.usage || {}));
            } catch (jsonErr: any) {
                console.error("[PATCH-TOOL]    \\u274c JSON parse failed:", jsonErr.message);
                results.push("Response parse failed: " + op.filePath);
                continue;
            }

            const mergedCode = data.choices?.[0]?.message?.content;
            if (!mergedCode) {
                console.error("[PATCH-TOOL]    \\u274c Morph returned empty/null content. Full response:", JSON.stringify(data).substring(0, 500));
                results.push("Morph empty response: " + op.filePath);
                continue;
            }

            console.log("[PATCH-TOOL]    \\u2713 Merged code received:", mergedCode.length, "chars,", mergedCode.split("\\n").length, "lines");
            console.log("[PATCH-TOOL]    Size delta:", mergedCode.length - originalCode.length, "chars");

            // Write result
            try {
                await fs.writeFile(fullPath, mergedCode, "utf-8");
                console.log("[PATCH-TOOL]    \\u2713 File written successfully");
            } catch (writeErr: any) {
                console.error("[PATCH-TOOL]    \\u274c Write failed:", writeErr.message);
                results.push("Write failed: " + op.filePath + " (" + writeErr.message + ")");
                continue;
            }

            const msg = "Patched " + op.filePath + " via Morph (" + model + ", " + lineCount + " lines, " + apiElapsed + "ms)";
            console.log("[PATCH-TOOL]    \\u2713 " + msg);
            results.push(msg);
        }

        const totalElapsed = Date.now() - startTotal;
        console.log("[PATCH-TOOL] \\u2501\\u2501\\u2501 apply_patch complete \\u2501\\u2501\\u2501 " + operations.length + " ops in " + totalElapsed + "ms");
        console.log("[PATCH-TOOL] Results:", results.join(" | "));
        return results.join("\\n");
    },
});

// \\u2500\\u2500\\u2500 Patch parser \\u2500\\u2500\\u2500

interface PatchOp {
    type: "update" | "add" | "delete";
    filePath: string;
    hunks: PatchHunk[];
    addedLines: string[];
}

interface PatchHunk {
    contextBefore: string[];
    removedLines: string[];
    addedLines: string[];
    contextAfter: string[];
}

function parsePatch(patchText: string): PatchOp[] {
    const operations: PatchOp[] = [];
    const lines = patchText.split("\\n");
    console.log("[PATCH-TOOL] [parser] Total lines in patch:", lines.length);
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        if (line.startsWith("*** Delete File:")) {
            const filePath = line.replace("*** Delete File:", "").trim();
            console.log("[PATCH-TOOL] [parser] Found DELETE:", filePath);
            operations.push({ type: "delete", filePath, hunks: [], addedLines: [] });
            i++;
            continue;
        }

        if (line.startsWith("*** Add File:")) {
            const filePath = line.replace("*** Add File:", "").trim();
            const addedLines: string[] = [];
            i++;
            while (i < lines.length && !lines[i].startsWith("***")) {
                addedLines.push(lines[i]);
                i++;
            }
            console.log("[PATCH-TOOL] [parser] Found ADD:", filePath, "(" + addedLines.length + " lines)");
            operations.push({ type: "add", filePath, hunks: [], addedLines });
            continue;
        }

        if (line.startsWith("*** Update File:")) {
            const filePath = line.replace("*** Update File:", "").trim();
            const hunks: PatchHunk[] = [];
            i++;

            let currentHunk: PatchHunk = { contextBefore: [], removedLines: [], addedLines: [], contextAfter: [] };
            let inChange = false;
            let afterChange = false;

            while (i < lines.length && !lines[i].startsWith("***")) {
                const patchLine = lines[i];

                if (patchLine.startsWith("-")) {
                    if (afterChange) {
                        hunks.push(currentHunk);
                        currentHunk = { contextBefore: [], removedLines: [], addedLines: [], contextAfter: [] };
                        afterChange = false;
                    }
                    inChange = true;
                    currentHunk.removedLines.push(patchLine.slice(1));
                } else if (patchLine.startsWith("+")) {
                    inChange = true;
                    currentHunk.addedLines.push(patchLine.slice(1));
                } else if (patchLine.startsWith(" ") || patchLine === "") {
                    const content = patchLine.startsWith(" ") ? patchLine.slice(1) : patchLine;
                    if (inChange) {
                        afterChange = true;
                        inChange = false;
                        currentHunk.contextAfter.push(content);
                    } else {
                        currentHunk.contextBefore.push(content);
                    }
                }

                i++;
            }

            if (currentHunk.removedLines.length > 0 || currentHunk.addedLines.length > 0) {
                hunks.push(currentHunk);
            }

            console.log("[PATCH-TOOL] [parser] Found UPDATE:", filePath, "(" + hunks.length + " hunks)");
            for (let h = 0; h < hunks.length; h++) {
                const hk = hunks[h];
                console.log("[PATCH-TOOL] [parser]   Hunk " + (h+1) + ": -" + hk.removedLines.length + " +" + hk.addedLines.length + " (ctx: " + hk.contextBefore.length + "/" + hk.contextAfter.length + ")");
            }
            operations.push({ type: "update", filePath, hunks, addedLines: [] });
            continue;
        }

        i++;
    }

    console.log("[PATCH-TOOL] [parser] Total operations parsed:", operations.length);
    return operations;
}

function buildMorphUpdate(hunks: PatchHunk[]): string {
    if (hunks.length === 0) return "";

    const parts: string[] = [];
    parts.push("// ... existing code ...");

    for (let h = 0; h < hunks.length; h++) {
        const hunk = hunks[h];

        if (hunk.contextBefore.length > 0) {
            const ctx = hunk.contextBefore.slice(-3);
            parts.push(...ctx);
        }

        parts.push(...hunk.addedLines);

        if (hunk.contextAfter.length > 0) {
            const ctx = hunk.contextAfter.slice(0, 3);
            parts.push(...ctx);
        }

        if (h < hunks.length - 1) {
            parts.push("// ... existing code ...");
        }
    }

    parts.push("// ... existing code ...");
    return parts.join("\\n");
}
`;

const EDIT_TOOL_TEMPLATE = /* ts */ `import { tool } from "@opencode-ai/plugin"

export default tool({
    description:
        "Modify existing files by replacing exact text content. " +
        "Uses Morph AI for ultrafast, accurate code merging (~400ms). " +
        "Provide the file path, the exact text to find (old_string), " +
        "and the replacement text (new_string). " +
        "Replaces the built-in edit tool.",
    args: {
        file_path: tool.schema.string().describe("Relative path to the file to edit"),
        old_string: tool.schema.string().describe("Exact string to find in the file"),
        new_string: tool.schema.string().describe("Replacement string"),
    },
    async execute(args, context) {
        const startTotal = Date.now();
        console.log("[EDIT-TOOL] \\u2501\\u2501\\u2501 edit tool invoked \\u2501\\u2501\\u2501");
        console.log("[EDIT-TOOL] Directory:", context.directory);
        console.log("[EDIT-TOOL] File:", args.file_path);
        console.log("[EDIT-TOOL] old_string length:", args.old_string.length, "chars");
        console.log("[EDIT-TOOL] new_string length:", args.new_string.length, "chars");
        console.log("[EDIT-TOOL] old_string preview:", args.old_string.substring(0, 150));
        console.log("[EDIT-TOOL] new_string preview:", args.new_string.substring(0, 150));

        const fs = await import("fs/promises");
        const fsSync = await import("fs");
        const pathMod = await import("path");

        // \\u2500\\u2500 API Key check
        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
            console.error("[EDIT-TOOL] \\u274c FATAL: OPENROUTER_API_KEY not set in process.env");
            throw new Error("OPENROUTER_API_KEY not set \\u2014 cannot call Morph");
        }
        console.log("[EDIT-TOOL] \\u2713 API key found (length:", apiKey.length, ")");

        const { file_path, old_string, new_string } = args;
        const fullPath = pathMod.join(context.directory, file_path);
        console.log("[EDIT-TOOL] Full path:", fullPath);

        // \\u2500\\u2500 File existence check
        if (!fsSync.existsSync(fullPath)) {
            console.error("[EDIT-TOOL] \\u274c File not found on disk:", fullPath);
            throw new Error("File not found: " + file_path);
        }
        console.log("[EDIT-TOOL] \\u2713 File exists on disk");

        // \\u2500\\u2500 Read file
        let originalCode: string;
        try {
            originalCode = await fs.readFile(fullPath, "utf-8");
            console.log("[EDIT-TOOL] \\u2713 Read file:", originalCode.length, "chars,", originalCode.split("\\n").length, "lines");
        } catch (readErr: any) {
            console.error("[EDIT-TOOL] \\u274c Read failed:", readErr.message);
            throw new Error("Failed to read " + file_path + ": " + readErr.message);
        }

        // \\u2500\\u2500 Verify old_string exists
        if (!originalCode.includes(old_string)) {
            console.error("[EDIT-TOOL] \\u274c old_string NOT FOUND in file");
            console.error("[EDIT-TOOL]    old_string:", JSON.stringify(old_string.substring(0, 200)));
            console.error("[EDIT-TOOL]    File size:", originalCode.length, "chars");
            throw new Error(
                "old_string not found in " + file_path +
                ". Make sure the string matches exactly (including whitespace)."
            );
        }

        const matchCount = originalCode.split(old_string).length - 1;
        console.log("[EDIT-TOOL] \\u2713 old_string found in file (" + matchCount + " occurrence(s))");

        // \\u2500\\u2500 Build intended result
        const intendedResult = originalCode.replace(old_string, new_string);
        console.log("[EDIT-TOOL] \\u2713 Built intended result:", intendedResult.length, "chars (delta:", intendedResult.length - originalCode.length, ")");

        // \\u2500\\u2500 Select model
        const lineCount = originalCode.split("\\n").length;
        const model = lineCount > 300 ? "morph/morph-v3-large" : "morph/morph-v3-fast";
        console.log("[EDIT-TOOL] Model selected:", model, "(file has", lineCount, "lines, threshold: 300)");

        // \\u2500\\u2500 Build Morph prompt
        const morphPrompt =
            "<instruction>Replace the specified text in the file</instruction>\\n" +
            "<code>" + originalCode + "</code>\\n" +
            "<update>" + intendedResult + "</update>";
        console.log("[EDIT-TOOL] Morph prompt built:", morphPrompt.length, "chars total");

        // \\u2500\\u2500 Call Morph via OpenRouter
        const startApi = Date.now();
        console.log("[EDIT-TOOL] \\u27a1 Calling OpenRouter (model: " + model + ")...");

        let response: Response;
        try {
            response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + apiKey,
                    "X-Title": "vibes-morph-edit",
                },
                body: JSON.stringify({
                    model,
                    messages: [{ role: "user", content: morphPrompt }],
                    temperature: 0,
                }),
            });
        } catch (fetchErr: any) {
            const elapsed = Date.now() - startApi;
            console.error("[EDIT-TOOL] \\u274c Fetch failed after " + elapsed + "ms:", fetchErr.message);
            throw new Error("Morph fetch failed: " + fetchErr.message);
        }

        const apiElapsed = Date.now() - startApi;
        console.log("[EDIT-TOOL] \\u2b05 Response received in " + apiElapsed + "ms, status:", response.status);

        if (!response.ok) {
            let errorText = "";
            try { errorText = await response.text(); } catch {}
            console.error("[EDIT-TOOL] \\u274c API error " + response.status + ":", errorText.substring(0, 500));
            throw new Error("Morph API error: " + response.status + " " + errorText);
        }

        // \\u2500\\u2500 Parse response
        let data: any;
        try {
            data = await response.json();
            console.log("[EDIT-TOOL] \\u2713 Response parsed. Usage:", JSON.stringify(data.usage || {}));
        } catch (jsonErr: any) {
            console.error("[EDIT-TOOL] \\u274c JSON parse failed:", jsonErr.message);
            throw new Error("Morph response parse failed: " + jsonErr.message);
        }

        const mergedCode = data.choices?.[0]?.message?.content;
        if (!mergedCode) {
            console.error("[EDIT-TOOL] \\u274c Morph returned empty/null content");
            console.error("[EDIT-TOOL]    Full response:", JSON.stringify(data).substring(0, 500));
            throw new Error("Morph returned empty response for " + file_path);
        }

        console.log("[EDIT-TOOL] \\u2713 Merged code received:", mergedCode.length, "chars,", mergedCode.split("\\n").length, "lines");
        console.log("[EDIT-TOOL] Size delta:", mergedCode.length - originalCode.length, "chars");

        // \\u2500\\u2500 Write result
        try {
            await fs.writeFile(fullPath, mergedCode, "utf-8");
            console.log("[EDIT-TOOL] \\u2713 File written successfully");
        } catch (writeErr: any) {
            console.error("[EDIT-TOOL] \\u274c Write failed:", writeErr.message);
            throw new Error("Failed to write " + file_path + ": " + writeErr.message);
        }

        const totalElapsed = Date.now() - startTotal;
        const result = "Edited " + file_path + " via Morph (" + model + ", " + lineCount + " lines, " + apiElapsed + "ms)";
        console.log("[EDIT-TOOL] \\u2501\\u2501\\u2501 edit complete \\u2501\\u2501\\u2501 " + totalElapsed + "ms total");
        console.log("[EDIT-TOOL] Result:", result);
        return result;
    },
});
`;

