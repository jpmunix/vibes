import log from "electron-log";
import { app } from "electron";
import * as path from "path";
import * as fs from "fs/promises";
import type { ModelOption } from "../shared/language_model_constants";

const logger = log.scope("openrouter-models");

// =============================================================================
// Types matching OpenRouter /api/v1/models response
// =============================================================================

interface OpenRouterModel {
    id: string;
    name: string;
    description: string;
    context_length: number;
    architecture: {
        modality: string;
        input_modalities: string[];
        output_modalities: string[];
        tokenizer: string;
        instruct_type: string | null;
    };
    pricing: {
        prompt: string;
        completion: string;
        web_search?: string;
        input_cache_read?: string;
        input_cache_write?: string;
    };
    top_provider: {
        context_length: number;
        max_completion_tokens: number;
        is_moderated: boolean;
    };
    supported_parameters: string[];
}

interface OpenRouterModelsResponse {
    data: OpenRouterModel[];
}

// =============================================================================
// File-based cache (30 days TTL, stored in userData)
// =============================================================================

interface CachedModelsFile {
    models: ModelOption[];
    fetchedAt: number;
    cacheVersion?: number;
}

const CACHE_VERSION = 10; // Bumped: blocklist cleanup + re-enable :free models

const CACHE_TTL_MS = 1 * 24 * 60 * 60 * 1000; // 1 day
const CACHE_FILENAME = "openrouter-models-cache.json";

// In-memory cache to avoid re-reading from disk every time
let memoryCache: CachedModelsFile | null = null;

function getCacheFilePath(): string {
    return path.join(app.getPath("userData"), CACHE_FILENAME);
}

async function readCacheFromDisk(): Promise<CachedModelsFile | null> {
    try {
        const data = await fs.readFile(getCacheFilePath(), "utf-8");
        const parsed = JSON.parse(data) as CachedModelsFile;
        if (parsed?.models && Array.isArray(parsed.models) && parsed.fetchedAt) {
            return parsed;
        }
    } catch {
        // File doesn't exist or is corrupt — fine, return null
    }
    return null;
}

async function writeCacheToDisk(cache: CachedModelsFile): Promise<void> {
    try {
        await fs.writeFile(getCacheFilePath(), JSON.stringify(cache), "utf-8");
    } catch (err) {
        logger.warn("Failed to write models cache to disk:", err);
    }
}

function isCacheValid(cache: CachedModelsFile | null): boolean {
    if (!cache) return false;
    if (cache.cacheVersion !== CACHE_VERSION) return false;
    return Date.now() - cache.fetchedAt < CACHE_TTL_MS;
}

export function clearOpenRouterModelsCache(): void {
    memoryCache = null;
    fs.unlink(getCacheFilePath()).catch(() => { });
}

// =============================================================================
// Curated model IDs (shown first and always included)
// =============================================================================

const CURATED_MODEL_IDS = new Set([
    "anthropic/claude-opus-4.6",
    "google/gemini-3.1-pro-preview",
    "google/gemini-3-flash-preview",
    "openai/gpt-5.1-codex-max",
    "openai/gpt-5.2-codex",
    "openai/gpt-5.1-codex-mini",
    "x-ai/grok-code-fast-1",
    "moonshotai/kimi-k2.5",
    "minimax/minimax-m2.5",
    "qwen/qwen-plus-2025-07-28:thinking",
]);

// =============================================================================
// Blocked model IDs (legacy, irrelevant, duplicated, or too small for coding)
// =============================================================================

const BLOCKED_MODEL_IDS = new Set([
    // OpenAI — GPT-4 Turbo legacy
    "openai/gpt-4-turbo",
    "openai/gpt-4-1106-preview",
    "openai/gpt-4-turbo-preview",

    // OpenAI — Date snapshots (redundant with generic ID)
    "openai/gpt-4o-2024-05-13",
    "openai/gpt-4o-2024-08-06",
    "openai/gpt-4o-2024-11-20",
    "openai/gpt-4o-mini-2024-07-18",

    // OpenAI — Audio models (not for coding)
    "openai/gpt-audio",
    "openai/gpt-audio-mini",
    "openai/gpt-4o-audio-preview",

    // OpenAI — Deep Research (not for agentic coding)
    "openai/o3-deep-research",
    "openai/o4-mini-deep-research",

    // OpenAI — Legacy oX series (superseded by GPT-5.x Codex)
    "openai/o1",
    "openai/o3",
    "openai/o3-mini",
    "openai/o3-mini-high",
    "openai/o3-pro",
    "openai/o4-mini-high",

    // OpenAI — Chat (non-Codex, no reasoning, limited context)
    "openai/gpt-5.1-chat",
    "openai/gpt-5.2-chat",
    "openai/gpt-5.3-chat",

    // Mistral — Legacy/duplicated versions
    "mistralai/mistral-large",
    "mistralai/mistral-large-2407",
    "mistralai/mistral-large-2411",
    "mistralai/mixtral-8x22b-instruct",
    "mistralai/pixtral-large-2411",
    "mistralai/mistral-medium-3",
    "mistralai/mistral-nemo",

    // Mistral — Too small or voice models
    "mistralai/ministral-3b-2512",
    "mistralai/ministral-8b-2512",
    "mistralai/ministral-14b-2512",
    "mistralai/voxtral-small-24b-2507",
    "mistralai/mistral-saba",

    // Roleplay / Creative writing (not for coding)
    "thedrummer/rocinante-12b",
    "thedrummer/unslopnemo-12b",
    "sao10k/l3.1-euryale-70b",

    // Niche / Unknown providers
    "essentialai/rnj-1-instruct",
    "nex-agi/deepseek-v3.1-nex-n1",
    "tngtech/deepseek-r1t2-chimera",
    "relace/relace-search",
    "kwaipilot/kat-coder-pro-v2",

    // Too small for agentic coding (≤14B effective params)
    "nvidia/nemotron-nano-9b-v2",
    "ibm-granite/granite-4.1-8b",
    "baidu/ernie-4.5-21b-a3b",

    // Qwen — Legacy versions (superseded by 3.x)
    "qwen/qwen-2.5-72b-instruct",
    "qwen/qwen-max",
    "qwen/qwen-turbo",
    "qwen/qwen-plus",
    "qwen/qwen-plus-2025-07-28",

    // Qwen — Vision-Language models (redundant for pure coding)
    "qwen/qwen-vl-max",
    "qwen/qwen3-vl-8b-instruct",
    "qwen/qwen3-vl-8b-thinking",
    "qwen/qwen3-vl-30b-a3b-instruct",
    "qwen/qwen3-vl-30b-a3b-thinking",
    "qwen/qwen3-vl-32b-instruct",
    "qwen/qwen3-vl-235b-a22b-instruct",
    "qwen/qwen3-vl-235b-a22b-thinking",

    // Google — Redundant previews & old Gemma
    "google/gemini-2.5-pro-preview",
    "google/gemini-2.5-pro-preview-05-06",
    "google/gemini-2.5-flash-lite-preview-09-2025",
    "google/gemini-3.1-pro-preview-customtools",
    "google/gemma-3-12b-it",
    "google/gemma-3-27b-it",

    // Anthropic — Legacy
    "anthropic/claude-3-haiku",
    "anthropic/claude-3.7-sonnet",
    "anthropic/claude-3.7-sonnet:thinking",

    // Cohere — Legacy
    "cohere/command-r-08-2024",
    "cohere/command-r-plus-08-2024",

    // Meta Llama — Superseded
    "meta-llama/llama-3.1-70b-instruct",
    "meta-llama/llama-3.3-70b-instruct",

    // DeepSeek — Duplicates
    "deepseek/deepseek-chat",
    "deepseek/deepseek-r1",
]);

// =============================================================================
// Price to dollar signs mapping
// =============================================================================

function priceToDollarSigns(completionPrice: string): number {
    const price = parseFloat(completionPrice);
    if (isNaN(price) || price === 0) return 0;  // free
    if (price <= 0.000001) return 1;              // very cheap
    if (price <= 0.000004) return 2;              // moderate
    if (price <= 0.000015) return 3;              // expensive
    return 4;                                     // premium
}

// =============================================================================
// Transform OpenRouter model → ModelOption
// =============================================================================

function transformModel(model: OpenRouterModel): ModelOption {
    const isCurated = CURATED_MODEL_IDS.has(model.id);
    const supportsReasoning = model.supported_parameters?.includes("reasoning");

    const description = model.description || "";

    // Clean display name: remove provider prefix (e.g. "Anthropic: Claude Sonnet 4.5" → "Claude Sonnet 4.5")
    let displayName = model.name;
    const colonIndex = displayName.indexOf(": ");
    if (colonIndex !== -1) {
        displayName = displayName.substring(colonIndex + 2);
    }

    const contextWindow = model.context_length || undefined;
    let maxOutputTokens = model.top_provider?.max_completion_tokens || undefined;

    // Cap maxOutputTokens to always leave room for input (system prompt + tools + messages).
    // The system prompt + tool definitions alone consume ~20-30K tokens.
    // Many providers (Kimi K2.5, o3-mini, etc.) report max_completion_tokens ≈ context_length,
    // which makes input+output always exceed the window. Cap at 85% of context to be safe.
    if (maxOutputTokens && contextWindow) {
        const safeMax = Math.floor(contextWindow * 0.85);
        if (maxOutputTokens > safeMax) {
            maxOutputTokens = Math.max(4096, safeMax);
        }
    }

    return {
        name: model.id,
        displayName,
        description,
        maxOutputTokens,
        contextWindow,
        temperature: 0,
        dollarSigns: priceToDollarSigns(model.pricing?.completion || "0"),
        brainSigns: undefined,
        tag: supportsReasoning ? "Reasoning" : undefined,
        tagColor: supportsReasoning ? "purple" : undefined,
        pricingInput: model.pricing?.prompt != null ? model.pricing.prompt : undefined,
        pricingOutput: model.pricing?.completion != null ? model.pricing.completion : undefined,
        inputModalities: model.architecture?.input_modalities || undefined,
        outputModalities: model.architecture?.output_modalities || undefined,
        supportedParameters: model.supported_parameters || undefined,
    };
}

// =============================================================================
// Filter models relevant for coding
// =============================================================================

function isRelevantForCoding(model: OpenRouterModel): boolean {
    // Skip "-latest" aliases — just pointers to versioned models already in the list
    if (model.id.endsWith("-latest")) return false;

    // Skip explicitly blocked models (legacy, niche, too small, duplicates)
    if (BLOCKED_MODEL_IDS.has(model.id)) return false;

    // Must support text output
    if (!model.architecture?.output_modalities?.includes("text")) return false;

    // Must support text input
    if (!model.architecture?.input_modalities?.includes("text")) return false;

    // Exclude image/audio/video generation models
    if (model.architecture.modality?.includes("->image")) return false;
    if (model.architecture.modality?.includes("->audio")) return false;
    if (model.architecture.modality?.includes("->video")) return false;

    // Must have reasonable context (at least 32k for agent work)
    if (model.context_length < 32000) return false;

    // Curated models always pass (hand-picked, known to work well)
    if (CURATED_MODEL_IDS.has(model.id)) return true;

    // MUST support tool-calling — without tools the agent can’t operate
    if (!model.supported_parameters?.includes("tools")) return false;

    // Reasoning is desirable but not mandatory — non-reasoning models
    // with tool support are still valid choices and shown in the
    // “Modelos sin razonamiento” panel in settings.
    return true;
}

// =============================================================================
// Main API fetch function
// =============================================================================

export async function fetchOpenRouterModels(): Promise<ModelOption[]> {
    // 1. Check in-memory cache first
    if (isCacheValid(memoryCache)) {
        return memoryCache!.models;
    }

    // 2. Check disk cache
    const diskCache = await readCacheFromDisk();
    if (isCacheValid(diskCache)) {
        memoryCache = diskCache;
        logger.info(`Loaded ${diskCache!.models.length} cached OpenRouter models from disk`);
        return diskCache!.models;
    }

    // 3. Fetch from API in background — if we have stale disk cache, return it immediately
    // and refresh in background
    if (diskCache && diskCache.models.length > 0) {
        memoryCache = diskCache;
        logger.info(`Returning stale disk cache (${diskCache.models.length} models), refreshing in background...`);
        // Fire-and-forget background refresh
        refreshModelsFromAPI().catch((err) =>
            logger.error("Background refresh failed:", err),
        );
        return diskCache.models;
    }

    // 4. No cache at all — must fetch synchronously (first run only)
    return refreshModelsFromAPI();
}

async function refreshModelsFromAPI(): Promise<ModelOption[]> {
    try {
        logger.info("Fetching models from OpenRouter API...");

        const response = await fetch("https://openrouter.ai/api/v1/models", {
            method: "GET",
            headers: { "Content-Type": "application/json" },
        });

        if (!response.ok) {
            throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
        }

        const data = (await response.json()) as OpenRouterModelsResponse;

        if (!data?.data || !Array.isArray(data.data)) {
            throw new Error("Invalid response format from OpenRouter /models API");
        }

        logger.info(`Received ${data.data.length} models from OpenRouter API`);

        // Filter and transform
        const relevantModels = data.data.filter(isRelevantForCoding);
        const transformed = relevantModels.map(transformModel);

        // Sort: curated first, then by displayName
        transformed.sort((a, b) => {
            const aIsCurated = CURATED_MODEL_IDS.has(a.name);
            const bIsCurated = CURATED_MODEL_IDS.has(b.name);
            if (aIsCurated && !bIsCurated) return -1;
            if (!aIsCurated && bIsCurated) return 1;
            return a.displayName.localeCompare(b.displayName);
        });

        logger.info(`Filtered to ${transformed.length} relevant models`);

        // Save to memory and disk
        const cache: CachedModelsFile = {
            models: transformed,
            fetchedAt: Date.now(),
            cacheVersion: CACHE_VERSION,
        };
        memoryCache = cache;
        await writeCacheToDisk(cache);

        return transformed;
    } catch (error) {
        logger.error("Failed to fetch OpenRouter models:", error);
        // Return whatever we have in memory/disk
        if (memoryCache) return memoryCache.models;
        return [];
    }
}
