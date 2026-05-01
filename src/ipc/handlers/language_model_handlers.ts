import { createTypedHandler } from "./base";
import { languageModelContracts } from "../types/language-model";
import log from "electron-log";
import {
  getLanguageModelProviders,
  getLanguageModels,
  getLanguageModelsByProviders,
} from "../shared/language_model_helpers";

const logger = log.scope("language_model_handlers");

export function registerLanguageModelHandlers() {
  createTypedHandler(languageModelContracts.getProviders, async (_event, _input, context) => {
    return getLanguageModelProviders(context.userId);
  });

  // Custom provider/model CRUD — disabled (DB tables removed)
  createTypedHandler(languageModelContracts.createCustomProvider, async () => {
    throw new Error("Custom providers are no longer supported");
  });

  createTypedHandler(languageModelContracts.createCustomModel, async () => {
    throw new Error("Custom models are no longer supported");
  });

  createTypedHandler(languageModelContracts.editCustomProvider, async () => {
    throw new Error("Custom providers are no longer supported");
  });

  createTypedHandler(languageModelContracts.deleteCustomModel, async () => {
    throw new Error("Custom models are no longer supported");
  });

  createTypedHandler(languageModelContracts.deleteModel, async () => {
    throw new Error("Custom models are no longer supported");
  });

  createTypedHandler(languageModelContracts.deleteCustomProvider, async () => {
    throw new Error("Custom providers are no longer supported");
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
