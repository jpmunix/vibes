/**
 * Memory Extractor — Write Pipeline
 *
 * Extracts structured memories from a chat cycle (user prompt + AI response)
 * using a cheap/fast LLM call. Handles:
 * - LLM-based extraction with anti-hallucination prompt
 * - Anti-noise filtering (regex + length + importance threshold)
 * - Key-based overwrite (upsert by key to avoid duplicates)
 * - Scope detection (global vs project → app_id=0 vs app_id=N)
 */

import log from "electron-log";
import { readSettings } from "../../main/settings";
import { openRouterCompletion, hasOpenRouterApiKey } from "./openrouter";
import { DEFAULT_STANDARD_MODEL } from "../../lib/schemas";
import { getRemoteDb } from "../../db/remote";
import * as remoteSchema from "../../db/remote-schema";
import { eq, and, or } from "drizzle-orm";
import type { MemoryEntry } from "../types/memory";

const logger = log.scope("memory_extractor");

// =============================================================================
// Types
// =============================================================================

interface ExtractedMemory {
    type: "fact" | "preference" | "issue" | "episode" | "decision";
    key: string | null;
    content: string;
    importance: number; // 0.0–1.0
    scope: "global" | "project";
    status?: string;
}

interface ExtractionResult {
    memories: ExtractedMemory[];
    raw?: string; // Raw LLM response for debugging
}

// =============================================================================
// Extraction Prompt
// =============================================================================

const EXTRACTION_SYSTEM_PROMPT = `You are a memory extraction system for an AI coding assistant. Your job is to extract important, reusable knowledge from a conversation between a user and an AI.

RULES:
- Extract AT MOST 3 memories per conversation cycle
- Each memory must be ATOMIC: one clear piece of knowledge
- Do NOT extract trivial information (file paths, import statements, CSS values, variable names)
- Do NOT extract information that is only relevant to the current task
- DO extract facts about the project architecture, tech stack, and conventions
- DO extract user preferences about coding style, tools, and processes
- DO extract decisions with their rationale
- DO extract recurring issues or bugs
- DO extract key takeaways from completed work

TYPES:
- "fact": stable truth about the project (e.g. "Backend uses PHP without frameworks")
- "preference": user coding style or process preference (e.g. "Prefers camelCase in TypeScript")
- "issue": bug or problem with lifecycle (e.g. "Redis concurrency under high load")
- "episode": summary of significant completed work (e.g. "Implemented JWT auth with refresh tokens")
- "decision": architectural choice with rationale (e.g. "Chose Redis over Memcached for lower latency")

SCOPE:
- "global": applies to ALL projects (preferences, coding conventions, language choices)
- "project": specific to THIS project (architecture facts, project-specific decisions, issues)

Hints for scope detection:
- Words like "siempre", "nunca", "prefiero", "always", "never" → likely global
- Mentions a specific file, table, service, or project-specific tech → project
- Generic code style rule → global
- Architecture fact about this codebase → project
- "preference" type → usually global
- "issue" and "episode" types → usually project

KEY:
- Assign a short, unique key for overwrite (e.g. "backend_framework", "naming_convention_ts")
- If a memory with the same key already exists, the new one will replace it
- Use snake_case, be specific but concise

IMPORTANCE (0.0–1.0):
- 1.0: Critical project fact or strong user preference
- 0.7-0.9: Important architectural decision or recurring pattern
- 0.4-0.6: Useful context, moderate relevance
- 0.1-0.3: Minor detail, may decay over time

Respond ONLY with a JSON array. No explanation, no markdown. Empty array [] if nothing worth extracting.

Example output:
[
  {"type":"fact","key":"backend_stack","content":"Backend uses PHP without frameworks, MySQL for persistence, Redis for caching","importance":0.9,"scope":"project"},
  {"type":"preference","key":"naming_ts","content":"User prefers camelCase for TypeScript variables and functions","importance":0.8,"scope":"global"}
]`;

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

// =============================================================================
// Scope inference fallback
// =============================================================================

function inferScope(memory: ExtractedMemory, appId: number): number {
    // LLM said global
    if (memory.scope === "global") return 0;

    // Override: preferences are almost always global
    if (memory.type === "preference") return 0;

    // Override: issues and episodes are almost always project-specific
    if (memory.type === "issue" || memory.type === "episode") return appId;

    // Default to what the LLM said
    return memory.scope === "project" ? appId : 0;
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
        // 1. Load existing memories for context (avoid duplicates at LLM level)
        const db = getRemoteDb();
        const existingRows = await db
            .select()
            .from(remoteSchema.memories)
            .where(
                and(
                    eq(remoteSchema.memories.userId, userId),
                    or(
                        eq(remoteSchema.memories.appId, appId),
                        eq(remoteSchema.memories.appId, 0),
                    ),
                    eq(remoteSchema.memories.enabled, 1),
                ),
            );

        const existingContext = existingRows.length > 0
            ? `\n\nEXISTING MEMORIES (do NOT duplicate these, only add NEW knowledge or UPDATE if contradicted):\n${existingRows.map(m => `- [${m.type}] ${m.key || "—"}: ${m.content}`).join("\n")}`
            : "";

        // 2. Truncate inputs to avoid excessive token usage
        const maxPromptLen = 2000;
        const maxResponseLen = 3000;
        const truncatedPrompt = userPrompt.length > maxPromptLen
            ? userPrompt.slice(0, maxPromptLen) + "... [truncated]"
            : userPrompt;
        const truncatedResponse = assistantResponse.length > maxResponseLen
            ? assistantResponse.slice(0, maxResponseLen) + "... [truncated]"
            : assistantResponse;

        // 3. LLM extraction call
        const model = settings.memoriesExtractionModel
            || settings.standardModeModel
            || DEFAULT_STANDARD_MODEL;

        const userMessage = `USER MESSAGE:\n${truncatedPrompt}\n\nASSISTANT RESPONSE:\n${truncatedResponse}${existingContext}`;

        const data = await openRouterCompletion({
            model,
            messages: [
                { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
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

        // 4. Parse JSON response
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

        // 5. Filter and persist
        const persisted: MemoryEntry[] = [];

        for (const mem of extracted.slice(0, 3)) { // Hard cap at 3
            // Validate required fields
            if (!mem.type || !mem.content) continue;

            // Anti-noise filter
            if (isNoisy(mem.content)) {
                logger.info(`[Memory] Filtered noisy: "${mem.content.slice(0, 50)}..."`);
                continue;
            }

            // Importance threshold
            const importance = Math.max(0, Math.min(1, mem.importance ?? 0.5));
            if (importance < 0.3) {
                logger.info(`[Memory] Filtered low importance (${importance}): "${mem.content.slice(0, 50)}..."`);
                continue;
            }

            // Resolve scope
            const resolvedAppId = inferScope(mem, appId);

            // Key-based overwrite: check if a memory with the same key exists
            const now = new Date();
            const importanceInt = Math.round(importance * 100);

            if (mem.key) {
                const existing = existingRows.find(
                    e => e.key === mem.key && (e.appId === resolvedAppId || e.appId === 0),
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
            });
        }

        logger.info(`[Memory] Extraction complete: ${persisted.length} memories persisted from chat ${chatId}`);
        return persisted;

    } catch (error: any) {
        logger.warn(`[Memory] Extraction failed (non-blocking): ${error.message}`);
        return [];
    }
}
