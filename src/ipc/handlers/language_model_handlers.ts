import { createTypedHandler } from "./base";
import type { HandlerContext } from "./base";
import { languageModelContracts } from "../types/language-model";
import log from "electron-log";
import {
  CUSTOM_PROVIDER_PREFIX,
  getLanguageModelProviders,
  getLanguageModels,
  getLanguageModelsByProviders,
} from "../shared/language_model_helpers";
import { getRemoteDb } from "@/db/remote";
import * as remoteSchema from "@/db/remote-schema";
import { and, eq } from "drizzle-orm";

const logger = log.scope("language_model_handlers");

export function registerLanguageModelHandlers() {
  createTypedHandler(languageModelContracts.getProviders, async (_event, _input, context) => {
    return getLanguageModelProviders(context.userId);
  });

  createTypedHandler(languageModelContracts.createCustomProvider, async (_event, params, context) => {
      if (!context.userId) throw new Error("Unauthorized");
      const db = getRemoteDb();
      const { id, name, apiBaseUrl, envVarName } = params;

      // Validation
      if (!id) {
        throw new Error("Provider ID is required");
      }

      if (!name) {
        throw new Error("Provider name is required");
      }

      if (!apiBaseUrl) {
        throw new Error("API base URL is required");
      }

      // Check if a provider with this ID already exists
      const existingProvider = await db
        .select()
        .from(remoteSchema.languageModelProviders)
        .where(and(eq(remoteSchema.languageModelProviders.id, CUSTOM_PROVIDER_PREFIX + id), eq(remoteSchema.languageModelProviders.userId, context.userId!)))
        .get();

      if (existingProvider) {
        throw new Error(`A provider with ID "${id}" already exists`);
      }

      // Insert the new provider
      await db.insert(remoteSchema.languageModelProviders).values({
        userId: context.userId,
        // Make sure we will never have accidental collisions with builtin providers
        id: CUSTOM_PROVIDER_PREFIX + id,
        name,
        apiBaseUrl,
        envVarName: envVarName || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Return the newly created provider
      return {
        id,
        name,
        apiBaseUrl,
        envVarName,
        type: "custom" as const,
      };
  });

  createTypedHandler(languageModelContracts.createCustomModel, async (_event, params, context) => {
      if (!context.userId) throw new Error("Unauthorized");
      const db = getRemoteDb();
      const {
        apiName,
        displayName,
        providerId,
        description,
        maxOutputTokens,
        contextWindow,
      } = params;

      // Validation
      if (!apiName) {
        throw new Error("Model API name is required");
      }
      if (!displayName) {
        throw new Error("Model display name is required");
      }
      if (!providerId) {
        throw new Error("Provider ID is required");
      }

      // Check if provider exists
      const providers = await getLanguageModelProviders(context.userId);
      const provider = providers.find((p) => p.id === providerId);
      if (!provider) {
        throw new Error(`Provider with ID "${providerId}" not found`);
      }

      // Insert the new model
      await db.insert(remoteSchema.languageModels).values({
        userId: context.userId,
        displayName,
        apiName,
        builtinProviderId: provider.type === "cloud" ? providerId : undefined,
        customProviderId: provider.type === "custom" ? providerId : undefined,
        description: description || null,
        maxOutputTokens: maxOutputTokens || null,
        contextWindow: contextWindow || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
  });

  createTypedHandler(languageModelContracts.editCustomProvider, async (_event, params, context) => {
      if (!context.userId) throw new Error("Unauthorized");
      const db = getRemoteDb();
      const { id, name, apiBaseUrl, envVarName } = params;

      if (!id) {
        throw new Error("Provider ID is required");
      }
      if (!name) {
        throw new Error("Provider name is required");
      }
      if (!apiBaseUrl) {
        throw new Error("API base URL is required");
      }

      // Check if the provider being edited exists
      const existingProvider = await db
        .select()
        .from(remoteSchema.languageModelProviders)
        .where(and(eq(remoteSchema.languageModelProviders.id, CUSTOM_PROVIDER_PREFIX + id), eq(remoteSchema.languageModelProviders.userId, context.userId!)))
        .get();

      if (!existingProvider) {
        throw new Error(`Provider with ID "${id}" not found`);
      }

      // Use transaction to ensure atomicity
      const result = await db.transaction(async (tx) => {
        // Update the provider
        const updateResult = await tx
          .update(remoteSchema.languageModelProviders)
          .set({
            name,
            apiBaseUrl,
            envVarName: envVarName || null,
            updatedAt: new Date(),
          })
          .where(and(
            eq(remoteSchema.languageModelProviders.id, CUSTOM_PROVIDER_PREFIX + id),
            eq(remoteSchema.languageModelProviders.userId, context.userId!),
          ));

        return {
          id,
          name,
          apiBaseUrl,
          envVarName,
          type: "custom" as const,
        };
      });
      logger.info(`Successfully updated provider`);
      return result;
  });

  createTypedHandler(languageModelContracts.deleteCustomModel, async (_event, apiName, context) => {
      if (!context.userId) throw new Error("Unauthorized");
      const db = getRemoteDb();

      // Validation
      if (!apiName) {
        throw new Error("Model API name (modelId) is required");
      }

      logger.info(
        `Handling delete-custom-language-model for apiName: ${apiName}`,
      );

      const existingModel = await db
        .select()
        .from(remoteSchema.languageModels)
        .where(and(eq(remoteSchema.languageModels.apiName, apiName), eq(remoteSchema.languageModels.userId, context.userId!)))
        .get();

      if (!existingModel) {
        throw new Error(
          `A model with API name (modelId) "${apiName}" was not found`,
        );
      }

      await db
        .delete(remoteSchema.languageModels)
        .where(and(eq(remoteSchema.languageModels.apiName, apiName), eq(remoteSchema.languageModels.userId, context.userId!)));
  });

  createTypedHandler(languageModelContracts.deleteModel, async (_event, params, context) => {
      if (!context.userId) throw new Error("Unauthorized");
      const db = getRemoteDb();
      const { providerId, modelApiName } = params;
      logger.info(
        `Handling delete-custom-model for ${providerId} / ${modelApiName}`,
      );
      if (!providerId || !modelApiName) {
        throw new Error("Provider ID and Model API Name are required.");
      }
      logger.info(
        `Attempting to delete custom model ${modelApiName} for provider ${providerId}`,
      );

      const providers = await getLanguageModelProviders(context.userId);
      const provider = providers.find((p) => p.id === providerId);
      if (!provider) {
        throw new Error(`Provider with ID "${providerId}" not found`);
      }
      if (provider.type === "local") {
        throw new Error("Local models cannot be deleted");
      }
      const result = await db
        .delete(remoteSchema.languageModels)
        .where(
          and(
            provider.type === "cloud"
              ? eq(remoteSchema.languageModels.builtinProviderId, providerId)
              : eq(remoteSchema.languageModels.customProviderId, providerId),
            eq(remoteSchema.languageModels.apiName, modelApiName),
            eq(remoteSchema.languageModels.userId, context.userId!),
          ),
        );

      logger.info(`Successfully deleted custom model(s) with apiName=${modelApiName} for provider=${providerId}`);
  });

  createTypedHandler(languageModelContracts.deleteCustomProvider, async (_event, params, context) => {
      if (!context.userId) throw new Error("Unauthorized");
      const db = getRemoteDb();
      const { providerId } = params;

      // Validation
      if (!providerId) {
        throw new Error("Provider ID is required");
      }

      logger.info(
        `Handling delete-custom-language-model-provider for providerId: ${providerId}`,
      );

      // Check if the provider exists before attempting deletion
      const existingProvider = await db
        .select({ id: remoteSchema.languageModelProviders.id })
        .from(remoteSchema.languageModelProviders)
        .where(and(eq(remoteSchema.languageModelProviders.id, providerId), eq(remoteSchema.languageModelProviders.userId, context.userId!)))
        .get();

      if (!existingProvider) {
        logger.warn(
          `Provider with ID "${providerId}" not found. It might have been deleted already.`,
        );
        return;
      }

      // Use a transaction
      await db.transaction(async (tx) => {
        // 1. Delete associated models
        await tx
          .delete(remoteSchema.languageModels)
          .where(and(eq(remoteSchema.languageModels.customProviderId, providerId), eq(remoteSchema.languageModels.userId, context.userId!)));

        // 2. Delete the provider
        await tx
          .delete(remoteSchema.languageModelProviders)
          .where(and(eq(remoteSchema.languageModelProviders.id, providerId), eq(remoteSchema.languageModelProviders.userId, context.userId!)));
      });
      logger.info(`Successfully deleted provider with ID "${providerId}".`);
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
