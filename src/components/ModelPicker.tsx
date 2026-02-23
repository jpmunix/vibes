import { isDyadProEnabled, type LargeLanguageModel } from "@/lib/schemas";
import { type LanguageModel } from "@/ipc/types";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { useLanguageModelsByProviders } from "@/hooks/useLanguageModelsByProviders";

import { useLanguageModelProviders } from "@/hooks/useLanguageModelProviders";
import { useSettings } from "@/hooks/useSettings";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { AutoRouterBadge } from "@/components/AutoRouterBadge";
import { ModelItemContent } from "@/components/ModelItemContent";
import { ModelInfoDialog } from "@/components/ModelInfoDialog";
import { DEFAULT_ENABLED_MODELS } from "@/ipc/shared/language_model_constants";

export function ModelPicker() {
  const { settings, updateSettings } = useSettings();
  const queryClient = useQueryClient();
  const isTrial = false;
  const onModelSelect = (model: LargeLanguageModel) => {
    updateSettings({ selectedModel: model });
    // Invalidate token count when model changes since different models have different context windows
    // (technically they have different tokenizers, but we don't keep track of that).
    queryClient.invalidateQueries({ queryKey: queryKeys.tokenCount.all });
  };

  const [open, setOpen] = useState(false);
  const [infoModel, setInfoModel] = useState<LanguageModel | null>(null);

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

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center justify-between !h-6 w-fit max-w-[200px] px-1.5 py-0 text-xs-sm font-medium rounded-md shadow-none gap-0.5 border border-input bg-transparent hover:bg-muted/50 focus:bg-muted/50 transition-colors"
              >
                <span className="truncate flex-1 text-left">{modelDisplayName}</span>
                <div className="flex items-center gap-0.5 ml-1.5 text-muted-foreground">
                  {selectedModel.provider === "auto-router" &&
                    selectedModel.name === "auto" && <AutoRouterBadge />}
                </div>
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>{modelDisplayName}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent
          className="w-72 max-h-[280px] overflow-y-auto"
          align="start"
          side="top"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
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
                {/* Auto-Router section */}
                {modelsByProviders["auto-router"] &&
                  modelsByProviders["auto-router"].length > 0 &&
                  modelsByProviders["auto-router"].map((model) => (
                    <DropdownMenuItem
                      key={`auto-router-${model.apiName}`}
                      className={`py-1.5 px-3 cursor-pointer ${selectedModel.provider === "auto-router" &&
                        selectedModel.name === model.apiName
                        ? "bg-secondary"
                        : ""
                        }`}
                      onClick={() => {
                        onModelSelect({
                          name: model.apiName,
                          provider: "auto-router",
                        });
                        setOpen(false);
                      }}
                    >
                      <ModelItemContent
                        model={model}
                        showAutoRouterBadge
                        isAutoRouter
                        onInfoClick={setInfoModel}
                      />
                    </DropdownMenuItem>
                  ))}

                {/* Divider if both exist */}
                {modelsByProviders["auto-router"] &&
                  modelsByProviders["auto-router"].length > 0 &&
                  modelsByProviders["openrouter"] &&
                  modelsByProviders["openrouter"].length > 0 && (
                    <div className="h-px bg-border my-1 mx-1" />
                  )}

                {/* OpenRouter section */}
                {modelsByProviders["openrouter"] &&
                  modelsByProviders["openrouter"].length > 0 &&
                  (() => {
                    const enabledModels = settings.enabledOpenRouterModels ?? DEFAULT_ENABLED_MODELS;
                    return modelsByProviders["openrouter"]
                      .filter((model) => {
                        // Only show enabled models
                        if (!enabledModels.includes(model.apiName)) return false;
                        return true;
                      })
                      .map((model) => (
                        <DropdownMenuItem
                          key={`openrouter-${model.apiName}`}
                          className={`py-1.5 px-3 cursor-pointer ${selectedModel.provider === "openrouter" &&
                            selectedModel.name === model.apiName
                            ? "bg-secondary"
                            : ""
                            }`}
                          onClick={() => {
                            const customModelId =
                              model.type === "custom" ? model.id : undefined;
                            onModelSelect({
                              name: model.apiName,
                              provider: "openrouter",
                              customModelId,
                            });
                            setOpen(false);
                          }}
                        >
                          <ModelItemContent model={model} onInfoClick={setInfoModel} />
                        </DropdownMenuItem>
                      ))
                  })()}
              </>
            ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {infoModel && (
        <ModelInfoDialog
          open={!!infoModel}
          onOpenChange={(open) => !open && setInfoModel(null)}
          model={infoModel}
          isAutoRouter={infoModel.provider === "auto-router"}
        />
      )}
    </>
  );
}
