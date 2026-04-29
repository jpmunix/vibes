/**
 * Memory Extractor — Write Pipeline (Synthesizer V3)
 *
 * Extracts structured memories from a chat cycle (user prompt + AI response)
 * using a cheap/fast LLM call. Handles:
 * - LLM-based extraction with operations (add/update/merge)
 * - Anti-noise filtering (regex + length + importance threshold)
 * - Key-based overwrite (upsert by key to avoid duplicates)
 * - All memories are scoped to the specific project (app_id=N)
 */

import log from "electron-log";
import { readSettings } from "../../main/settings";
import { openRouterCompletion, hasOpenRouterApiKey } from "./openrouter";
import { DEFAULT_STANDARD_MODEL } from "../../lib/schemas";
import { getRemoteDb } from "../../db/remote";
import * as remoteSchema from "../../db/remote-schema";
import { eq, and, inArray } from "drizzle-orm";
import type { MemoryEntry } from "../types/memory";
import { getEffectivePrompt } from "../../prompts";
import { stripThinkingBlocks, shouldProcessInteraction } from "./memory_guardian";
import { logTelemetry, logPipelineCall } from "./memory_telemetry";

const logger = log.scope("memory_extractor");

// =============================================================================
// Types
// =============================================================================

interface SynthesisOperation {
    action: "add" | "update" | "merge";
    // add fields
    type?: "fact" | "preference" | "issue" | "episode" | "decision";
    key?: string | null;
    content?: string;
    importance?: number; // 0.0–1.0
    // update fields
    id?: number;
    // merge fields
    ids?: number[];
    into?: {
        type?: string;
        key?: string;
        content?: string;
        importance?: number;
    };
}

// =============================================================================
// Anti-noise filters
// =============================================================================

const NOISE_PATTERNS = [
    /^(import|require|export)\s/i,          // Import statements
    /^(\.\/|\.\.\/)/,                        // File paths
    /^(#[0-9a-f]{3,8}|rgb|hsl|var\(--)/i,  // CSS values
    /^(npm|npx|yarn|pnpm)\s/i,             // Package manager commands
    /^\d+(\.\d+)*$/,                        // Version numbers alone
    /^[a-zA-Z_$][a-zA-Z0-9_$]*$/,          // Single identifiers
];

function isNoisy(content: string): boolean {
    const trimmed = content.trim();

    // Too short to be useful
    if (trimmed.length < 15) return true;

    // Too long — probably not atomic
    if (trimmed.length > 500) return true;

    // Matches noise pattern
    for (const pattern of NOISE_PATTERNS) {
        if (pattern.test(trimmed)) return true;
    }

    return false;
}

// =============================================================================
// Main extraction function
// =============================================================================

/**
 * Extract memories from a chat cycle (user prompt + AI response).
 * Fire-and-forget — should never block the chat flow.
 */
export async function extractMemoriesFromChatCycle(params: {
    appId: number;
    userId: string;
    chatId: number;
    userPrompt: string;
    assistantResponse: string;
}): Promise<MemoryEntry[]> {
    const { appId, userId, chatId, userPrompt, assistantResponse } = params;

    // Guard: need an API key
    if (!hasOpenRouterApiKey()) {
        logger.warn("[Memory] No OpenRouter API key — skipping extraction");
        return [];
    }

    const settings = readSettings();

    // Guard: feature disabled
    if (settings.memoriesEnabled === false || settings.memoriesAutoExtract === false) {
        return [];
    }

    try {
        // 0. Strip thinking blocks from the assistant response
        const cleanResponse = stripThinkingBlocks(assistantResponse);

        // 1. T1 Guardian: skip trivial interactions BEFORE any DB query
        if (!shouldProcessInteraction(userPrompt, cleanResponse)) {
            logTelemetry({ userId, appId, action: "skipped_trivial", reason: "Guardian rejected interaction" });
            logPipelineCall({
                userId, appId, chatId,
                stage: "guardian",
                resultCount: 0,
                success: true,
                rawResponse: "SKIPPED: Guardian rejected interaction",
            });
            return [];
        }

        // 2. Load existing memories for context (avoid duplicates at LLM level)
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

        // 3. Build structured user message
        const maxPromptLen = 2000;
        const maxResponseLen = 3000;
        const truncatedPrompt = userPrompt.length > maxPromptLen
            ? userPrompt.slice(0, maxPromptLen) + "... [truncado]"
            : userPrompt;
        const truncatedResponse = cleanResponse.length > maxResponseLen
            ? cleanResponse.slice(0, maxResponseLen) + "... [truncado]"
            : cleanResponse;

        // Build the context block
        const parts: string[] = ["# CONTEXTO ACTUAL", ""];

        // Existing memories block (only if there are any)
        if (existingRows.length > 0) {
            parts.push("## Memorias existentes de esta app:");
            for (const m of existingRows) {
                parts.push(`- [#${m.id}] [${m.type}] key:${m.key || "—"} | imp:${m.importance} | ${m.content}`);
            }
            parts.push("");
        }

        // Interaction block — separated by user and assistant
        parts.push("## Interacción reciente a evaluar:");
        parts.push("**Usuario:**");
        parts.push(truncatedPrompt);
        parts.push("");
        parts.push("**Asistente:**");
        parts.push(truncatedResponse);

        const userMessage = parts.join("\n");

        // 4. LLM call using the synthesis prompt
        const model = settings.memoriesSynthesisModelV2
            || settings.standardModeModel
            || DEFAULT_STANDARD_MODEL;

        // Use memory_synthesis prompt (the Synthesizer V3)
        const synthesisPrompt = getEffectivePrompt("memory_synthesis", settings);

        const t0 = Date.now();
        const data = await openRouterCompletion({
            model,
            messages: [
                { role: "system", content: synthesisPrompt },
                { role: "user", content: userMessage },
            ],
            temperature: 0.2,
            max_tokens: 800,
            response_format: { type: "json_object" },
            title: "Vibes - Memory Synthesis",
        });
        const durationMs = Date.now() - t0;

        const rawContent = data.choices?.[0]?.message?.content?.trim();
        if (!rawContent) {
            logger.info("[Memory] LLM returned empty response — nothing to extract");
            logPipelineCall({
                userId, appId, chatId,
                stage: "synthesis", model,
                systemPrompt: synthesisPrompt,
                userMessage,
                rawResponse: "",
                resultCount: 0, durationMs, success: true,
            });
            return [];
        }

        // 5. Parse JSON response — expects {operations: [...]}
        let operations: SynthesisOperation[];
        try {
            const parsed = JSON.parse(rawContent);
            if (parsed.operations && Array.isArray(parsed.operations)) {
                operations = parsed.operations;
            } else {
                logger.warn("[Memory] Unexpected JSON structure:", rawContent.slice(0, 200));
                logPipelineCall({
                    userId, appId, chatId,
                    stage: "synthesis", model,
                    systemPrompt: synthesisPrompt,
                    userMessage,
                    rawResponse: rawContent,
                    resultCount: 0, durationMs, success: false,
                    error: "Unexpected JSON structure",
                });
                return [];
            }
        } catch (parseErr) {
            logger.warn("[Memory] Failed to parse LLM JSON response:", rawContent.slice(0, 200));
            logPipelineCall({
                userId, appId, chatId,
                stage: "synthesis", model,
                systemPrompt: synthesisPrompt,
                userMessage,
                rawResponse: rawContent,
                resultCount: 0, durationMs, success: false,
                error: "JSON parse error",
            });
            return [];
        }

        // Log the successful synthesis call (raw)
        logPipelineCall({
            userId, appId, chatId,
            stage: "synthesis", model,
            systemPrompt: synthesisPrompt,
            userMessage,
            rawResponse: rawContent,
            parsedResult: operations,
            resultCount: operations.length, durationMs, success: true,
        });

        if (operations.length === 0) {
            logger.info("[Memory] LLM found nothing worth extracting");
            return [];
        }

        // 6. Process operations
        const persisted: MemoryEntry[] = [];
        const now = new Date();
        const VALID_TYPES = new Set(["fact", "preference", "issue", "episode", "decision"]);

        for (const op of operations.slice(0, 3)) { // Hard cap at 3
            try {
                if (op.action === "add") {
                    const result = await handleAdd(op, db, existingRows, userId, appId, chatId, now, VALID_TYPES);
                    if (result) persisted.push(result);
                } else if (op.action === "update") {
                    const result = await handleUpdate(op, db, existingRows, appId, chatId, now);
                    if (result) persisted.push(result);
                } else if (op.action === "merge") {
                    const result = await handleMerge(op, db, existingRows, userId, appId, chatId, now, VALID_TYPES);
                    if (result) persisted.push(result);
                } else {
                    logger.info(`[Memory] Unknown operation action: "${(op as any).action}"`);
                }
            } catch (opErr: any) {
                logger.warn(`[Memory] Failed to process operation: ${opErr.message}`);
            }
        }

        logger.info(`[Memory] Synthesis complete: ${persisted.length} memories persisted from chat ${chatId}`);

        // Log telemetry for successful extraction
        if (persisted.length > 0) {
            logTelemetry({
                userId,
                appId,
                action: "synthesized",
                extractedKeys: persisted.map(p => p.key || "—"),
            });
        }

        return persisted;

    } catch (error: any) {
        logger.warn(`[Memory] Extraction failed (non-blocking): ${error.message}`);
        return [];
    }
}

// =============================================================================
// Operation handlers
// =============================================================================

async function handleAdd(
    op: SynthesisOperation,
    db: ReturnType<typeof getRemoteDb>,
    existingRows: any[],
    userId: string,
    appId: number,
    chatId: number,
    now: Date,
    VALID_TYPES: Set<string>,
): Promise<MemoryEntry | null> {
    if (!op.type || !VALID_TYPES.has(op.type)) {
        logger.info(`[Memory] Rejected invalid type: "${op.type}"`);
        return null;
    }
    if (!op.content) return null;
    if (isNoisy(op.content)) {
        logger.info(`[Memory] Filtered noisy: "${op.content.slice(0, 50)}..."`);
        return null;
    }

    const importance = Math.max(0, Math.min(1, op.importance ?? 0.5));
    if (importance < 0.5) {
        logger.info(`[Memory] Filtered low importance (${importance}): "${op.content.slice(0, 50)}..."`);
        return null;
    }

    if ((op.type === "episode" || op.type === "issue") && op.content.length < 30) {
        logger.info(`[Memory] Filtered short ${op.type}: "${op.content}"`);
        return null;
    }

    const importanceInt = Math.round(importance * 100);

    // Key-based overwrite: check if a memory with the same key exists
    if (op.key) {
        const existing = existingRows.find(
            e => e.key === op.key && e.appId === appId,
        );

        if (existing) {
            await db
                .update(remoteSchema.memories)
                .set({
                    content: op.content,
                    importance: importanceInt,
                    updatedAt: now,
                })
                .where(eq(remoteSchema.memories.id, existing.id));

            logger.info(`[Memory] Overwritten: key="${op.key}" id=${existing.id}`);

            return {
                id: existing.id,
                appId,
                type: op.type,
                key: op.key,
                content: op.content,
                importance,
                status: null,
                source: "auto",
                sourceChatId: chatId,
                enabled: true,
                createdAt: existing.createdAt,
                updatedAt: now,
                lastUsed: now,
            };
        }
    }

    // Insert new memory
    const [inserted] = await db
        .insert(remoteSchema.memories)
        .values({
            userId,
            appId,
            type: op.type,
            key: op.key || null,
            content: op.content,
            importance: importanceInt,
            status: op.type === "issue" ? "active" : null,
            source: "auto",
            sourceChatId: chatId,
            enabled: 1,
            createdAt: now,
            updatedAt: now,
            lastUsed: now,
        })
        .returning({ id: remoteSchema.memories.id });

    logger.info(`[Memory] Created: type=${op.type} key="${op.key || "—"}" id=${inserted.id}`);

    return {
        id: inserted.id,
        appId,
        type: op.type,
        key: op.key || null,
        content: op.content,
        importance,
        status: op.type === "issue" ? "active" : null,
        source: "auto",
        sourceChatId: chatId,
        enabled: true,
        createdAt: now,
        updatedAt: now,
        lastUsed: now,
    };
}

async function handleUpdate(
    op: SynthesisOperation,
    db: ReturnType<typeof getRemoteDb>,
    existingRows: any[],
    appId: number,
    chatId: number,
    now: Date,
): Promise<MemoryEntry | null> {
    if (!op.id) {
        logger.info("[Memory] Update operation missing id");
        return null;
    }

    const existing = existingRows.find(e => e.id === op.id && e.appId === appId);
    if (!existing) {
        logger.info(`[Memory] Update target not found: id=${op.id}`);
        return null;
    }

    const content = op.content || existing.content;
    const importance = op.importance != null
        ? Math.max(0, Math.min(1, op.importance))
        : existing.importance / 100;
    const importanceInt = Math.round(importance * 100);

    await db
        .update(remoteSchema.memories)
        .set({
            content,
            importance: importanceInt,
            updatedAt: now,
        })
        .where(eq(remoteSchema.memories.id, op.id));

    logger.info(`[Memory] Updated: id=${op.id} key="${existing.key || "—"}"`);

    logTelemetry({
        userId: existing.userId,
        appId,
        action: "overwritten",
        extractedKeys: [existing.key || "—"],
    });

    return {
        id: existing.id,
        appId,
        type: existing.type,
        key: existing.key,
        content,
        importance,
        status: existing.status,
        source: existing.source,
        sourceChatId: chatId,
        enabled: true,
        createdAt: existing.createdAt,
        updatedAt: now,
        lastUsed: now,
    };
}

async function handleMerge(
    op: SynthesisOperation,
    db: ReturnType<typeof getRemoteDb>,
    existingRows: any[],
    userId: string,
    appId: number,
    chatId: number,
    now: Date,
    VALID_TYPES: Set<string>,
): Promise<MemoryEntry | null> {
    if (!op.ids || op.ids.length < 2 || !op.into) {
        logger.info("[Memory] Merge operation missing ids or into");
        return null;
    }

    // Verify all source memories exist
    const sources = op.ids
        .map(id => existingRows.find(e => e.id === id && e.appId === appId))
        .filter(Boolean);

    if (sources.length < 2) {
        logger.info(`[Memory] Merge: not enough valid source memories (${sources.length}/${op.ids.length})`);
        return null;
    }

    const into = op.into;
    const content = into.content;
    if (!content || isNoisy(content)) {
        logger.info("[Memory] Merge: merged content is empty or noisy");
        return null;
    }

    const type = (into.type && VALID_TYPES.has(into.type)) ? into.type : sources[0].type;
    const key = into.key || sources[0].key;
    const importance = into.importance != null
        ? Math.max(0, Math.min(1, into.importance))
        : Math.max(...sources.map((s: any) => s.importance)) / 100;
    const importanceInt = Math.round(importance * 100);

    // Disable source memories
    await db
        .update(remoteSchema.memories)
        .set({ enabled: 0, updatedAt: now })
        .where(inArray(remoteSchema.memories.id, op.ids));

    // Insert merged memory
    const [inserted] = await db
        .insert(remoteSchema.memories)
        .values({
            userId,
            appId,
            type,
            key: key || null,
            content,
            importance: importanceInt,
            status: null,
            source: "auto",
            sourceChatId: chatId,
            enabled: 1,
            createdAt: now,
            updatedAt: now,
            lastUsed: now,
        })
        .returning({ id: remoteSchema.memories.id });

    logger.info(`[Memory] Merged: ids=[${op.ids.join(",")}] → id=${inserted.id} key="${key || "—"}"`);

    logTelemetry({
        userId,
        appId,
        action: "merged",
        extractedKeys: [key || "—"],
    });

    return {
        id: inserted.id,
        appId,
        type: type as any,
        key: key || null,
        content,
        importance,
        status: null,
        source: "auto",
        sourceChatId: chatId,
        enabled: true,
        createdAt: now,
        updatedAt: now,
        lastUsed: now,
    };
}
