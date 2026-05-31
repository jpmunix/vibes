import { type LargeLanguageModel } from "@/lib/schemas";
import { type LanguageModel } from "@/ipc/types";
import { useState, useEffect, useRef } from "react";
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
import { matchesModelSearch } from "@/lib/modelSearch";
import { useChatPreference } from "@/hooks/useChatPreferences";
import {
  type ModelFilters,
  DEFAULT_MODEL_FILTERS,
  modelPassesFilters,
} from "@/components/ModelFiltersPanel";

// ── Provider label map for filter panel ───────────────────────────────────────
function getProviderLabel(provider: string, customProviders?: any[]): string {
  if (provider === "openrouter") return "OpenRouter";
  if (provider === "ollama") return "Ollama";
  if (provider === "auto-router") return "Auto";
  const cp = customProviders?.find((p: any) => p.id === provider);
  return cp?.name || provider;
}

interface ModelPickerProps {
  chatId?: number;
}

export function ModelPicker({ chatId }: ModelPickerProps) {
  const { settings, updateSettings } = useSettings();
  const queryClient = useQueryClient();

  const { stats, incrementUsage, removeUsage } = useModelUsageStats();
  const { aliases, setAlias, removeAlias } = useModelAliases();
  const [search, setSearch] = useState("");

  // ── Per-chat model persistence ────────────────────────────────────────
  const [chatModel, setChatModel, chatModelLoaded] =
    useChatPreference<LargeLanguageModel | null>(
      chatId ?? null,
      "selectedModel",
      null,
    );

  // ── Per-chat filter persistence ───────────────────────────────────────
  const [filters, setFilters] = useChatPreference<ModelFilters>(
    chatId ?? null,
    "modelFilters",
    DEFAULT_MODEL_FILTERS,
  );

  // Track if we've restored the model for the current chatId
  const restoredChatIdRef = useRef<number | null>(null);

  // Restore model when chat changes and per-chat preference is loaded
  useEffect(() => {
    if (!chatId || !chatModelLoaded || !settings) return;
    if (restoredChatIdRef.current === chatId) return;
    restoredChatIdRef.current = chatId;

    if (chatModel) {
      // Restore per-chat model (only if different from current)
      const current = settings.selectedModel;
      if (
        current.name !== chatModel.name ||
        current.provider !== chatModel.provider
      ) {
        updateSettings({ selectedModel: chatModel });
        queryClient.invalidateQueries({ queryKey: queryKeys.tokenCount.all });
      }
    }
    // If no chatModel stored, use whatever global model is currently set
  }, [chatId, chatModel, chatModelLoaded, settings]);

  // The model picker ALWAYS controls selectedModel, regardless of chat mode.
  const onModelSelect = (model: LargeLanguageModel) => {
    updateSettings({ selectedModel: model });
    incrementUsage(`${model.provider}:${model.name}`);
    // Invalidate token count when model changes since different models have different context windows
    queryClient.invalidateQueries({ queryKey: queryKeys.tokenCount.all });
    // Persist to per-chat preference
    setChatModel(model);
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
    enabled: settings?.ollamaEnabled !== false,
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
  const modelDisplayName = getModelDisplayName();

  const allAvailableModels: Array<{ provider: string; model: LanguageModel }> =
    [];

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
    const enabledModels =
      settings.enabledOpenRouterModels ?? DEFAULT_ENABLED_MODELS;
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

  // Save total count before filtering
  const totalModelCount = allAvailableModels.length;

  // Apply model filters
  const filteredModels = allAvailableModels.filter(({ provider, model }) =>
    modelPassesFilters(model, provider, filters),
  );

  // Compute unique providers for filter panel
  const uniqueProviders = [
    ...new Set(allAvailableModels.map((m) => m.provider)),
  ];
  const availableProvidersForPanel = uniqueProviders.map((id) => ({
    id,
    label: getProviderLabel(id, customProviders as any),
  }));

  // Sort: selected first, then by custom sort or most-recently-used
  const sortedModels = [...filteredModels].sort((a, b) => {
    const isASelected =
      a.provider === selectedModel.provider &&
      a.model.apiName === selectedModel.name;
    const isBSelected =
      b.provider === selectedModel.provider &&
      b.model.apiName === selectedModel.name;

    if (isASelected) return -1;
    if (isBSelected) return 1;

    // Custom sorting
    if (filters.sortBy && filters.sortBy !== "default") {
      const orderMult = filters.sortOrder === "asc" ? 1 : -1;

      if (filters.sortBy === "price_input") {
        const pa = a.model.pricingInput
          ? parseFloat(a.model.pricingInput)
          : Infinity;
        const pb = b.model.pricingInput
          ? parseFloat(b.model.pricingInput)
          : Infinity;
        if (pa !== pb) return (pa - pb) * orderMult;
      } else if (filters.sortBy === "price_output") {
        const pa = a.model.pricingOutput
          ? parseFloat(a.model.pricingOutput)
          : Infinity;
        const pb = b.model.pricingOutput
          ? parseFloat(b.model.pricingOutput)
          : Infinity;
        if (pa !== pb) return (pa - pb) * orderMult;
      } else if (filters.sortBy === "context") {
        const ca = a.model.contextWindow ?? 0;
        const cb = b.model.contextWindow ?? 0;
        if (ca !== cb) return (ca - cb) * orderMult;
      }
    }

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
        selectedValue={`${selectedModel.provider}|||${selectedModel.name}`}
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
        filters={filters}
        onFiltersChange={setFilters}
        availableProviders={availableProvidersForPanel}
        totalModelCount={totalModelCount}
        selectedVariant={settings.selectedModelVariant ?? ""}
        onVariantChange={(suffix) => updateSettings({ selectedModelVariant: suffix })}
        showVariants={availableProvidersForPanel.some((p) => p.id === "openrouter")}
        triggerContent={
          <div className="flex items-center gap-0.5 min-w-0 flex-1">
            <span className="truncate typo-select text-left">
              {modelDisplayName}
            </span>
            {selectedModel.provider === "auto-router" &&
              selectedModel.name === "auto" && <AutoRouterBadge />}
          </div>
        }
        renderModelItem={({ provider, model }, _isSelected) => {
          const isEnabled =
            provider === "openrouter" &&
            (
              settings.enabledOpenRouterModels ?? DEFAULT_ENABLED_MODELS
            ).includes(model.apiName);
          const isSelectedReal =
            selectedModel.provider === provider &&
            selectedModel.name === model.apiName;
          const isRemovable =
            provider === "openrouter" && !isEnabled && !isSelectedReal;

          const showProviderLabel =
            provider !== "openrouter" && provider !== "auto-router";
          const providerLabel = showProviderLabel
            ? getProviderLabel(provider, customProviders as any)
            : undefined;

          return (
            <div className="flex items-center gap-2 w-full">
              <div className="flex-1 min-w-0">
                <ModelItemContent
                  model={model}
                  showAutoRouterBadge={provider === "auto-router"}
                  isAutoRouter={provider === "auto-router"}
                  onRemoveClick={
                    isRemovable
                      ? (m) => removeUsage(`${provider}:${m.apiName}`)
                      : undefined
                  }
                  alias={aliases[model.apiName]}
                  onSetAlias={(m, newAlias) =>
                    setAlias({ modelId: m.apiName, alias: newAlias })
                  }
                  onRemoveAlias={(m) => removeAlias(m.apiName)}
                  providerLabel={providerLabel}
                />
              </div>
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
