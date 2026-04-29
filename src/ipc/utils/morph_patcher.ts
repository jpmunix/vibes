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
 * Returns the GLOBAL OpenCode tools directory.
 *
 * OpenCode scans `~/.config/opencode/tools/` for custom tool overrides.
 * This is the path that works — NOT <CWD>/.opencode/tools/ (which is
 * relative to the project dir, not the server dir).
 */
function getMorphToolsDir(): string {
    const home = process.env.HOME || process.env.USERPROFILE || "";
    return path.join(home, ".config", "opencode", "tools");
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
// Tool Templates — scaffold-tools/
// ============================================================================
// Instead of embedding tool code as escaped template strings (prone to
// double-escaping bugs that crash OpenCode's tool loader), we keep the
// tool files as real .ts files in /scaffold-tools/ at the project root.
// This function just copies them to ~/.config/opencode/tools/.

/**
 * Resolve the path to the scaffold-tools directory bundled with the app.
 * Uses the same __dirname convention as scaffold_cache.ts:
 *   In both dev and packaged builds, __dirname points to the compiled output.
 *   scaffold-tools sits at ../../scaffold-tools relative to compiled handler files.
 */
function getScaffoldToolsSourceDir(): string {
    return path.join(__dirname, "..", "..", "scaffold-tools");
}

/**
 * Deploy the Morph custom tool overrides.
 * Copies real .ts files from scaffold-tools/ to <CWD>/.opencode/tools/.
 * Also cleans up any stale tools from the old global path.
 */
export function deployMorphTools(): void {
    const toolsDir = getMorphToolsDir();
    const sourceDir = getScaffoldToolsSourceDir();
    const toolFiles = ["apply_patch.ts", "patch.ts", "edit.ts"];

    logger.info(`[Morph] sourceDir = ${sourceDir}`);
    logger.info(`[Morph] toolsDir = ${toolsDir}`);

    // Clean up stale tools from the old CWD-based path
    const cwdToolsDir = path.join(process.cwd(), ".opencode", "tools");
    if (cwdToolsDir !== toolsDir && fs.existsSync(cwdToolsDir)) {
        for (const f of toolFiles) {
            const old = path.join(cwdToolsDir, f);
            if (fs.existsSync(old)) {
                try { fs.unlinkSync(old); } catch {}
            }
        }
    }

    try {
        fs.mkdirSync(toolsDir, { recursive: true });

        let deployed = 0;
        for (const fileName of toolFiles) {
            const src = path.join(sourceDir, fileName);
            const dst = path.join(toolsDir, fileName);

            if (!fs.existsSync(src)) {
                logger.warn(`[Morph] ⚠ Source not found: ${src}`);
                continue;
            }

            fs.copyFileSync(src, dst);
            deployed++;
        }

        logger.info(`[Morph] ✅ ${deployed} tools deployed → ${toolsDir}`);
    } catch (e: any) {
        logger.error(`[Morph] ❌ Failed to deploy tools: ${e.message}`);
    }
}

