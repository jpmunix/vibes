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

const CACHE_VERSION = 4; // Bumped: curated model list reduced to 10

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
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
// Curated model IDs (shown first as "Recomendado")
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
    "qwen/qwen-plus-2025-07-28",
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

    // Truncate description to 150 chars
    let description = model.description || "";
    if (description.length > 150) {
        description = description.substring(0, 147) + "...";
    }

    // Clean display name: remove provider prefix (e.g. "Anthropic: Claude Sonnet 4.5" → "Claude Sonnet 4.5")
    let displayName = model.name;
    const colonIndex = displayName.indexOf(": ");
    if (colonIndex !== -1) {
        displayName = displayName.substring(colonIndex + 2);
    }

    return {
        name: model.id,
        displayName,
        description,
        maxOutputTokens: model.top_provider?.max_completion_tokens || undefined,
        contextWindow: model.context_length || undefined,
        temperature: 0,
        dollarSigns: priceToDollarSigns(model.pricing?.completion || "0"),
        brainSigns: undefined,
        tag: isCurated ? "Recomendado" : supportsReasoning ? "Reasoning" : undefined,
        tagColor: isCurated ? "blue" : supportsReasoning ? "purple" : undefined,
        pricingInput: model.pricing?.prompt != null ? model.pricing.prompt : undefined,
        pricingOutput: model.pricing?.completion != null ? model.pricing.completion : undefined,
        inputModalities: model.architecture?.input_modalities || undefined,
        outputModalities: model.architecture?.output_modalities || undefined,
    };
}

// =============================================================================
// Filter models relevant for coding
// =============================================================================

function isRelevantForCoding(model: OpenRouterModel): boolean {
    // Must support text output
    if (!model.architecture?.output_modalities?.includes("text")) return false;

    // Must support text input
    if (!model.architecture?.input_modalities?.includes("text")) return false;

    // Exclude image/audio/video generation models
    if (model.architecture.modality?.includes("->image")) return false;
    if (model.architecture.modality?.includes("->audio")) return false;
    if (model.architecture.modality?.includes("->video")) return false;

    // Must have reasonable context (at least 4k)
    if (model.context_length < 4000) return false;

    // Curated models always pass
    if (CURATED_MODEL_IDS.has(model.id)) return true;

    // For non-curated, prefer models that support tools (coding-friendly)
    if (model.supported_parameters?.includes("tools")) return true;

    // Allow models with large context even without tools
    if (model.context_length >= 32000) return true;

    return false;
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
