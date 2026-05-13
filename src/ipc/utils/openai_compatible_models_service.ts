import log from "electron-log";
import { app } from "electron";
import * as path from "path";
import * as fs from "fs/promises";
import type { ModelOption } from "../shared/language_model_constants";

const logger = log.scope("openai-compatible-models");

// =============================================================================
// Types — supports both vanilla OpenAI and enriched proxy responses
// =============================================================================

/**
 * Union of all known fields across different proxy implementations.
 * Vanilla OpenAI only returns { id, object, created, owned_by }.
 * Enriched proxies (LiteLLM, OpenRouter-style) add pricing, context, tags, etc.
 */
interface RawModel {
    id: string;
    object?: string;
    created?: number;
    owned_by?: string;

    // ── Enriched fields (optional) ──────────────────────────
    description?: string;
    // Context window size (various naming conventions)
    context_size?: number;
    context_length?: number;
    context_window?: number;
    max_context_length?: number;
    // Max output tokens
    max_output_tokens?: number;
    max_completion_tokens?: number;
    // Modalities
    input_modalities?: string[];
    output_modalities?: string[];
    // Tags / capabilities
    tags?: string[];
    capabilities?: string[];
    // Pricing — multiple formats
    pricing?: {
        // OpenRouter-style
        prompt?: string | number;
        completion?: string | number;
        // Proxy-style (like the user's proxy)
        input_token?: number;
        output_token?: number;
        currency?: string;
    };
    // LiteLLM-style pricing
    input_cost_per_token?: number;
    output_cost_per_token?: number;
}

interface ModelsResponse {
    data: RawModel[];
    object?: string;
}

// =============================================================================
// File-based cache (1 day TTL, stored in userData, keyed by provider ID)
// =============================================================================

interface CachedModelsFile {
    models: ModelOption[];
    fetchedAt: number;
    cacheVersion: number;
}

const CACHE_VERSION = 2; // Bumped: richer transform
const CACHE_TTL_MS = 1 * 24 * 60 * 60 * 1000; // 1 day

// In-memory cache per provider
const memoryCache = new Map<string, CachedModelsFile>();

function getCacheFilePath(providerId: string): string {
    // Sanitize provider ID for filename (replace :: and special chars)
    const sanitized = providerId.replace(/[^a-zA-Z0-9_-]/g, "_");
    return path.join(app.getPath("userData"), `${sanitized}-models-cache.json`);
}

async function readCacheFromDisk(providerId: string): Promise<CachedModelsFile | null> {
    try {
        const data = await fs.readFile(getCacheFilePath(providerId), "utf-8");
        const parsed = JSON.parse(data) as CachedModelsFile;
        if (parsed?.models && Array.isArray(parsed.models) && parsed.fetchedAt) {
            return parsed;
        }
    } catch {
        // File doesn't exist or is corrupt — fine
    }
    return null;
}

async function writeCacheToDisk(providerId: string, cache: CachedModelsFile): Promise<void> {
    try {
        await fs.writeFile(getCacheFilePath(providerId), JSON.stringify(cache), "utf-8");
    } catch (err) {
        logger.warn(`Failed to write models cache for ${providerId}:`, err);
    }
}

function isCacheValid(cache: CachedModelsFile | null): boolean {
    if (!cache) return false;
    if (cache.cacheVersion !== CACHE_VERSION) return false;
    return Date.now() - cache.fetchedAt < CACHE_TTL_MS;
}

/**
 * Clear cached models for a specific custom provider.
 */
export function clearCompatibleModelsCache(providerId: string): void {
    memoryCache.delete(providerId);
    fs.unlink(getCacheFilePath(providerId)).catch(() => { });
}

// =============================================================================
// Smart model transform — auto-detects enriched fields
// =============================================================================

/**
 * Humanize a model ID into a readable display name.
 * Smarter than just replace-and-title-case:
 *  - Preserves version dots (claude-4.5 → Claude 4.5, not Claude 4 5)
 *  - Keeps well-known acronyms uppercase (GPT, GLM, etc.)
 *  - Strips provider prefixes (anthropic/claude-... → claude-...)
 */
function humanizeModelId(id: string): string {
    let name = id;

    // Strip provider prefix (e.g. "anthropic/claude-sonnet-4-5" → "claude-sonnet-4-5")
    const slashIdx = name.lastIndexOf("/");
    if (slashIdx !== -1) {
        name = name.substring(slashIdx + 1);
    }

    // Replace hyphens/underscores with spaces, BUT preserve number sequences
    // "claude-4-5-sonnet" → "claude 4.5 sonnet" (detect adjacent numbers)
    name = name.replace(/[-_]/g, " ");

    // Merge adjacent single-digit numbers into version format: "4 5" → "4.5"
    name = name.replace(/(\d)\s+(\d)/g, "$1.$2");

    // Title-case each word, with acronym awareness
    const ACRONYMS = new Set([
        "gpt", "glm", "llm", "ai", "api", "llama", "yi", "qwen",
        "rwkv", "xl", "xxl", "xs", "fp16", "fp8", "int8", "int4",
    ]);
    const UPPERCASE_ALWAYS = new Set([
        "gpt", "glm", "llm", "ai", "api", "rwkv",
    ]);

    name = name
        .split(" ")
        .map((word) => {
            const lower = word.toLowerCase();
            if (UPPERCASE_ALWAYS.has(lower)) return word.toUpperCase();
            // Normal title-case
            return word.charAt(0).toUpperCase() + word.slice(1);
        })
        .join(" ");

    return name;
}

/**
 * Extract pricing info from various formats, normalizing to per-million-token strings.
 */
function extractPricing(model: RawModel): {
    pricingInput?: string;
    pricingOutput?: string;
    dollarSigns?: number;
} {
    let inputCost: number | null = null;
    let outputCost: number | null = null;
    let currency = "USD";

    // Format 1: model.pricing object
    if (model.pricing) {
        const p = model.pricing;
        currency = p.currency || "USD";

        // OpenRouter-style: pricing.prompt / pricing.completion (per-token string or number)
        if (p.prompt !== undefined && p.completion !== undefined) {
            const promptPerToken = typeof p.prompt === "string" ? parseFloat(p.prompt) : p.prompt;
            const completionPerToken = typeof p.completion === "string" ? parseFloat(p.completion) : p.completion;
            if (!isNaN(promptPerToken)) inputCost = promptPerToken * 1_000_000;
            if (!isNaN(completionPerToken)) outputCost = completionPerToken * 1_000_000;
        }

        // Proxy-style: pricing.input_token / pricing.output_token (per-million already)
        if (p.input_token !== undefined && p.output_token !== undefined) {
            inputCost = p.input_token;
            outputCost = p.output_token;
        }
    }

    // Format 2: LiteLLM-style top-level fields (per-token)
    if (inputCost === null && model.input_cost_per_token !== undefined) {
        inputCost = model.input_cost_per_token * 1_000_000;
    }
    if (outputCost === null && model.output_cost_per_token !== undefined) {
        outputCost = model.output_cost_per_token * 1_000_000;
    }

    if (inputCost === null && outputCost === null) return {};

    // Currency symbol
    const sym = currency === "EUR" ? "€" : "$";

    // Dollar signs (1-4 scale based on output cost)
    let dollarSigns: number | undefined;
    if (outputCost !== null) {
        if (outputCost <= 0) dollarSigns = 0;
        else if (outputCost <= 1) dollarSigns = 1;
        else if (outputCost <= 5) dollarSigns = 2;
        else if (outputCost <= 15) dollarSigns = 3;
        else dollarSigns = 4;
    }

    return {
        pricingInput: inputCost !== null ? `${sym}${inputCost.toFixed(2)}/M` : undefined,
        pricingOutput: outputCost !== null ? `${sym}${outputCost.toFixed(2)}/M` : undefined,
        dollarSigns,
    };
}

/**
 * Extract context window from various field names.
 */
function extractContextWindow(model: RawModel): number | undefined {
    return model.context_size
        || model.context_length
        || model.context_window
        || model.max_context_length
        || undefined;
}

/**
 * Extract max output tokens from various field names.
 */
function extractMaxOutputTokens(model: RawModel): number | undefined {
    return model.max_output_tokens
        || model.max_completion_tokens
        || undefined;
}

/**
 * Derive a tag from the model's tags/capabilities list.
 * Maps known tags to user-friendly labels.
 */
function deriveTag(model: RawModel): { tag?: string; tagColor?: string } {
    const tags = model.tags || model.capabilities || [];
    const tagSet = new Set(tags.map(t => t.toLowerCase()));

    // Priority order: most distinctive tag first
    if (tagSet.has("reasoning")) return { tag: "Reasoning", tagColor: "purple" };
    if (tagSet.has("code")) return { tag: "Code", tagColor: "blue" };
    if (tagSet.has("vision") || tagSet.has("image")) return { tag: "Vision", tagColor: "green" };
    if (tagSet.has("tools") || tagSet.has("function_calling")) return { tag: "Tools", tagColor: "orange" };
    if (tagSet.has("instruct")) return { tag: "Instruct", tagColor: "teal" };

    return {};
}

/**
 * Transform a raw model response into a rich ModelOption.
 * Auto-detects whether the response contains enriched fields and maps them.
 */
function transformModel(model: RawModel): ModelOption {
    const displayName = humanizeModelId(model.id);
    const pricing = extractPricing(model);
    const tagInfo = deriveTag(model);
    const contextWindow = extractContextWindow(model);
    const maxOutputTokens = extractMaxOutputTokens(model);

    // Description: prefer the model's own description, fall back to owned_by
    let description = "";
    if (model.description) {
        // Truncate long descriptions to keep the UI clean
        description = model.description.length > 120
            ? model.description.substring(0, 117) + "..."
            : model.description;
    } else if (model.owned_by) {
        description = `by ${model.owned_by}`;
    }

    return {
        name: model.id,
        displayName,
        description,
        temperature: 0,
        ...(pricing.dollarSigns !== undefined ? { dollarSigns: pricing.dollarSigns } : {}),
        ...(pricing.pricingInput ? { pricingInput: pricing.pricingInput } : {}),
        ...(pricing.pricingOutput ? { pricingOutput: pricing.pricingOutput } : {}),
        ...(contextWindow ? { contextWindow } : {}),
        ...(maxOutputTokens ? { maxOutputTokens } : {}),
        ...(tagInfo.tag ? { tag: tagInfo.tag, tagColor: tagInfo.tagColor } : {}),
        ...(model.input_modalities ? { inputModalities: model.input_modalities } : {}),
        ...(model.output_modalities ? { outputModalities: model.output_modalities } : {}),
    };
}

// =============================================================================
// Main API fetch function
// =============================================================================

/**
 * Fetches models from any OpenAI-compatible /v1/models endpoint.
 * Uses file-based + in-memory cache keyed by provider ID (1-day TTL).
 *
 * Auto-detects enriched response formats (pricing, context_size, tags, etc.)
 * and maps them to rich ModelOption objects for full UI integration.
 *
 * @param providerId  Unique provider identifier (e.g. "custom::litellm-proxy")
 * @param baseUrl     Base URL of the API (e.g. "https://my-proxy.example.com/v1")
 * @param apiKey      Optional API key for authentication
 */
export async function fetchCompatibleModels(
    providerId: string,
    baseUrl: string,
    apiKey?: string,
): Promise<ModelOption[]> {
    // 1. Check in-memory cache
    const mem = memoryCache.get(providerId);
    if (isCacheValid(mem ?? null)) {
        return mem!.models;
    }

    // 2. Check disk cache
    const diskCache = await readCacheFromDisk(providerId);
    if (isCacheValid(diskCache)) {
        memoryCache.set(providerId, diskCache!);
        logger.info(`Loaded ${diskCache!.models.length} cached models for ${providerId} from disk`);
        return diskCache!.models;
    }

    // 3. Stale disk cache? Return it and refresh in background
    if (diskCache && diskCache.models.length > 0) {
        memoryCache.set(providerId, diskCache);
        logger.info(`Returning stale cache (${diskCache.models.length} models) for ${providerId}, refreshing...`);
        refreshFromAPI(providerId, baseUrl, apiKey).catch((err) =>
            logger.error(`Background refresh failed for ${providerId}:`, err),
        );
        return diskCache.models;
    }

    // 4. No cache — fetch synchronously (first run)
    return refreshFromAPI(providerId, baseUrl, apiKey);
}

async function refreshFromAPI(
    providerId: string,
    baseUrl: string,
    apiKey?: string,
): Promise<ModelOption[]> {
    try {
        // Normalize URL: ensure no trailing slash, then append /models
        const normalizedBase = baseUrl.replace(/\/+$/, "");
        const modelsUrl = `${normalizedBase}/models`;

        logger.info(`Fetching models from ${modelsUrl} for provider ${providerId}...`);

        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        };
        if (apiKey) {
            headers["Authorization"] = `Bearer ${apiKey}`;
        }

        const response = await fetch(modelsUrl, {
            method: "GET",
            headers,
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status} ${response.statusText}`);
        }

        const data = (await response.json()) as ModelsResponse;

        if (!data?.data || !Array.isArray(data.data)) {
            throw new Error("Invalid response format from /models endpoint");
        }

        // Log what enriched fields we detected
        const sample = data.data[0];
        const enrichedFields: string[] = [];
        if (sample?.pricing) enrichedFields.push("pricing");
        if (sample?.context_size || sample?.context_length) enrichedFields.push("context");
        if (sample?.tags) enrichedFields.push("tags");
        if (sample?.description) enrichedFields.push("description");
        if (enrichedFields.length > 0) {
            logger.info(`Provider ${providerId} returns enriched fields: [${enrichedFields.join(", ")}]`);
        }

        logger.info(`Received ${data.data.length} models from ${providerId}`);

        // Transform all models — no filtering for custom providers (they usually
        // have a curated/small set that's entirely relevant)
        const transformed = data.data.map(transformModel);

        // Sort alphabetically by displayName
        transformed.sort((a, b) => a.displayName.localeCompare(b.displayName));

        // Save to cache
        const cache: CachedModelsFile = {
            models: transformed,
            fetchedAt: Date.now(),
            cacheVersion: CACHE_VERSION,
        };
        memoryCache.set(providerId, cache);
        await writeCacheToDisk(providerId, cache);

        return transformed;
    } catch (error) {
        logger.error(`Failed to fetch models for ${providerId}:`, error);
        // Return whatever we have
        const fallback = memoryCache.get(providerId);
        if (fallback) return fallback.models;
        return [];
    }
}
