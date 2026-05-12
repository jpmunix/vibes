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
import { stripAllNoise, shouldProcessInteraction } from "./memory_guardian";
import { logTelemetry, logPipelineCall } from "./memory_telemetry";
import { debugLog, debugPlayground } from "./memory_debug_log";
import { extractJsonFromLLM } from "./memory_json_extractor";
import { compactOldSessions } from "./memory_lifecycle";

const logger = log.scope("memory_extractor");

// =============================================================================
// Batching — accumulate N rounds before synthesis
// =============================================================================

const BATCH_SIZE = 3;

interface RoundEntry {
    userPrompt: string;
    assistantResponse: string;
}

interface ChatBuffer {
    rounds: RoundEntry[];
    appId: number;
    userId: string;
}

/** In-memory buffer per chatId. Cleared on flush or process exit. */
const chatBuffers = new Map<string, ChatBuffer>();

/**
 * Buffer a chat round. When BATCH_SIZE is reached, triggers synthesis
 * with all accumulated rounds. Fire-and-forget.
 */
export function bufferChatRound(params: {
    chatId: string;
    appId: number;
    userId: string;
    userPrompt: string;
    assistantResponse: string;
}): void {
    const { chatId, appId, userId, userPrompt, assistantResponse } = params;

    let buffer = chatBuffers.get(chatId);
    if (!buffer) {
        buffer = { rounds: [], appId, userId };
        chatBuffers.set(chatId, buffer);
    }

    buffer.rounds.push({ userPrompt, assistantResponse });

    if (buffer.rounds.length >= BATCH_SIZE) {
        const rounds = [...buffer.rounds];
        buffer.rounds = [];
        // Fire-and-forget
        extractMemoriesFromBatch({ appId, userId, chatId, rounds })
            .catch(err => logger.warn("[Memory] Batch extraction failed:", err));
    }
}

/**
 * Flush any remaining rounds in the buffer for a chat (e.g., on session end).
 * Fire-and-forget — safe to call even if buffer is empty.
 */
export function flushChatBuffer(chatId: string): void {
    const buffer = chatBuffers.get(chatId);
    if (!buffer || buffer.rounds.length === 0) {
        chatBuffers.delete(chatId);
        return;
    }

    const { appId, userId, rounds } = buffer;
    chatBuffers.delete(chatId);

    extractMemoriesFromBatch({ appId, userId, chatId, rounds: [...rounds] })
        .catch(err => logger.warn("[Memory] Flush extraction failed:", err));
}

// =============================================================================
// Buffer Persistence — survive app restarts
// =============================================================================

import { app } from "electron";
import * as path from "node:path";
import * as fs from "node:fs";

/** File where pending buffers are persisted on quit */
const PENDING_BUFFER_FILE = () => path.join(app.getPath("userData"), ".memory_pending_buffer.json");

interface SerializedBuffer {
    chatId: string;
    appId: number;
    userId: string;
    rounds: RoundEntry[];
}

/**
 * Persist all pending (unflushed) chat buffers to disk.
 * Called synchronously during `will-quit` — MUST use writeFileSync.
 *
 * @returns number of buffers persisted
 */
export function serializePendingBuffers(): number {
    const pending: SerializedBuffer[] = [];

    for (const [chatId, buffer] of chatBuffers.entries()) {
        if (buffer.rounds.length > 0) {
            pending.push({
                chatId,
                appId: buffer.appId,
                userId: buffer.userId,
                rounds: buffer.rounds,
            });
        }
    }

    if (pending.length === 0) {
        // Clean up any stale file
        try { fs.unlinkSync(PENDING_BUFFER_FILE()); } catch { /* ignore */ }
        return 0;
    }

    try {
        fs.writeFileSync(PENDING_BUFFER_FILE(), JSON.stringify(pending), "utf-8");
        logger.info(`[Memory] Persisted ${pending.length} pending buffer(s) (${pending.reduce((n, b) => n + b.rounds.length, 0)} rounds total) to disk`);
        return pending.length;
    } catch (err: any) {
        logger.warn(`[Memory] Failed to persist pending buffers: ${err.message}`);
        return 0;
    }
}

/**
 * Restore and process any pending buffers that were persisted on last quit.
 * Called at startup — fire-and-forget, non-blocking.
 * Deletes the file after reading to prevent double-processing.
 */
export async function restorePendingBuffers(): Promise<void> {
    const filePath = PENDING_BUFFER_FILE();

    let raw: string;
    try {
        if (!fs.existsSync(filePath)) return;
        raw = fs.readFileSync(filePath, "utf-8");
        fs.unlinkSync(filePath); // Delete immediately to prevent double-processing
    } catch {
        return; // File doesn't exist or can't be read — nothing to restore
    }

    let pending: SerializedBuffer[];
    try {
        pending = JSON.parse(raw);
        if (!Array.isArray(pending) || pending.length === 0) return;
    } catch {
        logger.warn("[Memory] Pending buffer file was corrupted — discarding");
        return;
    }

    logger.info(`[Memory] Restoring ${pending.length} pending buffer(s) from previous session`);

    for (const buf of pending) {
        try {
            await extractMemoriesFromBatch({
                appId: buf.appId,
                userId: buf.userId,
                chatId: buf.chatId,
                rounds: buf.rounds,
            });
        } catch (err: any) {
            logger.warn(`[Memory] Failed to process restored buffer for chat ${buf.chatId}: ${err.message}`);
        }
    }
}

/**
 * Extract memories from a batch of rounds (the actual LLM call).
 * Builds a combined user message with all rounds + the previous session summary.
 */
export async function extractMemoriesFromBatch(params: {
    appId: number;
    userId: string;
    chatId: string;
    rounds: RoundEntry[];
}): Promise<MemoryEntry[]> {
    const { appId, userId, chatId, rounds } = params;

    if (!hasOpenRouterApiKey()) return [];

    const settings = readSettings();
    if (settings.memoriesEnabled === false || settings.memoriesAutoExtract === false) return [];

    try {
        // Strip thinking blocks from all responses
        const cleanRounds = rounds.map(r => ({
            userPrompt: r.userPrompt,
            assistantResponse: stripAllNoise(r.assistantResponse),
        }));

        // Guardian check on the combined content
        const combinedPrompt = cleanRounds.map(r => r.userPrompt).join("\n");
        const combinedResponse = cleanRounds.map(r => r.assistantResponse).join("\n");
        const guardianResult = shouldProcessInteraction(combinedPrompt, combinedResponse);
        if (!guardianResult.allowed) {
            debugLog("BatchGuardian", `❌ Rejected batch (${rounds.length} rounds): ${guardianResult.reason}`);
            logTelemetry({ userId, appId, action: "skipped_trivial", reason: `BatchGuardian: ${guardianResult.reason}` });
            return [];
        }

        // Load existing memories
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

        // Build structured user message with ALL rounds
        const parts: string[] = ["# CONTEXTO ACTUAL", ""];

        // Existing memories
        if (existingRows.length > 0) {
            parts.push("## Memorias existentes de esta app:");
            for (const m of existingRows) {
                parts.push(`- [#${m.id}] [${m.type}] key:${m.key || "—"} | imp:${m.importance} | ${m.content}`);
            }
            parts.push("");
        }

        // All rounds in the batch
        parts.push(`## Interacciones recientes a evaluar (${cleanRounds.length} rondas):`);
        for (let i = 0; i < cleanRounds.length; i++) {
            const r = cleanRounds[i];
            const maxLen = Math.floor(3000 / cleanRounds.length); // Distribute token budget
            const truncPrompt = r.userPrompt.length > maxLen
                ? r.userPrompt.slice(0, maxLen) + "... [truncado]"
                : r.userPrompt;
            const truncResponse = r.assistantResponse.length > maxLen
                ? r.assistantResponse.slice(0, maxLen) + "... [truncado]"
                : r.assistantResponse;

            parts.push(`### Ronda ${i + 1}/${cleanRounds.length}`);
            parts.push("**Usuario:**");
            parts.push(truncPrompt);
            parts.push("");
            parts.push("**Asistente:**");
            parts.push(truncResponse);
            parts.push("");
        }

        const userMessage = parts.join("\n");

        // LLM call
        const baseModel = settings.memoriesSynthesisModelV2
            || settings.executorModel
            || DEFAULT_STANDARD_MODEL;
        const model = baseModel.includes(":") ? baseModel : baseModel + ":nitro";
        const synthesisPrompt = getEffectivePrompt("memory_synthesis", settings);

        debugPlayground("Synthesis-Batch", model, synthesisPrompt, userMessage);

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
            title: "Vibes - Memory Synthesis (Batch)",
        });
        const durationMs = Date.now() - t0;

        const rawContent = data.choices?.[0]?.message?.content?.trim();
        if (!rawContent) {
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

        // Parse JSON
        let operations: SynthesisOperation[];
        try {
            const parsed = extractJsonFromLLM(rawContent);
            if (parsed?.operations && Array.isArray(parsed.operations)) {
                operations = parsed.operations;
            } else {
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
        } catch {
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

        logPipelineCall({
            userId, appId, chatId,
            stage: "synthesis", model,
            systemPrompt: synthesisPrompt,
            userMessage,
            rawResponse: rawContent,
            parsedResult: JSON.stringify({
                operations,
                meta: {
                    batchSize: rounds.length,
                    existingMemoriesCount: existingRows.length,
                    operationsGenerated: operations.length,
                },
            }),
            resultCount: operations.length, durationMs, success: true,
        });

        if (operations.length === 0) return [];

        // Process operations
        const persisted: MemoryEntry[] = [];
        const now = new Date();
        const VALID_TYPES = new Set(["session", "preference", "issue"]);

        for (const op of operations.slice(0, 3)) {
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
                }
            } catch (opErr: any) {
                logger.warn(`[Memory] Batch op failed: ${opErr.message}`);
            }
        }

        if (persisted.length > 0) {
            logTelemetry({
                userId, appId,
                action: "synthesized",
                extractedKeys: persisted.map(p => p.key || "—"),
            });

            // P2: Trigger compaction after successful extraction (fire-and-forget)
            compactOldSessions(appId, userId)
                .catch(err => logger.warn("[Memory] Compaction failed:", err));
        }

        logger.info(`[Memory] Batch synthesis: ${persisted.length} memories from ${rounds.length} rounds (chat ${chatId})`);
        return persisted;

    } catch (error: any) {
        logger.warn(`[Memory] Batch extraction failed: ${error.message}`);
        return [];
    }
}

// =============================================================================
// Types
// =============================================================================

interface SynthesisOperation {
    action: "add" | "update" | "merge";
    // add fields
    type?: "session" | "preference" | "issue";
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

export function isNoisy(content: string): boolean {
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
 * Force condensation of all chat rounds into session memories,
 * skipping the 3-round batching rule. Used on archive/delete or explicitly.
 */
export async function forceCondenseChatSession(params: {
    appId: number;
    userId: string;
    chatId: number;
}): Promise<void> {
    const { appId, userId, chatId } = params;
    const db = getRemoteDb();

    // Fetch all messages for this chat
    const rows = await db
        .select()
        .from(remoteSchema.messages)
        .where(
            and(
                eq(remoteSchema.messages.chatId, chatId),
                eq(remoteSchema.messages.userId, userId)
            )
        )
        .orderBy(remoteSchema.messages.createdAt);

    if (rows.length < 2) return; // Need at least user+assistant

    const rounds: RoundEntry[] = [];
    let currentPrompt: string | null = null;

    for (const msg of rows) {
        if (msg.role === "user") {
            currentPrompt = msg.content;
        } else if (msg.role === "assistant" && currentPrompt) {
            // Strip all XML tool tags and thinking blocks before condensation
            const cleanedResponse = stripAllNoise(msg.content || "");
            if (cleanedResponse) {
                rounds.push({
                    userPrompt: currentPrompt,
                    assistantResponse: cleanedResponse,
                });
            }
            currentPrompt = null;
        }
    }

    if (rounds.length > 0) {
        try {
            await extractMemoriesFromBatch({
                appId,
                userId,
                chatId: String(chatId),
                rounds
            });
        } catch (error) {
            logger.error(`Error forcing condensation for chatId=${chatId}:`, error);
        }
    }
}

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
        const cleanResponse = stripAllNoise(assistantResponse);

        // 1. T1 Guardian: skip trivial interactions BEFORE any DB query
        const guardianResult = shouldProcessInteraction(userPrompt, cleanResponse);
        if (!guardianResult.allowed) {
            debugLog("WriteGuardian", `❌ Rejected: ${guardianResult.reason}`, { promptExcerpt: userPrompt.slice(0, 80) });
            logTelemetry({ userId, appId, action: "skipped_trivial", reason: `Guardian: ${guardianResult.reason}` });
            logPipelineCall({
                userId, appId, chatId,
                stage: "guardian",
                resultCount: 0,
                success: true,
                userMessage: userPrompt.slice(0, 500),
                rawResponse: `REJECTED: ${guardianResult.reason}`,
                parsedResult: JSON.stringify({
                    rejectReason: guardianResult.reason,
                    promptLength: userPrompt.length,
                    responseLength: cleanResponse.length,
                    promptExcerpt: userPrompt.slice(0, 200),
                    responseExcerpt: cleanResponse.slice(0, 200),
                }),
            });
            return [];
        }

        debugLog("WriteGuardian", `✅ Approved`, { promptLength: userPrompt.length.toString(), responseLength: cleanResponse.length.toString() });

        // Guardian approved — log for accept/reject ratio analysis
        logPipelineCall({
            userId, appId, chatId,
            stage: "guardian",
            resultCount: 1,
            success: true,
            userMessage: userPrompt.slice(0, 500),
            rawResponse: "APPROVED",
            parsedResult: JSON.stringify({
                rejectReason: "approved",
                promptLength: userPrompt.length,
                responseLength: cleanResponse.length,
            }),
        });

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
        const baseModel = settings.memoriesSynthesisModelV2
            || settings.executorModel
            || DEFAULT_STANDARD_MODEL;
        // Transparent nitro: use fastest provider for memory calls
        const model = baseModel.includes(":") ? baseModel : baseModel + ":nitro";

        // Use memory_synthesis prompt (the Synthesizer V3)
        const synthesisPrompt = getEffectivePrompt("memory_synthesis", settings);

        // Dump clean prompts to /tmp/opencode/{app}.md for playground testing
        debugPlayground("Synthesis", model, synthesisPrompt, userMessage);

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
            const parsed = extractJsonFromLLM(rawContent);
            if (parsed && parsed.operations && Array.isArray(parsed.operations)) {
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


        // Log the successful synthesis call (raw) with enriched metadata
        logPipelineCall({
            userId, appId, chatId,
            stage: "synthesis", model,
            systemPrompt: synthesisPrompt,
            userMessage,
            rawResponse: rawContent,
            parsedResult: JSON.stringify({
                operations,
                meta: {
                    existingMemoriesCount: existingRows.length,
                    promptLength: userPrompt.length,
                    responseLength: cleanResponse.length,
                    inputTokensEstimate: Math.ceil(userMessage.length / 4),
                    operationsGenerated: operations.length,
                    operationsRatio: `${operations.length}/${existingRows.length}`,
                },
            }),
            resultCount: operations.length, durationMs, success: true,
        });

        if (operations.length === 0) {
            logger.info("[Memory] LLM found nothing worth extracting");
            return [];
        }

        // 6. Process operations
        const persisted: MemoryEntry[] = [];
        const now = new Date();
        const VALID_TYPES = new Set(["session", "preference", "issue"]);

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

export async function handleAdd(
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

    if ((op.type === "session" || op.type === "episode" || op.type === "issue") && op.content.length < 30) {
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
