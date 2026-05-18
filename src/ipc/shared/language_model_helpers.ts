import type { LanguageModelProvider, LanguageModel } from "@/ipc/types";
import {
  LOCAL_PROVIDERS,
  CLOUD_PROVIDERS,
  MODEL_OPTIONS,
  PROVIDER_TO_ENV_VAR,
  CUSTOM_PROVIDER_PREFIX,
} from "./language_model_constants";
import { fetchOpenRouterModels } from "../utils/openrouter_models_service";
import { fetchCompatibleModels } from "../utils/openai_compatible_models_service";
import { getRemoteDb } from "@/db/remote";
import * as remoteSchema from "@/db/remote-schema";
import { eq } from "drizzle-orm";
import log from "electron-log";
import { readSettings } from "@/main/settings";

const logger = log.scope("language_model_helpers");

/**
 * Fetches language model providers from both the database (custom) and hardcoded constants (cloud),
 * merging them with custom providers taking precedence.
 * @returns A promise that resolves to an array of LanguageModelProvider objects.
 */
export async function getLanguageModelProviders(_userId?: string): Promise<
  LanguageModelProvider[]
> {
  // Get hardcoded cloud providers
  const hardcodedProviders: LanguageModelProvider[] = [];
  for (const providerKey in CLOUD_PROVIDERS) {
    if (Object.prototype.hasOwnProperty.call(CLOUD_PROVIDERS, providerKey)) {
      const key = providerKey as keyof typeof CLOUD_PROVIDERS;
      const providerDetails = CLOUD_PROVIDERS[key];
      if (providerDetails) {
        hardcodedProviders.push({
          id: key,
          name: providerDetails.displayName,
          hasFreeTier: providerDetails.hasFreeTier,
          websiteUrl: providerDetails.websiteUrl,
          gatewayPrefix: providerDetails.gatewayPrefix,
          secondary: providerDetails.secondary,
          envVarName: PROVIDER_TO_ENV_VAR[key] ?? undefined,
          type: "cloud",
        });
      }
    }
  }

  for (const providerKey in LOCAL_PROVIDERS) {
    if (Object.prototype.hasOwnProperty.call(LOCAL_PROVIDERS, providerKey)) {
      const key = providerKey as keyof typeof LOCAL_PROVIDERS;
      const providerDetails = LOCAL_PROVIDERS[key];
      hardcodedProviders.push({
        id: key,
        name: providerDetails.displayName,
        hasFreeTier: providerDetails.hasFreeTier,
        type: "local",
      });
    }
  }

  // ── Custom providers from user settings ──
  const settings = readSettings();
  const customProviders: LanguageModelProvider[] = (settings.customProviders ?? []).map(cp => ({
    id: cp.id,
    name: cp.name,
    apiBaseUrl: cp.apiBaseUrl,
    type: "custom" as const,
    isCustom: true,
  }));

  return [...hardcodedProviders, ...customProviders];
}

/**
 * Fetch user's custom models from BunnyDB for a given provider.
 */
async function getCustomModels(providerId: string, userId?: string): Promise<LanguageModel[]> {
  if (!userId) return [];
  try {
    const db = getRemoteDb();
    const rows = await db.select().from(remoteSchema.languageModels).where(
      eq(remoteSchema.languageModels.userId, userId),
    );
    // Filter to the requested provider (or return all if provider matches)
    return rows
      .filter(r => (r.builtinProviderId || "openrouter") === providerId)
      .map(r => ({
        id: r.id,
        apiName: r.apiName,
        displayName: r.displayName,
        description: r.description ?? undefined,
        maxOutputTokens: r.maxOutputTokens ?? undefined,
        contextWindow: r.contextWindow ?? undefined,
        type: "custom" as const,
      }));
  } catch (err: any) {
    logger.warn(`Failed to fetch custom models: ${err.message}`);
    return [];
  }
}

/**
 * Fetches language models for a specific provider.
 * @param obj An object containing the providerId.
 * @returns A promise that resolves to an array of LanguageModel objects.
 */
export async function getLanguageModels({
  providerId,
  userId,
}: {
  providerId: string;
  userId?: string;
}): Promise<LanguageModel[]> {
  const allProviders = await getLanguageModelProviders(userId);
  const provider = allProviders.find((p) => p.id === providerId);

  if (!provider) {
    console.warn(`Provider with ID "${providerId}" not found.`);
    return [];
  }

  // Get models for cloud providers
  let hardcodedModels: LanguageModel[] = [];
  if (provider.type === "cloud") {
    if (providerId === "openrouter") {
      // Dynamically fetch from OpenRouter API (cached)
      const dynamicModels = await fetchOpenRouterModels();
      if (dynamicModels.length > 0) {
        hardcodedModels = dynamicModels.map((model) => ({
          ...model,
          apiName: model.name,
          type: "cloud" as const,
        }));
      } else {
        // Fallback to hardcoded models if API fetch fails
        const fallback = MODEL_OPTIONS[providerId] || [];
        hardcodedModels = fallback.map((model) => ({
          ...model,
          apiName: model.name,
          type: "cloud" as const,
        }));
      }
    } else if (providerId in MODEL_OPTIONS) {
      const models = MODEL_OPTIONS[providerId] || [];
      hardcodedModels = models.map((model) => ({
        ...model,
        apiName: model.name,
        type: "cloud",
      }));
    }
  } else if (provider.type === "custom") {
    // Fetch from generic OpenAI-compatible endpoint
    const settings = readSettings();
    const customConfig = settings.customProviders?.find(p => p.id === providerId);
    if (customConfig && customConfig.modelsSource !== "manual") {
      try {
        const dynamicModels = await fetchCompatibleModels(
          providerId,
          customConfig.apiBaseUrl,
          customConfig.apiKey?.value,
        );
        hardcodedModels = dynamicModels.map((model) => ({
          ...model,
          apiName: model.name,
          type: "cloud" as const,
        }));
      } catch (err: any) {
        logger.warn(`Failed to fetch models for custom provider ${providerId}: ${err.message}`);
      }
    }
  }

  // ── Merge custom models from BunnyDB ──
  // Custom models appear first, then cloud models.
  // If a custom model has the same apiName as a cloud model, the custom one wins
  // (allows overriding display name, context window, etc.)
  const customModels = await getCustomModels(providerId, userId);
  if (customModels.length > 0) {
    const customApiNames = new Set(customModels.map(m => m.apiName));
    // Remove cloud models that are overridden by custom ones
    hardcodedModels = hardcodedModels.filter(m => !customApiNames.has(m.apiName));
    // Prepend custom models
    hardcodedModels = [...customModels, ...hardcodedModels];
  }

  return hardcodedModels;
}

/**
 * Fetches all language models grouped by their provider IDs.
 * @returns A promise that resolves to a Record mapping provider IDs to arrays of LanguageModel objects.
 */
export async function getLanguageModelsByProviders(userId?: string): Promise<
  Record<string, LanguageModel[]>
> {
  const providers = await getLanguageModelProviders(userId);
  const settings = readSettings();
  const disabledProviders = settings.disabledProviders ?? [];

  // Fetch all models concurrently, including auto-router
  const modelPromises = providers
    .filter((p) => p.type !== "local" && !disabledProviders.includes(p.id))
    .map(async (provider) => {
      const models = await getLanguageModels({ providerId: provider.id, userId });
      return { providerId: provider.id, models };
    });

  // Wait for all requests to complete
  const results = await Promise.all(modelPromises);

  // Convert the array of results to a record
  const record: Record<string, LanguageModel[]> = {};
  for (const result of results) {
    record[result.providerId] = result.models;
  }

  return record;
}

export function isCustomProvider({ providerId }: { providerId: string }) {
  return providerId.startsWith(CUSTOM_PROVIDER_PREFIX);
}

// Re-export from constants for backward compatibility
export { CUSTOM_PROVIDER_PREFIX };
