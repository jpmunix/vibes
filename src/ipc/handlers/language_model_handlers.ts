import { createTypedHandler } from "./base";
import { languageModelContracts } from "../types/language-model";
import log from "electron-log";
import {
  getLanguageModelProviders,
  getLanguageModels,
  getLanguageModelsByProviders,
} from "../shared/language_model_helpers";
import { getRemoteDb } from "@/db/remote";
import * as remoteSchema from "@/db/remote-schema";
import { eq, and } from "drizzle-orm";
import { readSettings, writeSettings } from "@/main/settings";
import type { CustomProviderConfig } from "@/lib/schemas";

const logger = log.scope("language_model_handlers");

export function registerLanguageModelHandlers() {
  createTypedHandler(languageModelContracts.getProviders, async (_event, _input, context) => {
    return getLanguageModelProviders(context.userId);
  });

  // Custom provider CRUD — manages settings.customProviders[]
  createTypedHandler(languageModelContracts.createCustomProvider, async (_event, params) => {
    const settings = readSettings();
    const existing = settings.customProviders ?? [];

    // Check for duplicate ID
    if (existing.some(p => p.id === params.id)) {
      throw new Error(`Provider with ID "${params.id}" already exists`);
    }

    const newProvider: CustomProviderConfig = {
      id: params.id,
      name: params.name,
      apiBaseUrl: params.apiBaseUrl,
      modelsSource: "openai-compatible",
    };

    writeSettings({
      customProviders: [...existing, newProvider],
    });

    logger.info(`[CustomProvider] Created: ${params.id} (${params.name})`);

    return {
      id: params.id,
      name: params.name,
      apiBaseUrl: params.apiBaseUrl,
      type: "custom" as const,
    };
  });

  createTypedHandler(languageModelContracts.editCustomProvider, async (_event, params) => {
    const settings = readSettings();
    const existing = settings.customProviders ?? [];
    const idx = existing.findIndex(p => p.id === params.id);

    if (idx === -1) {
      throw new Error(`Provider "${params.id}" not found`);
    }

    const updated = [...existing];
    updated[idx] = {
      ...updated[idx],
      name: params.name,
      apiBaseUrl: params.apiBaseUrl,
    };

    writeSettings({ customProviders: updated });
    logger.info(`[CustomProvider] Updated: ${params.id}`);

    return {
      id: params.id,
      name: params.name,
      apiBaseUrl: params.apiBaseUrl,
      type: "custom" as const,
    };
  });

  createTypedHandler(languageModelContracts.deleteCustomProvider, async (_event, params) => {
    const settings = readSettings();
    const existing = settings.customProviders ?? [];
    const filtered = existing.filter(p => p.id !== params.providerId);

    const updates: Record<string, any> = { customProviders: filtered };

    // If deleting the active provider, fall back to openrouter
    if (settings.activeProviderId === params.providerId) {
      updates.activeProviderId = undefined;
    }

    // Clean up provider model config snapshot
    if (settings.providerModelConfigs?.[params.providerId]) {
      const configs = { ...settings.providerModelConfigs };
      delete configs[params.providerId];
      updates.providerModelConfigs = configs;
    }

    writeSettings(updates);
    logger.info(`[CustomProvider] Deleted: ${params.providerId}`);
  });

  // ── Custom Model CRUD (reactivated for presets / arbitrary model IDs) ──

  createTypedHandler(languageModelContracts.createCustomModel, async (_event, params, context) => {
    if (!params?.apiName || !params?.displayName) {
      throw new Error("apiName and displayName are required");
    }
    const db = getRemoteDb();
    const now = new Date();

    // Upsert: if a model with same apiName + userId exists, update it
    const existing = await db.select().from(remoteSchema.languageModels).where(
      and(
        eq(remoteSchema.languageModels.userId, context.userId),
        eq(remoteSchema.languageModels.apiName, params.apiName),
      )
    );

    if (existing.length > 0) {
      await db.update(remoteSchema.languageModels)
        .set({
          displayName: params.displayName,
          description: params.description ?? null,
          maxOutputTokens: params.maxOutputTokens ?? null,
          contextWindow: params.contextWindow ?? null,
          builtinProviderId: params.providerId,
          updatedAt: now,
        })
        .where(eq(remoteSchema.languageModels.id, existing[0].id));
      logger.info(`[CustomModel] Updated: ${params.apiName} → ${params.displayName}`);
    } else {
      await db.insert(remoteSchema.languageModels).values({
        userId: context.userId,
        displayName: params.displayName,
        apiName: params.apiName,
        builtinProviderId: params.providerId,
        description: params.description ?? null,
        maxOutputTokens: params.maxOutputTokens ?? null,
        contextWindow: params.contextWindow ?? null,
        createdAt: now,
        updatedAt: now,
      });
      logger.info(`[CustomModel] Created: ${params.apiName} → ${params.displayName}`);
    }
  });

  createTypedHandler(languageModelContracts.deleteCustomModel, async (_event, modelId, context) => {
    if (!modelId) throw new Error("modelId is required");
    const db = getRemoteDb();
    // modelId is a string — treat as apiName for backwards compat
    await db.delete(remoteSchema.languageModels).where(
      and(
        eq(remoteSchema.languageModels.userId, context.userId),
        eq(remoteSchema.languageModels.apiName, modelId),
      )
    );
    logger.info(`[CustomModel] Deleted by apiName: ${modelId}`);
  });

  createTypedHandler(languageModelContracts.deleteModel, async (_event, params, context) => {
    if (!params?.modelApiName) throw new Error("modelApiName is required");
    const db = getRemoteDb();
    await db.delete(remoteSchema.languageModels).where(
      and(
        eq(remoteSchema.languageModels.userId, context.userId),
        eq(remoteSchema.languageModels.apiName, params.modelApiName),
      )
    );
    logger.info(`[CustomModel] Deleted: ${params.modelApiName}`);
  });

  createTypedHandler(languageModelContracts.getModels, async (_event, params, context) => {
      if (!params || typeof params.providerId !== "string") {
        throw new Error("Invalid parameters: providerId (string) is required.");
      }
      const providers = await getLanguageModelProviders(context.userId);
      const provider = providers.find((p) => p.id === params.providerId);
      if (!provider) {
        throw new Error(`Provider with ID "${params.providerId}" not found`);
      }
      if (provider.type === "local") {
        throw new Error("Local models cannot be fetched");
      }
      return getLanguageModels({ providerId: params.providerId, userId: context.userId });
  });

  createTypedHandler(languageModelContracts.getModelsByProviders, async (_event, _input, context) => {
    return getLanguageModelsByProviders(context.userId);
  });

  createTypedHandler(languageModelContracts.refreshOpenRouterModels, async () => {
      logger.info("Manual refresh of OpenRouter models requested");
      const { clearOpenRouterModelsCache, fetchOpenRouterModels } = await import("../utils/openrouter_models_service");
      clearOpenRouterModelsCache();
      await fetchOpenRouterModels();
    },
  );

  createTypedHandler(languageModelContracts.refreshCustomProviderModels, async (_event, params) => {
    if (!params?.providerId) throw new Error("providerId is required");
    logger.info(`Manual refresh of custom provider models: ${params.providerId}`);
    const settings = readSettings();
    const config = settings.customProviders?.find(p => p.id === params.providerId);
    if (!config) throw new Error(`Custom provider "${params.providerId}" not found`);

    const { clearCompatibleModelsCache, fetchCompatibleModels } = await import("../utils/openai_compatible_models_service");
    clearCompatibleModelsCache(params.providerId);
    await fetchCompatibleModels(params.providerId, config.apiBaseUrl, config.apiKey?.value);
  });
}
