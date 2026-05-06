/**
 * Memory Context Builder — Read Pipeline (LLM Router)
 *
 * "Brute Force Semantic" approach:
 * 1. Pull top 300 active memories from DB (safety belt)
 * 2. Send them + user prompt to a lightweight LLM (Router)
 * 3. LLM returns 0-10 most relevant memory IDs
 * 4. Update lastUsed for selected memories (feedback loop)
 * 5. Format selected memories for injection into agent context
 *
 * No embeddings, no vector DB. Pure LLM classification.
 */

import log from "electron-log";
import { readSettings } from "../../main/settings";
import { getRemoteDb } from "../../db/remote";
import * as remoteSchema from "../../db/remote-schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { openRouterCompletion, hasOpenRouterApiKey } from "./openrouter";
import { shouldInjectMemories } from "./memory_guardian";
import { getEffectivePrompt } from "../../prompts";
import { logTelemetry, logPipelineCall } from "./memory_telemetry";
import { debugLog, debugPlayground } from "./memory_debug_log";
import { extractJsonFromLLM } from "./memory_json_extractor";

const logger = log.scope("memory_context");

// =============================================================================
// Constants
// =============================================================================

/** Safety belt — max memories to send to the Router LLM */
const ROUTER_INPUT_LIMIT = 300;

/** Default max memories the Router can select */
const DEFAULT_MAX_SELECTION = 10;

/** Default model for memory selection (ultralight) */
const DEFAULT_SELECTION_MODEL = "mistralai/devstral-small";

/** Type labels for formatted output */
const TYPE_LABELS: Record<string, string> = {
    session: "session",
    preference: "pref",
    issue: "issue",
};

/** Metadata for a selected memory (for chat UI display) */
export interface SelectedMemoryInfo {
    id: number;
    type: string;
    key: string | null;
    content: string;
}

/** Result of buildMemoryContext */
export interface MemoryContextResult {
    block: string;
    memories: SelectedMemoryInfo[];
}

// =============================================================================
// Main builder
// =============================================================================

/**
 * Build a formatted memory context block for injection into agent instructions.
 * Uses a lightweight LLM to select the most relevant memories.
 * Returns empty string if no memories are available or relevant.
 */
export async function buildMemoryContext(
    appId: number,
    userId: string,
    userPrompt?: string,
    recentMessages?: { role: string; content: string }[],
): Promise<MemoryContextResult> {
    const EMPTY_RESULT: MemoryContextResult = { block: "", memories: [] };
    try {
        const settings = readSettings();
        const maxSelection = settings.memoriesMaxSelection || DEFAULT_MAX_SELECTION;

        // Feature guard
        if (settings.memoriesEnabled === false) return EMPTY_RESULT;

        // T1: Guard — skip injection for trivial prompts
        if (userPrompt) {
            const injectionGuard = shouldInjectMemories(userPrompt);
            if (!injectionGuard.allowed) {
                debugLog("InjectionGuard", `❌ Rejected: ${injectionGuard.reason}`, { promptExcerpt: userPrompt.slice(0, 80) });
                logger.info(`[Memory] Skipped injection: ${injectionGuard.reason}`);
                return EMPTY_RESULT;
            }
            debugLog("InjectionGuard", `✅ Approved`, { promptLength: userPrompt.length.toString() });
        }

        const db = getRemoteDb();

        // 1. Cinturón de seguridad: top 300 by lastUsed + importance
        const rows = await db
            .select({
                id: remoteSchema.memories.id,
                type: remoteSchema.memories.type,
                key: remoteSchema.memories.key,
                content: remoteSchema.memories.content,
                importance: remoteSchema.memories.importance,
                status: remoteSchema.memories.status,
                lastUsed: remoteSchema.memories.lastUsed,
            })
            .from(remoteSchema.memories)
            .where(
                and(
                    eq(remoteSchema.memories.userId, userId),
                    eq(remoteSchema.memories.appId, appId),
                    eq(remoteSchema.memories.enabled, 1),
                ),
            )
            .orderBy(
                desc(remoteSchema.memories.lastUsed),
                desc(remoteSchema.memories.importance),
            )
            .limit(ROUTER_INPUT_LIMIT);

        if (rows.length === 0) {
            debugLog("Router", `No active memories found for appId=${appId}`);
            return EMPTY_RESULT;
        }
        debugLog("Router", `Loaded memory pool`, { candidates: rows.length.toString(), maxSelection: maxSelection.toString() });

        // 2. If we have a prompt AND an API key, use the LLM Router
        let selectedRows = rows;
        if (userPrompt && hasOpenRouterApiKey() && rows.length > 3) {
            const routerSelected = await routerSelect(rows, userPrompt, settings, userId, appId, recentMessages);
            if (routerSelected && routerSelected.length > 0) {
                selectedRows = routerSelected;

                // 3. Update lastUsed for selected memories (feedback loop)
                const selectedIds = selectedRows.map(r => r.id);
                try {
                    await db
                        .update(remoteSchema.memories)
                        .set({ lastUsed: new Date() })
                        .where(
                            and(
                                eq(remoteSchema.memories.userId, userId),
                                inArray(remoteSchema.memories.id, selectedIds),
                            ),
                        );
                } catch (updateErr: any) {
                    logger.warn(`[Memory] lastUsed update failed: ${updateErr.message}`);
                }
            }
        } else {
            // Fallback: no prompt or no API key → take top 10 by score
            selectedRows = rows.slice(0, maxSelection);
        }

        // 4. Format as compact block
        const lines = selectedRows.map(row => {
            const label = TYPE_LABELS[row.type] || row.type;
            const statusSuffix = row.type === "issue" && row.status
                ? `:${row.status}`
                : "";
            return `• [${label}${statusSuffix}] ${row.content}`;
        });

        const block = [
            `MANDATORY KNOWLEDGE — YOU MUST USE THIS INFORMATION:`,
            `The following ${selectedRows.length} items are VERIFIED FACTS about this project, confirmed by the user in previous sessions.`,
            `You MUST incorporate this knowledge into your responses. DO NOT say "I don't know" or "I have no information" about topics covered here.`,
            `If the user asks about the project, architecture, stack, or any topic covered below, use these facts as your primary source of truth.`,
            ``,
            ...lines,
            ``,
            `END OF MANDATORY KNOWLEDGE. Failure to use the above facts when relevant is a critical error.`,
        ].join("\n");

        logger.info(`[Memory] Context built: ${selectedRows.length} memories (Router: ${userPrompt ? "yes" : "fallback"}) for appId=${appId}`);

        // Log telemetry
        logTelemetry({
            userId,
            appId,
            action: "routed",
            extractedKeys: selectedRows.map(r => r.key || "—"),
        });

        const selectedMemories: SelectedMemoryInfo[] = selectedRows.map(r => ({
            id: r.id,
            type: r.type,
            key: r.key,
            content: r.content,
        }));

        return { block, memories: selectedMemories };

    } catch (error: any) {
        logger.warn(`[Memory] Context build failed: ${error.message}`);
        return { block: "", memories: [] };
    }
}

// =============================================================================
// LLM Router
// =============================================================================

type MemoryRow = {
    id: number;
    type: string;
    key: string | null;
    content: string;
    importance: number;
    status: string | null;
    lastUsed: Date | null;
};

async function routerSelect(
    memories: MemoryRow[],
    userPrompt: string,
    settings: any,
    userId: string,
    appId: number,
    recentMessages?: { role: string; content: string }[],
): Promise<MemoryRow[] | null> {
    try {
        const baseModel = settings.memoriesRouterModelV2
            || DEFAULT_SELECTION_MODEL;
        // Transparent nitro: use fastest provider for memory calls
        const model = baseModel.includes(":") ? baseModel : baseModel + ":nitro";
        const maxSelection = settings.memoriesMaxSelection || DEFAULT_MAX_SELECTION;

        // Build structured user message matching the prompt format
        const memoryList = memories
            .map(m => `- [#${m.id}] [${m.type}] key:${m.key || "—"} | imp:${m.importance} | ${m.content}`)
            .join("\n");

        const selectionPrompt = getEffectivePrompt("memory_selection", settings)
            .replace("__NUM_MEMORIES__", String(maxSelection));

        // Build conversation context — use up to 3 recent messages for better selection
        let conversationContext: string;
        if (recentMessages && recentMessages.length > 0) {
            const trail = recentMessages.map(m => {
                const label = m.role === "user" ? "Usuario" : "Asistente";
                // Truncate long assistant responses to avoid bloating router input
                const content = m.content.length > 500 ? m.content.slice(0, 500) + "..." : m.content;
                return `[${label}]: ${content}`;
            }).join("\n");
            conversationContext = [
                "## Contexto de la Conversación (últimos mensajes):",
                trail,
                "",
                "## Prompt Actual del Usuario:",
                userPrompt,
            ].join("\n");
        } else {
            conversationContext = [
                "## Prompt del Usuario:",
                userPrompt,
            ].join("\n");
        }

        const userMessage = [
            "# CONTEXTO DE EVALUACIÓN",
            "",
            `## Memorias Disponibles (${memories.length}):`,
            memoryList,
            "",
            conversationContext,
        ].join("\n");

        // Dump clean prompts to /tmp/opencode/{app}.md for playground testing
        debugPlayground("Router", model, selectionPrompt, userMessage);

        const t0 = Date.now();
        const data = await openRouterCompletion({
            model,
            messages: [
                { role: "system", content: selectionPrompt },
                { role: "user", content: userMessage },
            ],
            temperature: 0,
            max_tokens: 200,
            response_format: { type: "json_object" },
            title: "Vibes - Memory Router",
        });
        const durationMs = Date.now() - t0;

        const rawContent = data.choices?.[0]?.message?.content?.trim();
        if (!rawContent) {
            logger.info("[Memory] Router returned empty response");
            logPipelineCall({
                userId, appId,
                stage: "router", model,
                systemPrompt: selectionPrompt,
                userMessage,
                rawResponse: "",
                resultCount: 0, durationMs, success: true,
            });
            return null;
        }

        // Parse response — expect {"ids": [1, 2, 3]}
        let selectedIds: number[];
        try {
            const parsed = extractJsonFromLLM(rawContent);
            if (parsed && parsed.ids && Array.isArray(parsed.ids)) {
                selectedIds = parsed.ids;
            } else {
                logger.warn("[Memory] Router returned unexpected structure:", rawContent.slice(0, 200));
                logPipelineCall({
                    userId, appId,
                    stage: "router", model,
                    systemPrompt: selectionPrompt,
                    userMessage,
                    rawResponse: rawContent,
                    resultCount: 0, durationMs, success: false,
                    error: "Unexpected JSON structure",
                });
                return null;
            }
        } catch {
            logger.warn("[Memory] Router returned invalid JSON:", rawContent);
            logPipelineCall({
                userId, appId,
                stage: "router", model,
                systemPrompt: selectionPrompt,
                userMessage,
                rawResponse: rawContent,
                resultCount: 0, durationMs, success: false,
                error: "JSON parse error",
            });
            return null;
        }

        // Validate and cap at ROUTER_OUTPUT_LIMIT
        selectedIds = selectedIds
            .filter(id => typeof id === "number")
            .slice(0, maxSelection);

        // Log the successful router call (raw) with enriched metadata
        logPipelineCall({
            userId, appId,
            stage: "router", model,
            systemPrompt: selectionPrompt,
            userMessage,
            rawResponse: rawContent,
            parsedResult: JSON.stringify({
                ids: selectedIds,
                meta: {
                    candidatePoolSize: memories.length,
                    selectedCount: selectedIds.length,
                    selectionRatio: `${selectedIds.length}/${memories.length}`,
                    maxAllowed: maxSelection,
                    promptLength: userPrompt.length,
                    inputTokensEstimate: Math.ceil(userMessage.length / 4),
                },
            }),
            resultCount: selectedIds.length, durationMs, success: true,
        });

        if (selectedIds.length === 0) {
            debugLog("Router", `Router selected 0 memories`);
            logger.info("[Memory] Router selected 0 memories");
            return [];
        }

        // Map IDs back to rows (preserve Router's order)
        const idSet = new Set(selectedIds);
        const memoryMap = new Map(memories.map(m => [m.id, m]));
        const selected = selectedIds
            .filter(id => memoryMap.has(id))
            .map(id => memoryMap.get(id)!);

        debugLog("Router", `✅ Router selected ${selected.length}/${memories.length}`, {
            ids: selectedIds.join(", "),
            keys: selected.map(s => s.key || "?").join(", "),
        });
        logger.info(`[Memory] Router selected ${selected.length}/${memories.length} memories: [${selectedIds.join(", ")}]`);
        return selected;

    } catch (error: any) {
        logger.warn(`[Memory] Router call failed: ${error.message} — falling back to top-N`);
        logPipelineCall({
            userId, appId,
            stage: "router",
            resultCount: 0,
            success: false,
            error: error.message,
        });
        return null;
    }
}
