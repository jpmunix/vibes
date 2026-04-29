/**
 * Memory Extractor — Write Pipeline
 *
 * Extracts structured memories from a chat cycle (user prompt + AI response)
 * using a cheap/fast LLM call. Handles:
 * - LLM-based extraction with anti-hallucination prompt
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
import { eq, and } from "drizzle-orm";
import type { MemoryEntry } from "../types/memory";
import { getEffectivePrompt } from "../../prompts";
import { stripThinkingBlocks, shouldProcessInteraction } from "./memory_guardian";
import { logTelemetry } from "./memory_telemetry";

const logger = log.scope("memory_extractor");

// =============================================================================
// Types
// =============================================================================

interface ExtractedMemory {
    type: "fact" | "preference" | "issue" | "episode" | "decision";
    key: string | null;
    content: string;
    importance: number; // 0.0–1.0
    scope?: string; // ignored — all memories go to the project
    status?: string;
}

interface ExtractionResult {
    memories: ExtractedMemory[];
    raw?: string; // Raw LLM response for debugging
}

// Extraction prompt is now managed via the PromptId system.
// Default lives in src/prompts/index.ts as DEFAULT_PROMPTS.memory_extraction.
// Users can customize it via Settings > Memoria > Prompt de extracción.

// =============================================================================
// Anti-noise filters
// =============================================================================

const NOISE_PATTERNS = [
    /^(import|require|export)\s/i,          // Import statements
    /^(\.\/|\.\.\/|\/)/,                    // File paths
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

// Scope is always the project — no global memories

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

        const existingContext = existingRows.length > 0
            ? `\n\nEXISTING MEMORIES (do NOT duplicate these, only add NEW knowledge or UPDATE if contradicted):\n${existingRows.map(m => `- [${m.type}] ${m.key || "—"}: ${m.content}`).join("\n")}`
            : "";

        // 3. Truncate inputs to avoid excessive token usage
        const maxPromptLen = 2000;
        const maxResponseLen = 3000;
        const truncatedPrompt = userPrompt.length > maxPromptLen
            ? userPrompt.slice(0, maxPromptLen) + "... [truncated]"
            : userPrompt;
        const truncatedResponse = cleanResponse.length > maxResponseLen
            ? cleanResponse.slice(0, maxResponseLen) + "... [truncated]"
            : cleanResponse;

        // 4. LLM extraction call
        const model = settings.memoriesSynthesisModel
            || settings.standardModeModel
            || DEFAULT_STANDARD_MODEL;

        const userMessage = `USER MESSAGE:\n${truncatedPrompt}\n\nASSISTANT RESPONSE:\n${truncatedResponse}${existingContext}`;

        // Resolve the extraction prompt (supports user customization via settings)
        const extractionPrompt = getEffectivePrompt("memory_extraction", settings);

        const data = await openRouterCompletion({
            model,
            messages: [
                { role: "system", content: extractionPrompt },
                { role: "user", content: userMessage },
            ],
            temperature: 0.2,
            max_tokens: 500,
            response_format: { type: "json_object" },
            title: "Vibes - Memory Extraction",
        });

        const rawContent = data.choices?.[0]?.message?.content?.trim();
        if (!rawContent) {
            logger.info("[Memory] LLM returned empty response — nothing to extract");
            return [];
        }

        // 5. Parse JSON response
        let extracted: ExtractedMemory[];
        try {
            const parsed = JSON.parse(rawContent);
            extracted = Array.isArray(parsed) ? parsed : (parsed.memories || []);
        } catch (parseErr) {
            logger.warn("[Memory] Failed to parse LLM JSON response:", rawContent);
            return [];
        }

        if (extracted.length === 0) {
            logger.info("[Memory] LLM found nothing worth extracting");
            return [];
        }

        // 6. Filter and persist
        const persisted: MemoryEntry[] = [];

        for (const mem of extracted.slice(0, 3)) { // Hard cap at 3
            // T2: Validate type against whitelist
            const VALID_TYPES = new Set(["fact", "preference", "issue", "episode", "decision"]);
            if (!mem.type || !VALID_TYPES.has(mem.type)) {
                logger.info(`[Memory] Rejected invalid type: "${mem.type}"`);
                continue;
            }

            // Validate required fields
            if (!mem.content) continue;

            // Anti-noise filter
            if (isNoisy(mem.content)) {
                logger.info(`[Memory] Filtered noisy: "${mem.content.slice(0, 50)}..."`);
                continue;
            }

            // T2: Importance threshold (0.5 minimum)
            const importance = Math.max(0, Math.min(1, mem.importance ?? 0.5));
            if (importance < 0.5) {
                logger.info(`[Memory] Filtered low importance (${importance}): "${mem.content.slice(0, 50)}..."`);
                continue;
            }

            // T2: Episode/issue minimum content length
            if ((mem.type === "episode" || mem.type === "issue") && mem.content.length < 30) {
                logger.info(`[Memory] Filtered short ${mem.type}: "${mem.content}"`);
                continue;
            }

            // All memories go to the project
            const resolvedAppId = appId;

            // Key-based overwrite: check if a memory with the same key exists
            const now = new Date();
            const importanceInt = Math.round(importance * 100);

            if (mem.key) {
                const existing = existingRows.find(
                    e => e.key === mem.key && e.appId === resolvedAppId,
                );

                if (existing) {
                    // Overwrite: update content and bump importance/timestamp
                    await db
                        .update(remoteSchema.memories)
                        .set({
                            content: mem.content,
                            importance: importanceInt,
                            status: mem.status || existing.status,
                            updatedAt: now,
                        })
                        .where(eq(remoteSchema.memories.id, existing.id));

                    logger.info(`[Memory] Overwritten: key="${mem.key}" id=${existing.id}`);

                    persisted.push({
                        id: existing.id,
                        appId: resolvedAppId,
                        type: mem.type,
                        key: mem.key,
                        content: mem.content,
                        importance,
                        status: mem.status || null,
                        source: "auto",
                        sourceChatId: chatId,
                        enabled: true,
                        createdAt: existing.createdAt,
                        updatedAt: now,
                        lastUsed: now,
                    });
                    continue;
                }
            }

            // Insert new memory
            const [inserted] = await db
                .insert(remoteSchema.memories)
                .values({
                    userId,
                    appId: resolvedAppId,
                    type: mem.type,
                    key: mem.key || null,
                    content: mem.content,
                    importance: importanceInt,
                    status: mem.type === "issue" ? (mem.status || "active") : null,
                    source: "auto",
                    sourceChatId: chatId,
                    enabled: 1,
                    createdAt: now,
                    updatedAt: now,
                    lastUsed: now,
                })
                .returning({ id: remoteSchema.memories.id });

            logger.info(`[Memory] Created: type=${mem.type} key="${mem.key || "—"}" scope=${mem.scope} id=${inserted.id}`);

            persisted.push({
                id: inserted.id,
                appId: resolvedAppId,
                type: mem.type,
                key: mem.key || null,
                content: mem.content,
                importance,
                status: mem.type === "issue" ? (mem.status || "active") : null,
                source: "auto",
                sourceChatId: chatId,
                enabled: true,
                createdAt: now,
                updatedAt: now,
                lastUsed: now,
            });
        }

        logger.info(`[Memory] Extraction complete: ${persisted.length} memories persisted from chat ${chatId}`);

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
