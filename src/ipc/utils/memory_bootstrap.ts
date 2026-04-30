/**
 * Memory Bootstrap — Cold Start System
 *
 * Generates foundational memories for new or imported projects by:
 * 1. Phase 1 (ADN): Scanning config files + docs → direct OpenRouter call (~3s)
 * 2. Phase 2 (Explore): OpenCode read-only subagent navigates codebase (~20s)
 *
 * Idempotent: checks existing memories before running.
 * Fire-and-forget: never blocks the user's prompt.
 */

import log from "electron-log";
import * as fs from "fs";
import * as path from "path";
import { readSettings } from "../../main/settings";
import { openRouterCompletion, hasOpenRouterApiKey } from "./openrouter";
import { getRemoteDb } from "../../db/remote";
import * as remoteSchema from "../../db/remote-schema";
import { eq, and } from "drizzle-orm";
import { getEffectivePrompt } from "../../prompts";
import { handleAdd } from "./memory_extractor";
import { logPipelineCall } from "./memory_telemetry";
import { DEFAULT_STANDARD_MODEL } from "../../lib/schemas";
import type { MemoryEntry } from "../types/memory";
import { debugLog, debugSection, debugCodeBlock, debugList, debugSessionStart, setDebugContext } from "./memory_debug_log";

const logger = log.scope("memory_bootstrap");

// =============================================================================
// Types
// =============================================================================

interface ProjectDNA {
    hasSignificantContent: boolean;
    configFiles: string[];
    configSnippets: Record<string, string>;
    directoryTree: string;
}

interface BootstrapResult {
    phase1Count: number;
    phase2Count: number;
}

// =============================================================================
// Config File Detectors — language-agnostic
// =============================================================================

const CONFIG_FILES: { file: string; maxBytes: number }[] = [
    { file: "package.json", maxBytes: 3000 },
    { file: "composer.json", maxBytes: 1500 },
    { file: "requirements.txt", maxBytes: 1500 },
    { file: "pyproject.toml", maxBytes: 1500 },
    { file: "Cargo.toml", maxBytes: 1500 },
    { file: "go.mod", maxBytes: 1500 },
    { file: "Gemfile", maxBytes: 800 },
    { file: "pubspec.yaml", maxBytes: 800 },
    { file: "tsconfig.json", maxBytes: 800 },
    { file: "docker-compose.yml", maxBytes: 800 },
    { file: "docker-compose.yaml", maxBytes: 800 },
    // .env.example removed — integrations inject env vars; agent can read the file itself
];

const CONFIG_GLOBS: { pattern: RegExp; maxBytes: number }[] = [
    { pattern: /^tailwind\.config\.(ts|js|mjs|cjs)$/, maxBytes: 500 },
    { pattern: /^drizzle\.config\.(ts|js|mjs)$/, maxBytes: 500 },
    { pattern: /^vite\.config\.(ts|js|mjs)$/, maxBytes: 500 },
    { pattern: /^next\.config\.(ts|js|mjs)$/, maxBytes: 500 },
    { pattern: /^nuxt\.config\.(ts|js)$/, maxBytes: 500 },
    { pattern: /^astro\.config\.(ts|js|mjs)$/, maxBytes: 500 },
    { pattern: /^webpack\.config\.(ts|js)$/, maxBytes: 500 },
    { pattern: /^angular\.json$/, maxBytes: 500 },
];

// =============================================================================
// DNA Collector
// =============================================================================

function readFileSafe(filePath: string, maxBytes: number): string | null {
    try {
        if (!fs.existsSync(filePath)) return null;
        const stat = fs.statSync(filePath);
        if (stat.size === 0) return null;
        const buf = Buffer.alloc(Math.min(stat.size, maxBytes));
        const fd = fs.openSync(filePath, "r");
        fs.readSync(fd, buf, 0, buf.length, 0);
        fs.closeSync(fd);
        return buf.toString("utf-8");
    } catch {
        return null;
    }
}

function getDirectoryTree(dir: string, maxDepth = 2, prefix = ""): string {
    const lines: string[] = [];
    try {
        const entries = fs.readdirSync(dir, { withFileTypes: true })
            .filter(e => !e.name.startsWith(".") && e.name !== "node_modules" && e.name !== "vendor" && e.name !== "__pycache__" && e.name !== "dist" && e.name !== "build")
            .slice(0, 30);

        for (const entry of entries) {
            if (entry.isDirectory()) {
                lines.push(`${prefix}${entry.name}/`);
                if (maxDepth > 1) {
                    lines.push(getDirectoryTree(path.join(dir, entry.name), maxDepth - 1, prefix + "  "));
                }
            } else {
                lines.push(`${prefix}${entry.name}`);
            }
        }
    } catch { /* ignore permission errors */ }
    return lines.join("\n");
}


export async function collectProjectDNA(
    projectDir: string,
): Promise<ProjectDNA> {
    const configSnippets: Record<string, string> = {};
    const configFiles: string[] = [];

    debugSection("collectProjectDNA");
    debugLog("DNA", `Starting scan`, { dir: projectDir });

    // 1. Read exact-name config files
    for (const { file, maxBytes } of CONFIG_FILES) {
        const content = readFileSafe(path.join(projectDir, file), maxBytes);
        if (content) {
            configFiles.push(file);
            configSnippets[file] = content;
            debugLog("DNA", `✅ Found config: ${file}`, { size: `${content.length} bytes` });
        }
    }

    // 2. Read glob-matched config files from root
    try {
        const rootEntries = fs.readdirSync(projectDir);
        for (const entry of rootEntries) {
            for (const { pattern, maxBytes } of CONFIG_GLOBS) {
                if (pattern.test(entry) && !configSnippets[entry]) {
                    const content = readFileSafe(path.join(projectDir, entry), maxBytes);
                    if (content) {
                        configFiles.push(entry);
                        configSnippets[entry] = content;
                        debugLog("DNA", `✅ Found glob config: ${entry}`, { size: `${content.length} bytes` });
                    }
                }
            }
        }
    } catch { /* ignore */ }

    debugLog("DNA", `Config scan complete`, { found: configFiles.length.toString(), files: configFiles.join(", ") });

    // AGENTS.md — NOT collected (OpenCode injects it natively into the agent context)
    // DESIGN.md — NOT collected (injected as contextInstruction on first message)
    // .env.example — NOT collected (integrations inject env vars; agent can read it)

    // 3. Directory tree
    const directoryTree = getDirectoryTree(projectDir, 2);
    debugLog("DNA", `Directory tree collected`, { lines: directoryTree.split("\n").length.toString() });

    const hasSignificantContent = configFiles.length > 0;
    debugLog("DNA", `Scan result: hasSignificantContent=${hasSignificantContent}`, {
        configs: configFiles.length.toString(),
        treeLines: directoryTree.split("\n").length.toString(),
    });

    return {
        hasSignificantContent,
        configFiles,
        configSnippets,
        directoryTree,
    };
}

// =============================================================================
// Format DNA for LLM
// =============================================================================

function formatDNAForLLM(dna: ProjectDNA): string {
    const parts: string[] = ["# PROJECT DNA", ""];

    // Config files
    if (Object.keys(dna.configSnippets).length > 0) {
        parts.push("## Configuration Files");
        for (const [file, content] of Object.entries(dna.configSnippets)) {
            parts.push(`### ${file}`);
            parts.push("```");
            parts.push(content);
            parts.push("```");
            parts.push("");
        }
    }

    // Directory structure
    if (dna.directoryTree) {
        parts.push("## Directory Structure (top 2 levels)");
        parts.push("```");
        parts.push(dna.directoryTree);
        parts.push("```");
        parts.push("");
    }

    return parts.join("\n");
}

// =============================================================================
// Phase 1: ADN Rápido
// =============================================================================

async function bootstrapFromDNA(params: {
    appId: number;
    userId: string;
    dna: ProjectDNA;
}): Promise<string[]> {
    const { appId, userId, dna } = params;
    const settings = readSettings();

    const model = settings.memoriesSynthesisModelV2
        || settings.standardModeModel
        || DEFAULT_STANDARD_MODEL;

    const onboardingPrompt = getEffectivePrompt("memory_onboarding", settings);
    const userMessage = formatDNAForLLM(dna);

    debugSection("Phase 1: bootstrapFromDNA");
    debugLog("Phase1", `Starting`, { model, configs: dna.configFiles.length.toString(), payloadSize: `${userMessage.length} chars` });
    debugCodeBlock("System Prompt (memory_onboarding)", onboardingPrompt);
    debugCodeBlock("User Message (formatted DNA)", userMessage);

    logger.info(`[Bootstrap] Phase 1 (DNA): ${dna.configFiles.length} configs, payload=${userMessage.length} chars`);

    const t0 = Date.now();
    let rawContent: string;
    try {
        const data = await openRouterCompletion({
            model,
            messages: [
                { role: "system", content: onboardingPrompt },
                { role: "user", content: userMessage },
            ],
            temperature: 0.2,
            max_tokens: 1500,
            response_format: { type: "json_object" },
            title: "Vibes - Memory Bootstrap DNA",
        });
        rawContent = data.choices?.[0]?.message?.content?.trim() || "";
    } catch (err: any) {
        debugLog("Phase1", `❌ LLM call FAILED`, { error: err.message, durationMs: `${Date.now() - t0}ms` });
        logger.warn(`[Bootstrap] Phase 1 LLM call failed: ${err.message}`);
        logPipelineCall({
            userId, appId,
            stage: "bootstrap-dna", model,
            systemPrompt: onboardingPrompt,
            userMessage,
            resultCount: 0,
            durationMs: Date.now() - t0,
            success: false,
            error: err.message,
        });
        return [];
    }

    const durationMs = Date.now() - t0;

    debugLog("Phase1", `LLM responded`, { durationMs: `${durationMs}ms`, responseSize: `${rawContent.length} chars` });

    if (!rawContent) {
        debugLog("Phase1", `⚠️ Empty response from LLM`);
        logPipelineCall({
            userId, appId,
            stage: "bootstrap-dna", model,
            systemPrompt: onboardingPrompt,
            userMessage,
            rawResponse: "",
            resultCount: 0, durationMs, success: true,
        });
        return [];
    }

    debugCodeBlock("LLM Raw Response", rawContent, "json");

    // Parse operations
    let operations: any[];
    try {
        const parsed = JSON.parse(rawContent);
        operations = parsed.operations || [];
    } catch {
        debugLog("Phase1", `❌ JSON parse FAILED`, { excerpt: rawContent.slice(0, 200) });
        logger.warn(`[Bootstrap] Phase 1 JSON parse failed: ${rawContent.slice(0, 200)}`);
        logPipelineCall({
            userId, appId,
            stage: "bootstrap-dna", model,
            systemPrompt: onboardingPrompt,
            userMessage,
            rawResponse: rawContent,
            resultCount: 0, durationMs, success: false,
            error: "JSON parse error",
        });
        return [];
    }

    // Process operations via shared handleAdd
    const db = getRemoteDb();
    const existingRows = await db
        .select()
        .from(remoteSchema.memories)
        .where(
            and(
                eq(remoteSchema.memories.userId, userId),
                eq(remoteSchema.memories.appId, appId),
                eq(remoteSchema.memories.enabled, 1),
            ),
        );

    const VALID_TYPES = new Set(["fact", "preference", "issue", "episode", "decision"]);
    const now = new Date();
    const persistedKeys: string[] = [];
    const persisted: MemoryEntry[] = [];

    debugLog("Phase1", `Processing ${operations.length} operations`, { existingMemories: existingRows.length.toString() });

    for (const op of operations.slice(0, 15)) {
        try {
            if (op.action !== "add") {
                debugLog("Phase1", `⏭️ Skipping op (action=${op.action})`, { key: op.key || "?" });
                continue;
            }
            const result = await handleAdd(op, db, existingRows, userId, appId, 0, now, VALID_TYPES);
            if (result) {
                persisted.push(result);
                if (result.key) persistedKeys.push(result.key);
                debugLog("Phase1", `✅ Persisted: [${op.type}] ${op.key}`, { content: op.content?.slice(0, 100), importance: String(op.importance) });
            } else {
                debugLog("Phase1", `⚠️ handleAdd returned null for ${op.key}`, { type: op.type });
            }
        } catch (err: any) {
            debugLog("Phase1", `❌ Op failed: ${op.key}`, { error: err.message });
            logger.warn(`[Bootstrap] Phase 1 op failed: ${err.message}`);
        }
    }

    // Log with enriched metadata
    logPipelineCall({
        userId, appId,
        stage: "bootstrap-dna", model,
        systemPrompt: onboardingPrompt,
        userMessage,
        rawResponse: rawContent,
        parsedResult: JSON.stringify({
            operations,
            meta: {
                configFilesFound: dna.configFiles,
                dnaPayloadSize: userMessage.length,
                inputTokensEstimate: Math.ceil(userMessage.length / 4),
                operationsGenerated: operations.length,
                operationsPersisted: persisted.length,
            },
        }),
        resultCount: persisted.length,
        durationMs,
        success: true,
    });

    debugLog("Phase1", `✅ Phase 1 COMPLETE`, {
        memoriesCreated: persisted.length.toString(),
        keys: persistedKeys.join(", "),
        durationMs: `${durationMs}ms`,
    });
    debugList("Phase 1 — Persisted Keys", persistedKeys);

    logger.info(`[Bootstrap] Phase 1 complete: ${persisted.length} memories created from ${dna.configFiles.length} configs (${durationMs}ms)`);
    return persistedKeys;
}

// =============================================================================
// Phase 2: Explore Profundo (OpenCode subagent)
// =============================================================================

async function bootstrapFromExplore(params: {
    appId: number;
    userId: string;
    projectDir: string;
    existingKeys: string[];
}): Promise<number> {
    const { appId, userId, projectDir, existingKeys } = params;

    debugSection("Phase 2: bootstrapFromExplore");

    // Dynamically import to avoid circular dependency at module load
    let getOpenCodeClientInstance: () => any;
    try {
        const adapter = await import("../handlers/opencode_adapter");
        getOpenCodeClientInstance = (adapter as any).getOpenCodeClientInstance;
    } catch {
        debugLog("Phase2", `❌ Skipped: opencode_adapter not importable`);
        logger.warn("[Bootstrap] Phase 2 skipped: opencode_adapter not available");
        return 0;
    }

    const client = getOpenCodeClientInstance?.();
    if (!client) {
        debugLog("Phase2", `❌ Skipped: no OpenCode client instance`);
        logger.warn("[Bootstrap] Phase 2 skipped: no OpenCode client instance");
        return 0;
    }

    debugLog("Phase2", `✅ OpenCode client available`);

    const existingKeysBlock = existingKeys.length > 0
        ? `\n\nYa se extrajeron estas keys en la Fase 1 (NO las repitas): ${existingKeys.join(", ")}`
        : "";

    const explorePrompt = [
        `Analiza el codebase del proyecto en "${projectDir}" para descubrir patrones arquitectónicos.`,
        "",
        "BUSCA:",
        "- Estructura de carpetas y convenciones de naming",
        "- Patrones de componentes (atomic, feature-based, etc.)",
        "- Estrategia de state management",
        "- ORM y esquema de base de datos",
        "- Estrategia de routing",
        "- Patrones de testing",
        "- Configuración de CI/CD",
        "- Manejo de errores y logging",
        "",
        "Usa grep, read y glob para navegar el código. Lee los archivos clave.",
        "",
        "Al final, devuelve un bloque JSON con el formato:",
        '{"operations": [{"action": "add", "type": "fact|decision|preference", "key": "snake_case_key", "content": "Descripción en español", "importance": 0.85}]}',
        "",
        "Reglas: content en español, key en inglés snake_case, importance 0.8-0.95, máximo 15 operaciones.",
        existingKeysBlock,
    ].join("\n");

    debugCodeBlock("Explore Prompt", explorePrompt);
    debugLog("Phase2", `Sending to Explore agent`, { existingKeysToSkip: existingKeys.join(", ") || "(none)" });

    const t0 = Date.now();
    let rawResponse = "";

    try {
        // Create a temporary session for explore
        const session = await client.session.create({});
        const sessionId = session.id;
        debugLog("Phase2", `Session created`, { sessionId: String(sessionId) });

        // Use the explore agent for read-only codebase navigation
        const result = await client.chat.prompt({
            sessionId,
            content: explorePrompt,
            agent: "explore",
        });

        // Collect the response text
        if (result && typeof result === "object" && "text" in result) {
            rawResponse = (result as any).text || "";
        } else if (typeof result === "string") {
            rawResponse = result;
        }

        debugLog("Phase2", `Explore agent responded`, { responseSize: `${rawResponse.length} chars`, durationMs: `${Date.now() - t0}ms` });
        debugCodeBlock("Explore Agent Response", rawResponse);

        // Try to clean up session
        try { await client.session.delete({ id: sessionId }); } catch { /* ignore */ }
    } catch (err: any) {
        debugLog("Phase2", `❌ Explore agent FAILED`, { error: err.message, durationMs: `${Date.now() - t0}ms` });
        logger.warn(`[Bootstrap] Phase 2 Explore agent failed: ${err.message}`);
        logPipelineCall({
            userId, appId,
            stage: "bootstrap-explore",
            resultCount: 0,
            durationMs: Date.now() - t0,
            success: false,
            error: err.message,
        });
        return 0;
    }

    const durationMs = Date.now() - t0;

    // Try to extract JSON from the response
    let operations: any[] = [];
    try {
        const jsonMatch = rawResponse.match(/\{[\s\S]*"operations"[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            operations = parsed.operations || [];
            debugLog("Phase2", `JSON extracted: ${operations.length} operations`);
        } else {
            debugLog("Phase2", `⚠️ No JSON block found in response`);
        }
    } catch {
        debugLog("Phase2", `❌ JSON parse failed from explore response`);
        logger.info("[Bootstrap] Phase 2: could not parse JSON from explore response");
    }

    if (operations.length === 0) {
        debugLog("Phase2", `⚠️ 0 operations — nothing to persist`);
        logPipelineCall({
            userId, appId,
            stage: "bootstrap-explore",
            rawResponse: rawResponse.slice(0, 2000),
            resultCount: 0, durationMs, success: true,
        });
        return 0;
    }

    // Process operations
    const db = getRemoteDb();
    const existingRows = await db
        .select()
        .from(remoteSchema.memories)
        .where(
            and(
                eq(remoteSchema.memories.userId, userId),
                eq(remoteSchema.memories.appId, appId),
                eq(remoteSchema.memories.enabled, 1),
            ),
        );

    const VALID_TYPES = new Set(["fact", "preference", "issue", "episode", "decision"]);
    const now = new Date();
    let persistedCount = 0;

    debugLog("Phase2", `Processing ${operations.length} operations`, { existingMemories: existingRows.length.toString() });

    for (const op of operations.slice(0, 15)) {
        try {
            if (op.action !== "add") {
                debugLog("Phase2", `⏭️ Skipping (action=${op.action})`, { key: op.key || "?" });
                continue;
            }
            // Skip keys already bootstrapped in Phase 1
            if (op.key && existingKeys.includes(op.key)) {
                debugLog("Phase2", `⏭️ Skipping (Phase 1 duplicate): ${op.key}`);
                continue;
            }
            const result = await handleAdd(op, db, existingRows, userId, appId, 0, now, VALID_TYPES);
            if (result) {
                persistedCount++;
                debugLog("Phase2", `✅ Persisted: [${op.type}] ${op.key}`, { content: op.content?.slice(0, 100) });
            } else {
                debugLog("Phase2", `⚠️ handleAdd returned null for ${op.key}`);
            }
        } catch (err: any) {
            logger.warn(`[Bootstrap] Phase 2 op failed: ${err.message}`);
        }
    }

    logPipelineCall({
        userId, appId,
        stage: "bootstrap-explore",
        rawResponse: rawResponse.slice(0, 2000),
        parsedResult: JSON.stringify({
            operations: operations.slice(0, 15),
            meta: {
                existingKeysSkipped: existingKeys,
                exploreDurationMs: durationMs,
                operationsGenerated: operations.length,
                operationsPersisted: persistedCount,
            },
        }),
        resultCount: persistedCount, durationMs, success: true,
    });

    debugLog("Phase2", `✅ Phase 2 COMPLETE`, { memoriesCreated: persistedCount.toString(), durationMs: `${durationMs}ms` });

    logger.info(`[Bootstrap] Phase 2 complete: ${persistedCount} memories from Explore agent (${durationMs}ms)`);
    return persistedCount;
}

// =============================================================================
// Orchestrator
// =============================================================================

/**
 * Run the full memory bootstrap pipeline.
 * Should be called fire-and-forget — never blocks the user prompt.
 */
export async function runMemoryBootstrap(params: {
    appId: number;
    userId: string;
    projectDir: string;
    appName?: string;
}): Promise<BootstrapResult> {
    const { appId, userId, projectDir } = params;

    // Initialize debug context
    setDebugContext(params.appName || `app_${appId}`, appId);
    debugSessionStart({
        projectDir,
        userId: userId.slice(0, 8) + "...",
    });
    debugSection("Orchestrator: runMemoryBootstrap");

    logger.info(`[Bootstrap] Starting for appId=${appId} dir="${projectDir}"`);

    if (!hasOpenRouterApiKey()) {
        debugLog("Orchestrator", `❌ ABORT: No OpenRouter API key`);
        logger.warn("[Bootstrap] No OpenRouter API key — skipping");
        return { phase1Count: 0, phase2Count: 0 };
    }

    const settings = readSettings();
    if (settings.memoriesEnabled === false) {
        debugLog("Orchestrator", `❌ ABORT: Memories disabled in settings`);
        logger.info("[Bootstrap] Memories disabled — skipping");
        return { phase1Count: 0, phase2Count: 0 };
    }

    debugLog("Orchestrator", `Guards passed — starting DNA collection`);

    // Phase 1: DNA
    const dna = await collectProjectDNA(projectDir);

    if (!dna.hasSignificantContent) {
        debugLog("Orchestrator", `❌ ABORT: No significant DNA (empty project)`, { configFiles: "0" });
        logger.info("[Bootstrap] No significant DNA found — skipping (empty project)");
        return { phase1Count: 0, phase2Count: 0 };
    }

    debugLog("Orchestrator", `DNA collected — launching Phase 1`);
    const phase1Keys = await bootstrapFromDNA({ appId, userId, dna });

    // Phase 2: Explore (non-fatal)
    debugLog("Orchestrator", `Phase 1 done (${phase1Keys.length} keys) — launching Phase 2`);
    let phase2Count = 0;
    try {
        phase2Count = await bootstrapFromExplore({
            appId, userId, projectDir, existingKeys: phase1Keys,
        });
    } catch (err: any) {
        debugLog("Orchestrator", `⚠️ Phase 2 failed (non-fatal)`, { error: err.message });
        logger.warn(`[Bootstrap] Phase 2 (Explore) failed (non-fatal): ${err.message}`);
    }

    debugSection("Bootstrap Summary");
    debugLog("Orchestrator", `🏁 COMPLETE`, {
        phase1: phase1Keys.length.toString(),
        phase2: phase2Count.toString(),
        total: (phase1Keys.length + phase2Count).toString(),
    });

    logger.info(`[Bootstrap] Complete: Phase 1=${phase1Keys.length}, Phase 2=${phase2Count}`);
    return { phase1Count: phase1Keys.length, phase2Count };
}

/**
 * Check if an app needs bootstrapping (0 active memories).
 */
export async function needsBootstrap(appId: number, userId: string): Promise<boolean> {
    try {
        const db = getRemoteDb();
        const rows = await db
            .select({ id: remoteSchema.memories.id })
            .from(remoteSchema.memories)
            .where(
                and(
                    eq(remoteSchema.memories.userId, userId),
                    eq(remoteSchema.memories.appId, appId),
                    eq(remoteSchema.memories.enabled, 1),
                ),
            )
            .limit(1);
        const needs = rows.length === 0;
        debugLog("Guard", `needsBootstrap(appId=${appId})`, { activeMemories: rows.length.toString(), result: needs ? "YES → will bootstrap" : "NO → skip" });
        return needs;
    } catch {
        return false;
    }
}
