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

const logger = log.scope("language_model_handlers");

export function registerLanguageModelHandlers() {
  createTypedHandler(languageModelContracts.getProviders, async (_event, _input, context) => {
    return getLanguageModelProviders(context.userId);
  });

  // Custom provider CRUD — disabled (not needed, we use openrouter for everything)
  createTypedHandler(languageModelContracts.createCustomProvider, async () => {
    throw new Error("Custom providers are no longer supported");
  });

  createTypedHandler(languageModelContracts.editCustomProvider, async () => {
    throw new Error("Custom providers are no longer supported");
  });

  createTypedHandler(languageModelContracts.deleteCustomProvider, async () => {
    throw new Error("Custom providers are no longer supported");
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
}
