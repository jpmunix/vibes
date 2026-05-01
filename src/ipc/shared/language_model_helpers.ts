import { getRemoteDb } from "@/db/remote";
import * as remoteSchema from "@/db/remote-schema";
import type { LanguageModelProvider, LanguageModel } from "@/ipc/types";
import { eq, and } from "drizzle-orm";
import {
  LOCAL_PROVIDERS,
  CLOUD_PROVIDERS,
  MODEL_OPTIONS,
  PROVIDER_TO_ENV_VAR,
} from "./language_model_constants";
import { fetchOpenRouterModels } from "../utils/openrouter_models_service";
/**
 * Fetches language model providers from both the database (custom) and hardcoded constants (cloud),
 * merging them with custom providers taking precedence.
 * @returns A promise that resolves to an array of LanguageModelProvider objects.
 */
export async function getLanguageModelProviders(userId?: string): Promise<
  LanguageModelProvider[]
> {
  const customProvidersMap = new Map<string, LanguageModelProvider>();

  if (userId) {
    const db = getRemoteDb();
    // Fetch custom providers from the database
    const customProvidersDb = await db
      .select()
      .from(remoteSchema.languageModelProviders)
      .where(eq(remoteSchema.languageModelProviders.userId, userId));
    for (const cp of customProvidersDb) {
      customProvidersMap.set(cp.id, {
        id: cp.id,
        name: cp.name,
        apiBaseUrl: cp.apiBaseUrl,
        envVarName: cp.envVarName ?? undefined,
        type: "custom",
      });
    }
  }

  // Get hardcoded cloud providers
  const hardcodedProviders: LanguageModelProvider[] = [];
  for (const providerKey in CLOUD_PROVIDERS) {
    if (Object.prototype.hasOwnProperty.call(CLOUD_PROVIDERS, providerKey)) {
      // Ensure providerKey is a key of PROVIDERS
      const key = providerKey as keyof typeof CLOUD_PROVIDERS;
      const providerDetails = CLOUD_PROVIDERS[key];
      if (providerDetails) {
        // Ensure providerDetails is not undefined
        hardcodedProviders.push({
          id: key,
          name: providerDetails.displayName,
          hasFreeTier: providerDetails.hasFreeTier,
          websiteUrl: providerDetails.websiteUrl,
          gatewayPrefix: providerDetails.gatewayPrefix,
          secondary: providerDetails.secondary,
          envVarName: PROVIDER_TO_ENV_VAR[key] ?? undefined,
          type: "cloud",
          // apiBaseUrl is not directly in PROVIDERS
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

  return [...hardcodedProviders, ...customProvidersMap.values()];
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

  // Get custom models from DB for all provider types
  let customModels: LanguageModel[] = [];

  try {
    if (userId) {
      const db = getRemoteDb();
      const customModelsDb = await db
        .select({
          id: remoteSchema.languageModels.id,
          displayName: remoteSchema.languageModels.displayName,
          apiName: remoteSchema.languageModels.apiName,
          description: remoteSchema.languageModels.description,
          maxOutputTokens: remoteSchema.languageModels.maxOutputTokens,
          contextWindow: remoteSchema.languageModels.contextWindow,
        })
        .from(remoteSchema.languageModels)
        .where(
          and(
            isCustomProvider({ providerId })
              ? eq(remoteSchema.languageModels.customProviderId, providerId)
              : eq(remoteSchema.languageModels.builtinProviderId, providerId),
            eq(remoteSchema.languageModels.userId, userId),
          ),
        );

      customModels = customModelsDb.map((model) => ({
        id: "cm_" + model.id.toString(), // Add prefix to differentiate from hardcoded
        name: model.displayName || model.apiName,
        displayName: model.displayName || model.apiName,
        apiName: model.apiName,
        description: model.description || "",
        contextWindow: Number(model.contextWindow) || undefined,
        maxOutputTokens: Number(model.maxOutputTokens) || undefined,
        isCustom: true,
      } as any));
    }
  } catch (error) {
    console.error(
      `Error fetching custom models for provider "${providerId}" from DB:`,
      error,
    );
    // Continue with empty custom models array
  }

  // If it's a cloud provider, also get the hardcoded models
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
    // Note: Some cloud providers (like openai, anthropic, google) don't have
    // hardcoded models in MODEL_OPTIONS and rely only on custom models.
    // This is expected behavior and not a warning condition.
  }

  return [...hardcodedModels, ...customModels];
}

/**
 * Fetches all language models grouped by their provider IDs.
 * @returns A promise that resolves to a Record mapping provider IDs to arrays of LanguageModel objects.
 */
export async function getLanguageModelsByProviders(userId?: string): Promise<
  Record<string, LanguageModel[]>
> {
  const providers = await getLanguageModelProviders(userId);

  // Fetch all models concurrently, including auto-router
  const modelPromises = providers
    .filter((p) => p.type !== "local")
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

export const CUSTOM_PROVIDER_PREFIX = "custom::";
