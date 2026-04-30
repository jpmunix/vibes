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

const logger = log.scope("memory_bootstrap");

// =============================================================================
// Types
// =============================================================================

interface ProjectDNA {
    hasSignificantContent: boolean;
    configFiles: string[];
    configSnippets: Record<string, string>;
    agentsMd?: string;
    designTokens?: string;
    directoryTree: string;
    envKeys?: string[];
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
    { file: ".env.example", maxBytes: 500 },
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

function processEnvExample(content: string): string[] {
    return content.split("\n")
        .map(line => line.trim())
        .filter(line => line && !line.startsWith("#"))
        .map(line => line.split("=")[0].trim())
        .filter(Boolean);
}

export async function collectProjectDNA(
    projectDir: string,
    opts?: { waitForAgentsMd?: boolean },
): Promise<ProjectDNA> {
    const configSnippets: Record<string, string> = {};
    const configFiles: string[] = [];

    // 1. Read exact-name config files
    for (const { file, maxBytes } of CONFIG_FILES) {
        const content = readFileSafe(path.join(projectDir, file), maxBytes);
        if (content) {
            configFiles.push(file);
            if (file === ".env.example") {
                configSnippets[file] = `Keys: ${processEnvExample(content).join(", ")}`;
            } else {
                configSnippets[file] = content;
            }
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
                    }
                }
            }
        }
    } catch { /* ignore */ }

    // 3. AGENTS.md — with optional polling
    let agentsMd: string | undefined;
    const agentsMdPaths = [
        path.join(projectDir, "AGENTS.md"),
        path.join(projectDir, ".opencode", "AGENTS.md"),
    ];

    if (opts?.waitForAgentsMd) {
        let waited = 0;
        const MAX_WAIT = 15_000;
        const INTERVAL = 2_000;
        while (waited < MAX_WAIT) {
            const found = agentsMdPaths.find(p => fs.existsSync(p));
            if (found) break;
            await new Promise(r => setTimeout(r, INTERVAL));
            waited += INTERVAL;
        }
        if (waited >= MAX_WAIT) {
            logger.info("[Bootstrap] AGENTS.md not found after 15s — proceeding without it");
        }
    }

    for (const p of agentsMdPaths) {
        const content = readFileSafe(p, 4096);
        if (content) {
            agentsMd = content;
            break;
        }
    }

    // 4. DESIGN.md front-matter (tokens)
    let designTokens: string | undefined;
    const designMdPaths = [
        path.join(projectDir, "docs", "DESIGN.md"),
        path.join(projectDir, "DESIGN.md"),
    ];
    for (const p of designMdPaths) {
        const content = readFileSafe(p, 1500);
        if (content) {
            // Extract just the YAML front-matter (first --- block)
            const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
            designTokens = fmMatch ? fmMatch[1] : content.slice(0, 500);
            break;
        }
    }

    // 5. Directory tree
    const directoryTree = getDirectoryTree(projectDir, 2);

    // 6. .env.example keys
    const envContent = readFileSafe(path.join(projectDir, ".env.example"), 500);
    const envKeys = envContent ? processEnvExample(envContent) : undefined;

    const hasSignificantContent = configFiles.length > 0 || !!agentsMd;

    return {
        hasSignificantContent,
        configFiles,
        configSnippets,
        agentsMd,
        designTokens,
        directoryTree,
        envKeys,
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

    // AGENTS.md
    if (dna.agentsMd) {
        parts.push("## AGENTS.md (Project Documentation)");
        parts.push(dna.agentsMd);
        parts.push("");
    }

    // DESIGN.md tokens
    if (dna.designTokens) {
        parts.push("## DESIGN.md (Design Tokens)");
        parts.push(dna.designTokens);
        parts.push("");
    }

    // Directory structure
    if (dna.directoryTree) {
        parts.push("## Directory Structure (top 2 levels)");
        parts.push("```");
        parts.push(dna.directoryTree);
        parts.push("```");
        parts.push("");
    }

    // Env keys
    if (dna.envKeys && dna.envKeys.length > 0) {
        parts.push("## Environment Variables (keys only)");
        parts.push(dna.envKeys.join(", "));
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

    logger.info(`[Bootstrap] Phase 1 (DNA): ${dna.configFiles.length} configs, agentsMd=${!!dna.agentsMd}, payload=${userMessage.length} chars`);

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

    if (!rawContent) {
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

    // Parse operations
    let operations: any[];
    try {
        const parsed = JSON.parse(rawContent);
        operations = parsed.operations || [];
    } catch {
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

    for (const op of operations.slice(0, 15)) {
        try {
            if (op.action !== "add") continue;
            const result = await handleAdd(op, db, existingRows, userId, appId, 0, now, VALID_TYPES);
            if (result) {
                persisted.push(result);
                if (result.key) persistedKeys.push(result.key);
            }
        } catch (err: any) {
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
                hasAgentsMd: !!dna.agentsMd,
                hasDesignMd: !!dna.designTokens,
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

    // Dynamically import to avoid circular dependency at module load
    let getOpenCodeClientInstance: () => any;
    try {
        const adapter = await import("../handlers/opencode_adapter");
        getOpenCodeClientInstance = (adapter as any).getOpenCodeClientInstance;
    } catch {
        logger.warn("[Bootstrap] Phase 2 skipped: opencode_adapter not available");
        return 0;
    }

    const client = getOpenCodeClientInstance?.();
    if (!client) {
        logger.warn("[Bootstrap] Phase 2 skipped: no OpenCode client instance");
        return 0;
    }

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

    const t0 = Date.now();
    let rawResponse = "";

    try {
        // Create a temporary session for explore
        const session = await client.session.create({});
        const sessionId = session.id;

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

        // Try to clean up session
        try { await client.session.delete({ id: sessionId }); } catch { /* ignore */ }
    } catch (err: any) {
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
        }
    } catch {
        logger.info("[Bootstrap] Phase 2: could not parse JSON from explore response");
    }

    if (operations.length === 0) {
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

    for (const op of operations.slice(0, 15)) {
        try {
            if (op.action !== "add") continue;
            // Skip keys already bootstrapped in Phase 1
            if (op.key && existingKeys.includes(op.key)) continue;
            const result = await handleAdd(op, db, existingRows, userId, appId, 0, now, VALID_TYPES);
            if (result) persistedCount++;
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
    initWasLaunched: boolean;
}): Promise<BootstrapResult> {
    const { appId, userId, projectDir, initWasLaunched } = params;

    logger.info(`[Bootstrap] Starting for appId=${appId} dir="${projectDir}" initWasLaunched=${initWasLaunched}`);

    if (!hasOpenRouterApiKey()) {
        logger.warn("[Bootstrap] No OpenRouter API key — skipping");
        return { phase1Count: 0, phase2Count: 0 };
    }

    const settings = readSettings();
    if (settings.memoriesEnabled === false) {
        logger.info("[Bootstrap] Memories disabled — skipping");
        return { phase1Count: 0, phase2Count: 0 };
    }

    // Phase 1: DNA
    const dna = await collectProjectDNA(projectDir, {
        waitForAgentsMd: initWasLaunched,
    });

    if (!dna.hasSignificantContent) {
        logger.info("[Bootstrap] No significant DNA found — skipping (empty project)");
        return { phase1Count: 0, phase2Count: 0 };
    }

    const phase1Keys = await bootstrapFromDNA({ appId, userId, dna });

    // Phase 2: Explore (non-fatal)
    let phase2Count = 0;
    try {
        phase2Count = await bootstrapFromExplore({
            appId, userId, projectDir, existingKeys: phase1Keys,
        });
    } catch (err: any) {
        logger.warn(`[Bootstrap] Phase 2 (Explore) failed (non-fatal): ${err.message}`);
    }

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
        return rows.length === 0;
    } catch {
        return false;
    }
}
