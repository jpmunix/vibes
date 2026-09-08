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

/**
 * Referencia estable para "sin custom providers". Sin esto, `settings.customProviders ?? []`
 * crea un array nuevo en cada render e invalida el useMemo de filtrado/orden.
 */
const EMPTY_CUSTOM_PROVIDERS: any[] = [];

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

  // OJO: nada de `if (!settings) return null` aquí — abajo hay useMemo y un
  // early return antes de ellos cambia el número de hooks entre renders
  // (settings llega async), que es violación de las reglas de hooks.
  // El guard va al final, justo antes del return del JSX.
  const selectedModel = settings?.selectedModel;
  const selectedModelName = selectedModel?.name;
  const selectedModelProvider = selectedModel?.provider;

  const searchLower = useMemo(() => search.toLowerCase(), [search]);
  // Referencia estable: `?? []` inline creaba un array nuevo por render.
  const customProviders = settings?.customProviders ?? EMPTY_CUSTOM_PROVIDERS;

  // ── Derive filtered/sorted models (memoized: no recompute on every render frame)
  const { sortedModels, filteredCount, totalCount, availableProvidersForPanel, selectedApiName } = useMemo(() => {
    if (!allModels) {
      return { sortedModels: [] as Array<{ provider: string; model: LanguageModel }>, filteredCount: 0, totalCount: 0, availableProvidersForPanel: [] as Array<{ id: string; label: string }>, selectedApiName: (selectedModelName ?? "") as string };
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

    // Precalcular por modelo lo que el comparador necesitaba recalcular en CADA
    // comparación (n·log n veces): la clave de stats concatenada y el flag de
    // seleccionado. Con listas grandes esto era trabajo puro tirado a la basura.
    const decorated = filtered.map(({ provider, model }) => ({
      provider,
      model,
      isSelected: provider === selectedModelProvider && model.apiName === selectedModelName,
      usage: stats[`${provider}:${model.apiName}`] || 0,
      isAutoRouter: provider === "auto-router",
    }));

    const sortBy = filters.sortBy;
    const mult = filters.sortOrder === "asc" ? 1 : -1;

    decorated.sort((a, b) => {
      if (a.isSelected) return -1;
      if (b.isSelected) return 1;
      if (sortBy && sortBy !== "default") {
        if (sortBy === "price_input") {
          const pa = a.model.pricingInput ? parseFloat(a.model.pricingInput) : Infinity;
          const pb = b.model.pricingInput ? parseFloat(b.model.pricingInput) : Infinity;
          if (pa !== pb) return (pa - pb) * mult;
        } else if (sortBy === "price_output") {
          const pa = a.model.pricingOutput ? parseFloat(a.model.pricingOutput) : Infinity;
          const pb = b.model.pricingOutput ? parseFloat(b.model.pricingOutput) : Infinity;
          if (pa !== pb) return (pa - pb) * mult;
        } else if (sortBy === "context") {
          const ca = a.model.contextWindow ?? 0;
          const cb = b.model.contextWindow ?? 0;
          if (ca !== cb) return (ca - cb) * mult;
        }
      }
      if (a.usage !== b.usage) return b.usage - a.usage;
      if (a.isAutoRouter && !b.isAutoRouter) return -1;
      if (!a.isAutoRouter && b.isAutoRouter) return 1;
      return a.model.displayName.localeCompare(b.model.displayName);
    });

    const sorted = decorated.map(({ provider, model }) => ({ provider, model }));

    const entry = decorated.find((sm) => sm.provider === selectedModelProvider && (sm.model.apiName === selectedModelName || sm.model.apiName.endsWith(`::${selectedModelName}`)));
    const apiName = entry ? entry.model.apiName : ((selectedModelName ?? "") as string);

    return { sortedModels: sorted, filteredCount: filtered.length, totalCount: totalModelCount, availableProvidersForPanel: panelProviders, selectedApiName: apiName };
    // Deps primitivas (selectedModelName/Provider) en vez del objeto selectedModel,
    // que cambia de identidad en cada render de settings e invalidaba este memo.
  }, [allModels, searchLower, search, filters, stats, selectedModelName, selectedModelProvider, customProviders]);

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

  // Popover controlado para poder montar el panel de filtros SOLO cuando está
  // abierto. Antes: `rightPanel` se instanciaba en cada render (aunque el popover
  // estuviera cerrado) → 3 sliders custom + Select Radix + chips de providers,
  // trabajo tirado a la basura. Ahora: cerrado = null, abierto = panel.
  const [pickerOpen, setPickerOpen] = useState(false);

  const rightPanel = useMemo(() => {
    if (!pickerOpen) return null;
    return (
      <ModelFiltersPanel
        filters={filters}
        onChange={setFilters}
        availableProviders={availableProvidersForPanel}
        filteredCount={filteredCount}
        totalCount={totalCount}
      />
    );
  }, [pickerOpen, filters, setFilters, availableProvidersForPanel, filteredCount, totalCount]);

  const modelDisplayName = useMemo(() => {
    const found = (allModels || []).find((m: any) => m.sourceProvider === selectedModelProvider && (m.apiName === selectedModelName || (m.apiName as string).endsWith(`::${selectedModelName}`)));
    return found ? (found as any).displayName : selectedModelName;
  }, [allModels, selectedModelName, selectedModelProvider]);

  // Guard DESPUÉS de todos los hooks (ver nota arriba): settings llega async y
  // un return temprano antes de los useMemo rompería el orden de hooks.
  if (!settings) return null;

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
      open={pickerOpen}
      onOpenChange={setPickerOpen}
    />
  );
}
