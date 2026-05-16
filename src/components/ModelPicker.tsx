import { type LargeLanguageModel } from "@/lib/schemas";
import { type LanguageModel } from "@/ipc/types";
import { useState } from "react";
import { useLanguageModelsByProviders } from "@/hooks/useLanguageModelsByProviders";

import { useLanguageModelProviders } from "@/hooks/useLanguageModelProviders";
import { useSettings } from "@/hooks/useSettings";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { ipc } from "@/ipc/types";
import { AutoRouterBadge } from "@/components/AutoRouterBadge";
import { ModelItemContent } from "@/components/ModelItemContent";
import { ModelVariantPicker } from "@/components/ModelVariantPicker";
import { DEFAULT_ENABLED_MODELS } from "@/ipc/shared/language_model_constants";
import { useModelUsageStats } from "@/hooks/useModelUsageStats";
import { useModelAliases } from "@/hooks/useModelAliases";
import { getVariantLabel } from "@/ipc/shared/model_variants";
import { matchesModelSearch } from "@/lib/modelSearch";

// ── Provider badge styles (same palette as SettingsModelSelector) ──────────
const PROVIDER_BADGES: Record<string, { bg: string; text: string; label: string }> = {
    openrouter: { bg: "bg-sky-500/10", text: "text-sky-500", label: "OR" },
    ollama: { bg: "bg-emerald-500/10", text: "text-emerald-500", label: "Ollama" },
};

function getProviderBadge(provider: string, customProviders?: any[]): { bg: string; text: string; label: string } | null {
    if (PROVIDER_BADGES[provider]) return PROVIDER_BADGES[provider];
    // Custom providers get a purple badge with their configured name
    const cp = customProviders?.find((p: any) => p.id === provider);
    if (cp) {
        return { bg: "bg-purple-500/10", text: "text-purple-400", label: cp.name || provider };
    }
    return null;
}

export function ModelPicker() {
  const { settings, updateSettings } = useSettings();
  const queryClient = useQueryClient();
  const isTrial = false;
  
  const { stats, incrementUsage, removeUsage } = useModelUsageStats();
  const { aliases, setAlias, removeAlias, resolveDisplayName } = useModelAliases();
  const [search, setSearch] = useState("");

  // The model picker ALWAYS controls selectedModel, regardless of chat mode.
  // Plan/ask modes use the same selectedModel as agent mode.
  const onModelSelect = (model: LargeLanguageModel) => {
    updateSettings({ selectedModel: model });
    incrementUsage(`${model.provider}:${model.name}`);
    // Invalidate token count when model changes since different models have different context windows
    queryClient.invalidateQueries({ queryKey: queryKeys.tokenCount.all });
  };



  // Cloud models from providers
  const { data: modelsByProviders, isLoading: modelsByProvidersLoading } =
    useLanguageModelsByProviders();

  const { isLoading: providersLoading } = useLanguageModelProviders();

  // Ollama models (local) — graceful when server is offline
  const { data: ollamaResult } = useQuery({
    queryKey: ["ollama-models"],
    queryFn: () => ipc.languageModel.listOllamaModels(),
    refetchInterval: 30_000,
    retry: false,
  });

  const loading = modelsByProvidersLoading || providersLoading;

  // Get display name for the selected model
  const getModelDisplayName = () => {
    // Check for user-defined alias first
    const aliasName = aliases[selectedModel.name];
    if (aliasName) return aliasName;

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

    // Check Ollama models
    if (selectedModel.provider === "ollama" && ollamaResult?.models) {
      const ollamaModel = ollamaResult.models.find(
        (m) => m.modelName === selectedModel.name,
      );
      if (ollamaModel) return ollamaModel.displayName;
    }

    // Fallback if not found
    return selectedModel.name;
  };

  if (!settings) {
    return null;
  }

  // Always show the selectedModel — no mode-based switching
  const selectedModel = settings.selectedModel;
  const selectedVariant = settings.selectedModelVariant ?? "";
  const modelDisplayName = getModelDisplayName();


  // Variant display label for the trigger
  const variantLabel = getVariantLabel(selectedVariant);

  const allAvailableModels: Array<{ provider: string; model: LanguageModel }> = [];

  const searchLower = search.toLowerCase();
  const customProviders = settings.customProviders ?? [];
  const disabledProviders = settings.disabledProviders ?? [];
  const ollamaEnabled = settings.ollamaEnabled !== false;

  const isProviderDisabled = (id: string) => disabledProviders.includes(id);

  const doesModelMatchSearch = (m: LanguageModel) => {
     if (!searchLower) return true;
     const alias = aliases[m.apiName];
     return matchesModelSearch(search, m.displayName, m.apiName, alias);
  };

  // Auto-router — only when OpenRouter is active
  if (!isProviderDisabled("openrouter") && modelsByProviders?.["auto-router"]) {
    modelsByProviders["auto-router"].forEach((model) => {
      if (!searchLower || doesModelMatchSearch(model)) {
        allAvailableModels.push({ provider: "auto-router", model });
      }
    });
  }

  // OpenRouter models (filtered by enabled + usage)
  if (!isProviderDisabled("openrouter") && modelsByProviders?.["openrouter"]) {
    const enabledModels = settings.enabledOpenRouterModels ?? DEFAULT_ENABLED_MODELS;
    modelsByProviders["openrouter"].forEach((model) => {
      const isCustom = model.type === "custom";
      const isEnabled = enabledModels.includes(model.apiName);
      const isUsed = (stats[`openrouter:${model.apiName}`] || 0) > 0;
      
      if (searchLower) {
        if (doesModelMatchSearch(model)) {
           allAvailableModels.push({ provider: "openrouter", model });
        }
      } else {
        if (isCustom || isEnabled || isUsed) {
           allAvailableModels.push({ provider: "openrouter", model });
        }
      }
    });
  }

  // Custom provider models (all models, skip disabled)
  for (const cp of customProviders) {
    if (isProviderDisabled(cp.id)) continue;
    if (modelsByProviders?.[cp.id]) {
      modelsByProviders[cp.id].forEach((model) => {
        if (!searchLower || doesModelMatchSearch(model)) {
          allAvailableModels.push({ provider: cp.id, model });
        }
      });
    }
  }

  // Ollama models (skip if disabled)
  if (ollamaEnabled && ollamaResult?.models && ollamaResult.models.length > 0) {
    for (const m of ollamaResult.models) {
      const syntheticModel: LanguageModel = {
        apiName: m.modelName,
        displayName: m.displayName,
        description: `Ollama local · ${m.modelName}`,
        type: "local",
      };
      if (!searchLower || doesModelMatchSearch(syntheticModel)) {
        allAvailableModels.push({ provider: "ollama", model: syntheticModel });
      }
    }
  }

  // Sort: selected first, then by most-recently-used (timestamp descending)
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

  // Detect if we have multiple providers to show badges
  const uniqueProviders = new Set(sortedModels.map((m) => m.provider));
  const showBadges = uniqueProviders.size > 1;

  return (
    <>
      <ModelVariantPicker
        models={sortedModels}
        selectedValue={`${selectedModel.provider}|||${selectedModel.name}`}
        selectedVariant={selectedVariant}
        modelAliases={aliases}
        onModelSelect={(val) => {
          const sepIdx = val.indexOf("|||");
          const prov = val.slice(0, sepIdx);
          const apiName = val.slice(sepIdx + 3);
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
          const badge = showBadges ? getProviderBadge(provider, customProviders as any) : null;

          return (
            <div className="flex items-center gap-2 w-full">
              <div className="flex-1 min-w-0">
                <ModelItemContent
                  model={model}
                  showAutoRouterBadge={provider === "auto-router"}
                  isAutoRouter={provider === "auto-router"}
                  onRemoveClick={isRemovable ? (m) => removeUsage(`${provider}:${m.apiName}`) : undefined}
                  alias={aliases[model.apiName]}
                  onSetAlias={(m, newAlias) => setAlias({ modelId: m.apiName, alias: newAlias })}
                  onRemoveAlias={(m) => removeAlias(m.apiName)}
                />
              </div>
              {badge && (
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md shrink-0 ${badge.bg} ${badge.text}`}>
                  {badge.label}
                </span>
              )}
            </div>
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
