import { type LargeLanguageModel } from "@/lib/schemas";
import { type LanguageModel } from "@/ipc/types";
import { useState } from "react";
import { useLanguageModelsByProviders } from "@/hooks/useLanguageModelsByProviders";

import { useLanguageModelProviders } from "@/hooks/useLanguageModelProviders";
import { useSettings } from "@/hooks/useSettings";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { AutoRouterBadge } from "@/components/AutoRouterBadge";
import { ModelItemContent } from "@/components/ModelItemContent";
import { ModelVariantPicker } from "@/components/ModelVariantPicker";
import { DEFAULT_ENABLED_MODELS } from "@/ipc/shared/language_model_constants";
import { useModelUsageStats } from "@/hooks/useModelUsageStats";
import { getVariantLabel } from "@/ipc/shared/model_variants";

export function ModelPicker() {
  const { settings, updateSettings } = useSettings();
  const queryClient = useQueryClient();
  const isTrial = false;
  
  const { stats, incrementUsage, removeUsage } = useModelUsageStats();
  const [search, setSearch] = useState("");

  const onModelSelect = (model: LargeLanguageModel) => {
    updateSettings({ selectedModel: model });
    incrementUsage(`${model.provider}:${model.name}`);
    // Invalidate token count when model changes since different models have different context windows
    // (technically they have different tokenizers, but we don't keep track of that).
    queryClient.invalidateQueries({ queryKey: queryKeys.tokenCount.all });
  };



  // Cloud models from providers
  const { data: modelsByProviders, isLoading: modelsByProvidersLoading } =
    useLanguageModelsByProviders();

  const { isLoading: providersLoading } = useLanguageModelProviders();

  const loading = modelsByProvidersLoading || providersLoading;

  // Get display name for the selected model
  const getModelDisplayName = () => {
    // For cloud models, look up in the modelsByProviders data
    if (modelsByProviders && modelsByProviders[selectedModel.provider]) {
      const customFoundModel = modelsByProviders[selectedModel.provider].find(
        (model) =>
          model.type === "custom" && model.id === selectedModel.customModelId,
      );
      if (customFoundModel) {
        return customFoundModel.displayName;
      }
      const foundModel = modelsByProviders[selectedModel.provider].find(
        (model) => model.apiName === selectedModel.name,
      );
      if (foundModel) {
        return foundModel.displayName;
      }
    }

    // Fallback if not found
    return selectedModel.name;
  };

  if (!settings) {
    return null;
  }
  const selectedModel = settings?.selectedModel;
  const selectedVariant = settings?.selectedModelVariant ?? "";
  const modelDisplayName = getModelDisplayName();

  // Variant display label for the trigger
  const variantLabel = getVariantLabel(selectedVariant);

  const allAvailableModels: Array<{ provider: string; model: LanguageModel }> = [];

  const searchLower = search.toLowerCase();

  const doesModelMatchSearch = (m: LanguageModel) => {
     if (!searchLower) return true;
     return m.displayName.toLowerCase().includes(searchLower) || m.apiName.toLowerCase().includes(searchLower);
  };

  if (modelsByProviders?.["auto-router"]) {
    modelsByProviders["auto-router"].forEach((model) => {
      if (!searchLower || doesModelMatchSearch(model)) {
        allAvailableModels.push({ provider: "auto-router", model });
      }
    });
  }

  if (modelsByProviders?.["openrouter"]) {
    const enabledModels = settings.enabledOpenRouterModels ?? DEFAULT_ENABLED_MODELS;
    modelsByProviders["openrouter"].forEach((model) => {
      const isEnabled = enabledModels.includes(model.apiName);
      const isUsed = (stats[`openrouter:${model.apiName}`] || 0) > 0;
      
      if (searchLower) {
        if (doesModelMatchSearch(model)) {
           allAvailableModels.push({ provider: "openrouter", model });
        }
      } else {
        if (isEnabled || isUsed) {
           allAvailableModels.push({ provider: "openrouter", model });
        }
      }
    });
  }

  // Sort: selected first
  const sortedModels = [...allAvailableModels].sort((a, b) => {
    const isASelected =
      a.provider === selectedModel.provider &&
      a.model.apiName === selectedModel.name;
    const isBSelected =
      b.provider === selectedModel.provider &&
      b.model.apiName === selectedModel.name;

    if (isASelected) return -1;
    if (isBSelected) return 1;

    const usageA = stats[`${a.provider}:${a.model.apiName}`] || 0;
    const usageB = stats[`${b.provider}:${b.model.apiName}`] || 0;
    
    if (usageA !== usageB) {
       return usageB - usageA;
    }

    // Fallback: auto-router first, then openrouter
    if (a.provider === "auto-router" && b.provider !== "auto-router") return -1;
    if (a.provider !== "auto-router" && b.provider === "auto-router") return 1;

    return a.model.displayName.localeCompare(b.model.displayName);
  });

  return (
    <>
      <ModelVariantPicker
        models={sortedModels}
        selectedValue={`${selectedModel.provider}:${selectedModel.name}`}
        selectedVariant={selectedVariant}
        onModelSelect={(val) => {
          const sepIdx = val.indexOf(":");
          const prov = val.slice(0, sepIdx);
          const apiName = val.slice(sepIdx + 1);
          const found = sortedModels.find(
            (sm) => sm.provider === prov && sm.model.apiName === apiName,
          );
          if (found) {
            const customModelId =
              found.model.type === "custom" ? found.model.id : undefined;
            onModelSelect({
              name: found.model.apiName,
              provider: prov as any,
              customModelId,
            });
          }
        }}
        onVariantChange={(variant) => {
          updateSettings({ selectedModelVariant: variant });
        }}
        triggerContent={
          <div className="flex items-center gap-0.5 min-w-0 flex-1">
            <span className="truncate typo-select text-left">
              {modelDisplayName}
              {variantLabel && (
                <span className="opacity-60"> · {variantLabel}</span>
              )}
            </span>
            {selectedModel.provider === "auto-router" &&
              selectedModel.name === "auto" && <AutoRouterBadge />}
          </div>
        }
        renderModelItem={({ provider, model }, isSelected) => {
          const isEnabled = provider === "openrouter" && 
             (settings.enabledOpenRouterModels ?? DEFAULT_ENABLED_MODELS).includes(model.apiName);
          const isSelectedReal = selectedModel.provider === provider && selectedModel.name === model.apiName;
          const isRemovable = provider === "openrouter" && !isEnabled && !isSelectedReal;

          return (
            <ModelItemContent
              model={model}
              showAutoRouterBadge={provider === "auto-router"}
              isAutoRouter={provider === "auto-router"}
              onRemoveClick={isRemovable ? (m) => removeUsage(`${provider}:${m.apiName}`) : undefined}
            />
          );
        }}
        searchPlaceholder="Buscar modelos..."
        onSearchChange={setSearch}
        emptyMessage={
          loading ? "Cargando modelos..." : "No hay modelos disponibles"
        }
      />
    </>
  );
}
