import { type LargeLanguageModel } from "@/lib/schemas";
import { type LanguageModel } from "@/ipc/types";
import { useState, useEffect, useRef } from "react";
import { useMultiProviderModels } from "@/hooks/useMultiProviderModels";

import { useLanguageModelProviders } from "@/hooks/useLanguageModelProviders";
import { useSettings } from "@/hooks/useSettings";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { AutoRouterBadge } from "@/components/AutoRouterBadge";
import { ModelItemContent } from "@/components/ModelItemContent";
import { ModelVariantPicker } from "@/components/ModelVariantPicker";

import { useModelUsageStats } from "@/hooks/useModelUsageStats";
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

  const { stats, incrementUsage } = useModelUsageStats();
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

  // ── Multi-provider models (unified hook: OpenRouter + custom + Ollama) ──
  const { data: allModels, isLoading: modelsLoading } = useMultiProviderModels();

  const { isLoading: providersLoading } = useLanguageModelProviders();

  const loading = modelsLoading || providersLoading;

  // Get display name for the selected model
  const getModelDisplayName = () => {
    // Look up in the unified models list (apiName carries the provider prefix).
    // selectedModel.name is stored WITHOUT the provider prefix ({provider, name}),
    // so for custom::/ollama:: models match by the raw name suffix.
    const found = (allModels || []).find((m) => {
      if (m.sourceProvider !== selectedModel.provider) return false;
      return (
        m.apiName === selectedModel.name ||
        m.apiName.endsWith(`::${selectedModel.name}`)
      );
    });
    if (found) return found.displayName;

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

  const doesModelMatchSearch = (m: LanguageModel) => {
    if (!searchLower) return true;
    return matchesModelSearch(search, m.displayName, m.apiName);
  };

  // Build the picker list from the unified hook (OpenRouter + custom + Ollama).
  // The hook already resolves providers, skips disabled ones, and collapses
  // custom/Ollama into prefixed apiName (custom::id::name, ollama::name).
  // We keep `provider` = sourceProvider so the picker can badge/filter by origin.
  for (const m of allModels || []) {
    if (!searchLower || doesModelMatchSearch(m)) {
      allAvailableModels.push({ provider: m.sourceProvider, model: m });
    }
  }

  // Auto-router — pseudo-provider (only when present; disabled upstream for now)
  const autoRouterModels = (allModels || []).filter(
    (m) => m.sourceProvider === "auto-router",
  );
  if (autoRouterModels.length > 0) {
    for (const m of autoRouterModels) {
      if (!searchLower || doesModelMatchSearch(m)) {
        allAvailableModels.push({ provider: "auto-router", model: m });
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
        selectedValue={
          (() => {
            // Prefer the prefixed apiName from the list so selection matches
            // the CommandItem value (custom::id::name, ollama::name).
            const selectedEntry = sortedModels.find(
              (sm) =>
                sm.provider === selectedModel.provider &&
                (sm.model.apiName === selectedModel.name ||
                  sm.model.apiName.endsWith(`::${selectedModel.name}`)),
            );
            return selectedEntry
              ? `${selectedEntry.provider}|||${selectedEntry.model.apiName}`
              : `${selectedModel.provider}|||${selectedModel.name}`;
          })()
        }
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
            // Strip the provider prefix when storing {provider, name} —
            // the provider is explicit, the name is the raw model id.
            const storedName = apiName.includes("::")
              ? apiName.slice(apiName.lastIndexOf("::") + 2)
              : apiName;
            onModelSelect({
              name: storedName,
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
          const isSelectedReal =
            selectedModel.provider === provider &&
            (selectedModel.name === model.apiName ||
              model.apiName.endsWith(`::${selectedModel.name}`));

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
                  onRemoveClick={undefined}
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
