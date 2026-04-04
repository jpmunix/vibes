/**
 * Smart Mode Classifier — lightweight intent detection for chat prompts.
 *
 * Makes a single, fast call to a small model (gemma-3-12b) via OpenRouter
 * to classify the user's prompt as ask/plan/build/context BEFORE routing
 * to the OpenCode agent.  The entire request targets ≤5 output tokens
 * with temperature 0 for deterministic, near-instant classification.
 *
 * This module has NO dependency on OpenCode — it's a plain fetch to
 * the OpenRouter chat/completions API.
 */

import log from "electron-log";
import { readSettings } from "@/main/settings";
import { getEffectivePrompt } from "@/prompts/index";

const logger = log.scope("smart-mode");

// ── Constants ────────────────────────────────────────────────────────────────
const CLASSIFIER_MODELS = [
    "google/gemini-2.5-flash-lite",
    "openai/gpt-5.4-nano",
    "google/gemma-3-4b-it",
] as const;
export const CLASSIFIER_MODEL = CLASSIFIER_MODELS[0];
const CLASSIFIER_TIMEOUT_MS = 5_000;

// ── Types ────────────────────────────────────────────────────────────────────
export type SmartModeIntent = "ask" | "plan" | "build" | "context";

const VALID_INTENTS: SmartModeIntent[] = ["ask", "plan", "build", "context"];
const DEFAULT_INTENT: SmartModeIntent = "build";

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Strip tool tags, thinking blocks, and other AI-internal markup from a
 * message so the classifier sees clean, human-readable text.
 */
function simplifyMessage(content: string): string {
    return content
        .replace(/<think>[\s\S]*?<\/think>/g, "")
        .replace(/<vibes-[\w-]+[^>]*>[\s\S]*?<\/vibes-[\w-]+>/g, "")
        .replace(/<vibes-[\w-]+[^/]*\/>/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
        .slice(0, 200);
}

/**
 * Retrieve the active OpenRouter API key from user settings.
 * Checks both legacy single-key and multi-key configurations.
 */
export function getOpenRouterApiKey(): string | null {
    const settings = readSettings();

    // Legacy single key
    const legacy = (settings.providerSettings?.openrouter as any)?.apiKey?.value;
    if (legacy) return legacy;

    // Multi-key setup
    const orSettings = settings.providerSettings?.openrouter as any;
    if (orSettings?.keys?.length > 0) {
        const selectedId = orSettings.selectedKeyId;
        const selected = selectedId
            ? orSettings.keys.find((k: any) => k.id === selectedId)
            : orSettings.keys[0];
        if (selected?.key?.value) return selected.key.value;
    }

    return null;
}

// ── Main classifier ─────────────────────────────────────────────────────────

/**
 * Classify a user prompt into one of: ask, plan, build, context.
 *
 * @param userPrompt   The raw prompt text from the user
 * @param recentMessages  Last 2-4 chat messages (user+assistant) for context
 * @param apiKey       OpenRouter API key
 * @returns Classified intent. Falls back to "build" on any error.
 */
export async function classifyUserIntent(
    userPrompt: string,
    recentMessages: { role: string; content: string }[],
    apiKey: string,
): Promise<SmartModeIntent> {
    try {
        // Get the classifier prompt (user-customizable via settings)
        const settings = readSettings();
        const classifierSystemPrompt = getEffectivePrompt("smart_mode_classifier", settings);

        // Build message array: system + recent context + current user prompt
        const messages: { role: string; content: string }[] = [
            { role: "system", content: classifierSystemPrompt },
        ];

        // Add simplified recent messages for context (max 4 = ~2 rounds)
        for (const msg of recentMessages.slice(-4)) {
            const simplified = simplifyMessage(msg.content);
            if (simplified) {
                messages.push({ role: msg.role, content: simplified });
            }
        }

        // Add the current user prompt (not simplified — classifier needs full text)
        messages.push({ role: "user", content: userPrompt.slice(0, 500) });

        // Fetch with hard timeout
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), CLASSIFIER_TIMEOUT_MS);

        // Try models in order until one succeeds
        let intent: SmartModeIntent | null = null;
        for (const model of CLASSIFIER_MODELS) {
            intent = await tryClassify(messages, model, apiKey, controller.signal);
            if (intent) break;
        }

        clearTimeout(timeout);

        if (intent) return intent;

        logger.warn(`[SmartMode] All ${CLASSIFIER_MODELS.length} models failed — defaulting to "${DEFAULT_INTENT}"`);
        return DEFAULT_INTENT;
    } catch (error: any) {
        if (error.name === "AbortError") {
            logger.warn(`[SmartMode] Classifier timed out (${CLASSIFIER_TIMEOUT_MS}ms) — defaulting to "${DEFAULT_INTENT}"`);
        } else {
            logger.warn(`[SmartMode] Classifier error: ${error.message} — defaulting to "${DEFAULT_INTENT}"`);
        }
        return DEFAULT_INTENT;
    }
}

/** Try a single classification request. Returns null on failure (caller should retry). */
async function tryClassify(
    messages: { role: string; content: string }[],
    model: string,
    apiKey: string,
    signal: AbortSignal,
    useStructuredOutput = true,
): Promise<SmartModeIntent | null> {
    try {
        const body: Record<string, any> = {
            model,
            messages,
            max_tokens: useStructuredOutput ? 20 : 5,
            temperature: 0,
        };

        if (useStructuredOutput) {
            body.response_format = {
                type: "json_schema",
                json_schema: {
                    name: "intent_classification",
                    strict: true,
                    schema: {
                        type: "object",
                        properties: {
                            intent: {
                                type: "string",
                                enum: ["ask", "plan", "build", "context"],
                            },
                        },
                        required: ["intent"],
                        additionalProperties: false,
                    },
                },
            };
        }

        logger.info(`[SmartMode] Trying ${model} (structured=${useStructuredOutput})...`);

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`,
            },
            body: JSON.stringify(body),
            signal,
        });

        if (response.status === 429) {
            logger.warn(`[SmartMode] ${model} → 429 rate limited`);
            return null;
        }

        if (response.status === 400 && useStructuredOutput) {
            // Model doesn't support structured outputs — retry without it
            const errBody = await response.text();
            logger.warn(`[SmartMode] ${model} → 400 (structured output not supported): ${errBody.slice(0, 200)}`);
            return tryClassify(messages, model, apiKey, signal, false);
        }

        if (!response.ok) {
            const errBody = await response.text();
            logger.warn(`[SmartMode] ${model} → HTTP ${response.status}: ${errBody.slice(0, 300)}`);
            return null;
        }

        const data = await response.json();
        const raw = (data.choices?.[0]?.message?.content || "").trim();
        logger.info(`[SmartMode] ${model} raw response: "${raw}"`);

        // Parse structured JSON response
        try {
            const parsed = JSON.parse(raw);
            const intent = parsed.intent?.toLowerCase() as SmartModeIntent;
            if (VALID_INTENTS.includes(intent)) {
                logger.info(`[SmartMode] Classified via ${model}: "${intent}"`);
                return intent;
            }
        } catch {
            // Fallback: try extracting first word (plain text response)
            const firstWord = raw.toLowerCase().split(/[\s.,;!?"{}:]+/)[0] as SmartModeIntent;
            if (VALID_INTENTS.includes(firstWord)) {
                logger.info(`[SmartMode] Classified via ${model} (text): "${firstWord}"`);
                return firstWord;
            }
        }

        logger.warn(`[SmartMode] ${model} → invalid response: "${raw}"`);
        return null;
    } catch (error: any) {
        if (error.name === "AbortError") throw error;
        logger.warn(`[SmartMode] ${model} → error: ${error.message}`);
        return null;
    }
}
