import { type LargeLanguageModel } from "@/lib/schemas";
import { type LanguageModel } from "@/ipc/types";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useMultiProviderModels } from "@/hooks/useMultiProviderModels";
import { useLanguageModelProviders } from "@/hooks/useLanguageModelProviders";
import { useSettings } from "@/hooks/useSettings";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { ModelSelector } from "@/components/unified/ModelSelector";
import { ModelFiltersPanel } from "@/components/ModelFiltersPanel";
import { useModelUsageStats } from "@/hooks/useModelUsageStats";
import { matchesModelSearch } from "@/lib/modelSearch";
import { useChatPreference } from "@/hooks/useChatPreferences";
import { type ModelFilters, DEFAULT_MODEL_FILTERS, modelPassesFilters } from "@/components/ModelFiltersPanel";

function getProviderLabel(provider: string, customProviders?: any[]): string {
  if (provider === "openrouter") return "OpenRouter";
  if (provider === "ollama") return "Ollama";
  if (provider === "auto-router") return "Auto";
  const cp = customProviders?.find((p: any) => p.id === provider);
  return cp?.name || provider;
}

interface ModelPickerProps { chatId?: number; }

export function ModelPicker({ chatId }: ModelPickerProps) {
  const { settings, updateSettings } = useSettings();
  const queryClient = useQueryClient();
  const { stats, incrementUsage } = useModelUsageStats();
  const [search, setSearch] = useState("");
  const [chatModel, setChatModel, chatModelLoaded] = useChatPreference<LargeLanguageModel | null>(chatId ?? null, "selectedModel", null);
  const [filters, setFilters] = useChatPreference<ModelFilters>(chatId ?? null, "modelFilters", DEFAULT_MODEL_FILTERS);
  const restoredChatIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!chatId || !chatModelLoaded || !settings) return;
    if (restoredChatIdRef.current === chatId) return;
    restoredChatIdRef.current = chatId;
    if (chatModel) {
      const current = settings.selectedModel;
      if (current.name !== chatModel.name || current.provider !== chatModel.provider) {
        updateSettings({ selectedModel: chatModel });
        queryClient.invalidateQueries({ queryKey: queryKeys.tokenCount.all });
      }
    }
  }, [chatId, chatModel, chatModelLoaded, settings]);

  const onModelSelect = useCallback((model: LargeLanguageModel) => {
    updateSettings({ selectedModel: model });
    incrementUsage(`${model.provider}:${model.name}`);
    queryClient.invalidateQueries({ queryKey: queryKeys.tokenCount.all });
    setChatModel(model);
  }, [settings, queryClient, chatModelLoaded]);

  const { data: allModels, isLoading: modelsLoading } = useMultiProviderModels();
  const { isLoading: providersLoading } = useLanguageModelProviders();
  const loading = modelsLoading || providersLoading;

  if (!settings) return null;
  const selectedModel = settings.selectedModel;

  const searchLower = useMemo(() => search.toLowerCase(), [search]);
  const customProviders = settings.customProviders ?? [];

  // ── Derive filtered/sorted models (memoized: no recompute on every render frame)
  const { sortedModels, filteredCount, totalCount, availableProvidersForPanel, selectedApiName } = useMemo(() => {
    if (!allModels) {
      return { sortedModels: [] as Array<{ provider: string; model: LanguageModel }>, filteredCount: 0, totalCount: 0, availableProvidersForPanel: [] as Array<{ id: string; label: string }>, selectedApiName: selectedModel.name as string };
    }

    const doesMatch = (m: LanguageModel) => !searchLower || matchesModelSearch(search, m.displayName, m.apiName);

    const avail: Array<{ provider: string; model: LanguageModel }> = [];
    for (const m of allModels) {
      if (!doesMatch(m)) continue;
      avail.push({ provider: (m as any).sourceProvider, model: m });
    }
    // auto-router is already in allModels if present; no second pass needed (was double-counting)
    const totalModelCount = avail.length;
    const filtered = avail.filter(({ provider, model }) => modelPassesFilters(model, provider, filters));
    const uniqueProviders = [...new Set(avail.map((m) => m.provider))];
    const panelProviders = uniqueProviders.map((id) => ({ id, label: getProviderLabel(id, customProviders as any) }));

    const sorted = [...filtered].sort((a, b) => {
      const isASelected = a.provider === selectedModel.provider && a.model.apiName === selectedModel.name;
      const isBSelected = b.provider === selectedModel.provider && b.model.apiName === selectedModel.name;
      if (isASelected) return -1;
      if (isBSelected) return 1;
      if (filters.sortBy && filters.sortBy !== "default") {
        const mult = filters.sortOrder === "asc" ? 1 : -1;
        if (filters.sortBy === "price_input") {
          const pa = a.model.pricingInput ? parseFloat(a.model.pricingInput) : Infinity;
          const pb = b.model.pricingInput ? parseFloat(b.model.pricingInput) : Infinity;
          if (pa !== pb) return (pa - pb) * mult;
        } else if (filters.sortBy === "price_output") {
          const pa = a.model.pricingOutput ? parseFloat(a.model.pricingOutput) : Infinity;
          const pb = b.model.pricingOutput ? parseFloat(b.model.pricingOutput) : Infinity;
          if (pa !== pb) return (pa - pb) * mult;
        } else if (filters.sortBy === "context") {
          const ca = a.model.contextWindow ?? 0;
          const cb = b.model.contextWindow ?? 0;
          if (ca !== cb) return (ca - cb) * mult;
        }
      }
      const usageA = stats[`${a.provider}:${a.model.apiName}`] || 0;
      const usageB = stats[`${b.provider}:${b.model.apiName}`] || 0;
      if (usageA !== usageB) return usageB - usageA;
      if (a.provider === "auto-router" && b.provider !== "auto-router") return -1;
      if (a.provider !== "auto-router" && b.provider === "auto-router") return 1;
      return a.model.displayName.localeCompare(b.model.displayName);
    });

    const entry = sorted.find((sm) => sm.provider === selectedModel.provider && (sm.model.apiName === selectedModel.name || sm.model.apiName.endsWith(`::${selectedModel.name}`)));
    const apiName = entry ? entry.model.apiName : (selectedModel.name as string);

    return { sortedModels: sorted, filteredCount: filtered.length, totalCount: totalModelCount, availableProvidersForPanel: panelProviders, selectedApiName: apiName };
  }, [allModels, searchLower, search, filters, stats, selectedModel, customProviders]);

  const selectorModels = useMemo(() => sortedModels.map(({ provider, model }) => ({
    ...model,
    sourceProvider: provider,
    sourceProviderLabel: getProviderLabel(provider, customProviders as any),
  })), [sortedModels, customProviders]);

  const handleChange = useCallback((val: string) => {
    const found = sortedModels.find((sm) => sm.model.apiName === val);
    if (!found) return;
    const customModelId = found.model.type === "custom" ? (found.model as any).id : undefined;
    const storedName = val.includes("::") ? val.slice(val.lastIndexOf("::") + 2) : val;
    onModelSelect({ name: storedName, provider: found.provider as any, customModelId });
  }, [sortedModels, onModelSelect]);

  const rightPanel = useMemo(() => (
    <ModelFiltersPanel
      filters={filters}
      onChange={setFilters}
      availableProviders={availableProvidersForPanel}
      filteredCount={filteredCount}
      totalCount={totalCount}
    />
  ), [filters, setFilters, availableProvidersForPanel, filteredCount, totalCount]);

  const modelDisplayName = useMemo(() => {
    const found = (allModels || []).find((m: any) => m.sourceProvider === selectedModel.provider && (m.apiName === selectedModel.name || (m.apiName as string).endsWith(`::${selectedModel.name}`)));
    return found ? (found as any).displayName : selectedModel.name;
  }, [allModels, selectedModel]);

  return (
    <ModelSelector
      value={selectedApiName}
      onChange={handleChange}
      models={selectorModels as any}
      loading={loading}
      placeholder={modelDisplayName}
      onSearchChange={setSearch}
      align="center"
      side="top"
      showProviderBadge={false}
      rightPanel={rightPanel}
    />
  );
}
