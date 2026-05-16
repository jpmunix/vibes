import { useQuery } from "@tanstack/react-query";
import { ipc, type LanguageModel } from "@/ipc/types";
import { queryKeys } from "@/lib/queryKeys";
import { useMemo } from "react";
import { useSettings } from "./useSettings";
import { MODEL_PROVIDER_SEPARATOR } from "@/lib/schemas";

/** A model with its provider source clearly identified */
export interface MultiProviderModel extends LanguageModel {
  /** The provider this model belongs to (e.g. "openrouter", "ollama", "custom::cortecs") */
  sourceProvider: string;
  /** Human-readable provider label (e.g. "OpenRouter", "Ollama", "Cortecs") */
  sourceProviderLabel: string;
}

/**
 * Hook that combines models from ALL configured providers into a single list.
 * Each model carries a `sourceProvider` field identifying its origin.
 *
 * Sources:
 *   1. OpenRouter — cloud models (always loaded)
 *   2. Custom providers — user-configured proxies/APIs (e.g. Cortecs)
 *   3. Ollama — local models (graceful if server is offline)
 *
 * Used by the strategist/executor selectors to allow cross-provider assignment.
 */
export function useMultiProviderModels() {
  const { settings } = useSettings();
  const customProviders = settings?.customProviders ?? [];

  // 1. OpenRouter models
  const {
    data: openRouterModels,
    isLoading: openRouterLoading,
  } = useQuery<LanguageModel[]>({
    queryKey: queryKeys.languageModels.forProvider({ providerId: "openrouter" }),
    queryFn: () => ipc.languageModel.getModels({ providerId: "openrouter" }),
  });

  // 2. Custom provider models (one query per custom provider)
  const customProviderIds = useMemo(
    () => customProviders.map((cp: any) => cp.id as string),
    [customProviders],
  );

  const {
    data: customModelsMap,
    isLoading: customLoading,
  } = useQuery<Record<string, LanguageModel[]>>({
    queryKey: ["multi-provider-custom-models", ...customProviderIds],
    queryFn: async () => {
      const result: Record<string, LanguageModel[]> = {};
      await Promise.all(
        customProviderIds.map(async (id) => {
          try {
            const models = await ipc.languageModel.getModels({ providerId: id });
            result[id] = models;
          } catch {
            result[id] = [];
          }
        }),
      );
      return result;
    },
    enabled: customProviderIds.length > 0,
  });

  // 3. Ollama models (local)
  const {
    data: ollamaResult,
    isLoading: ollamaLoading,
  } = useQuery({
    queryKey: ["ollama-models"],
    queryFn: () => ipc.languageModel.listOllamaModels(),
    refetchInterval: 30_000,
    retry: false,
  });

  const disabledProviders = settings?.disabledProviders ?? [];
  const ollamaEnabled = settings?.ollamaEnabled !== false;

  const models = useMemo<MultiProviderModel[]>(() => {
    const result: MultiProviderModel[] = [];

    // OpenRouter models — skip if disabled
    if (openRouterModels && !disabledProviders.includes("openrouter")) {
      for (const m of openRouterModels) {
        result.push({
          ...m,
          sourceProvider: "openrouter",
          sourceProviderLabel: "OpenRouter",
        });
      }
    }

    // Custom provider models — skip disabled ones
    if (customModelsMap) {
      for (const [providerId, models] of Object.entries(customModelsMap)) {
        if (disabledProviders.includes(providerId)) continue;
        const providerConfig = customProviders.find((cp: any) => cp.id === providerId);
        const providerLabel = providerConfig?.name || providerId;
        for (const m of models) {
          result.push({
            ...m,
            apiName: `custom::${providerId}${MODEL_PROVIDER_SEPARATOR}${m.apiName}`,
            sourceProvider: `custom::${providerId}`,
            sourceProviderLabel: providerLabel,
          });
        }
      }
    }

    // Ollama models — skip if disabled
    if (ollamaEnabled && ollamaResult?.models) {
      for (const m of ollamaResult.models) {
        result.push({
          apiName: `ollama${MODEL_PROVIDER_SEPARATOR}${m.modelName}`,
          displayName: m.displayName,
          description: `Ollama local · ${m.modelName}`,
          type: "local",
          sourceProvider: "ollama",
          sourceProviderLabel: "Ollama",
        });
      }
    }

    return result;
  }, [openRouterModels, customModelsMap, ollamaResult, customProviders, disabledProviders, ollamaEnabled]);

  return {
    data: models,
    isLoading: openRouterLoading || customLoading || ollamaLoading,
  };
}
