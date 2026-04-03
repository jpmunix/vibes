import { type LargeLanguageModel } from "@/lib/schemas";
import { type LanguageModel } from "@/ipc/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState, useRef } from "react";
import { Search } from "lucide-react";
import { useLanguageModelsByProviders } from "@/hooks/useLanguageModelsByProviders";

import { useLanguageModelProviders } from "@/hooks/useLanguageModelProviders";
import { useSettings } from "@/hooks/useSettings";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { AutoRouterBadge } from "@/components/AutoRouterBadge";
import { ModelItemContent } from "@/components/ModelItemContent";
import { ModelInfoDialog } from "@/components/ModelInfoDialog";
import { DEFAULT_ENABLED_MODELS } from "@/ipc/shared/language_model_constants";
import { useModelUsageStats } from "@/hooks/useModelUsageStats";

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

  const [open, setOpen] = useState(false);
  const [infoModel, setInfoModel] = useState<LanguageModel | null>(null);

  const infoModelRef = useRef<LanguageModel | null>(null);
  infoModelRef.current = infoModel;

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
  const modelDisplayName = getModelDisplayName();

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
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            className="flex items-center justify-between !h-6 w-fit max-w-[200px] px-1.5 py-0 text-xs-sm font-medium rounded-md shadow-none gap-0.5 border border-input bg-transparent hover:bg-muted/50 focus:bg-muted/50 transition-colors cursor-pointer"
          >
            <span className="truncate flex-1 text-left">{modelDisplayName}</span>
            <div className="flex items-center gap-0.5 ml-1.5 text-muted-foreground">
              {selectedModel.provider === "auto-router" &&
                selectedModel.name === "auto" && <AutoRouterBadge />}
            </div>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-[320px] max-h-[320px] overflow-y-auto overflow-x-hidden"
          align="start"
          side="top"
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            setSearch("");
          }}
          onInteractOutside={(e) => {
            if (infoModelRef.current) e.preventDefault();
          }}
          onFocusOutside={(e) => {
            if (infoModelRef.current) e.preventDefault();
          }}
        >
          <div className="sticky top-0 -mt-1 -mx-1 p-2 bg-popover/90 backdrop-blur-md z-10 border-b border-border/40 mb-1 rounded-t-md">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
              <input
                type="text"
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md border border-input bg-background/50 outline-none focus:border-primary transition-colors focus:ring-1 focus:ring-primary/20"
                placeholder="Buscar modelos..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                autoFocus
              />
            </div>
          </div>

          {!isTrial &&
            (loading ? (
              <div className="text-xs text-center py-2 text-muted-foreground">
                Cargando modelos...
              </div>
            ) : !modelsByProviders ||
              (!modelsByProviders["openrouter"] &&
                !modelsByProviders["auto-router"]) ? (
              <div className="text-xs text-center py-2 text-muted-foreground">
                No hay modelos disponibles
              </div>
            ) : (
              /* Models loaded */
              <>
                {sortedModels.map(({ provider, model }) => {
                  const isSelected =
                    selectedModel.provider === provider &&
                    selectedModel.name === model.apiName;
                  const customModelId =
                    model.type === "custom" ? model.id : undefined;

                  const isEnabled = provider === "openrouter" && 
                     (settings.enabledOpenRouterModels ?? DEFAULT_ENABLED_MODELS).includes(model.apiName);
                  const isRemovable = provider === "openrouter" && !isEnabled && !isSelected;

                  return (
                    <DropdownMenuItem
                      key={`${provider}-${model.apiName}`}
                      className={`py-1.5 px-3 cursor-pointer ${isSelected ? "bg-secondary" : ""
                        }`}
                      onSelect={(e) => {
                        // Let Radix handle the event default since we also use setOpen(false) manually.
                        onModelSelect({
                          name: model.apiName,
                          provider: provider as any,
                          customModelId,
                        });
                        setOpen(false);
                      }}
                    >
                      <ModelItemContent
                        model={model}
                        showAutoRouterBadge={provider === "auto-router"}
                        isAutoRouter={provider === "auto-router"}
                        onInfoClick={setInfoModel}
                        onRemoveClick={isRemovable ? (m) => removeUsage(`${provider}:${m.apiName}`) : undefined}
                      />
                    </DropdownMenuItem>
                  );
                })}
              </>
            ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {infoModel && (
        <ModelInfoDialog
          open={!!infoModel}
          onOpenChange={(open) => !open && setInfoModel(null)}
          model={infoModel}
          isAutoRouter={(infoModel as any).provider === "auto-router"}
        />
      )}
    </>
  );
}
