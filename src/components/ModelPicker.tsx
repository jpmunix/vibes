import { isDyadProEnabled, type LargeLanguageModel } from "@/lib/schemas";
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

  // Get auto provider models (if any)

  if (!settings) {
    return null;
  }
  const selectedModel = settings?.selectedModel;
  const modelDisplayName = getModelDisplayName();
  // Split providers into primary and secondary groups (excluding auto)
  // const providerEntries =
  //   !loading && modelsByProviders
  //     ? Object.entries(modelsByProviders).filter(
  //         ([providerId]) => providerId !== "auto",
  //       )
  //     : [];
  // const primaryProviders = providerEntries.filter(([providerId, models]) => {
  //   if (models.length === 0) return false;
  //   const provider = providers?.find((p) => p.id === providerId);
  //   return !(provider && provider.secondary);
  // });
  // if (settings && isDyadProEnabled(settings)) {
  //   primaryProviders.unshift(["auto", TURBO_MODELS]);
  // }
  // const secondaryProviders = providerEntries.filter(([providerId, models]) => {
  //   if (models.length === 0) return false;
  //   const provider = providers?.find((p) => p.id === providerId);
  //   return !!(provider && provider.secondary);
  // });

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-2 h-8 max-w-[290px] px-4 text-xs-sm"
            >
              <span className="truncate">{modelDisplayName}</span>
              {selectedModel.provider === "auto-router" &&
                selectedModel.name === "auto" && <AutoRouterBadge />}
            </Button>
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
                  <Tooltip key={`auto-router-${model.apiName}`}>
                    <TooltipTrigger asChild>
                      <DropdownMenuItem
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
                        />
                      </DropdownMenuItem>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      {model.description}
                    </TooltipContent>
                  </Tooltip>
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
                modelsByProviders["openrouter"]
                  .filter((model) => {
                    // Don't show free models if Dyad Pro is enabled because
                    // we will use the paid models (in Dyad Pro backend) which
                    // don't have the free limitations.
                    if (
                      isDyadProEnabled(settings) &&
                      model.apiName.endsWith(":free")
                    ) {
                      return false;
                    }
                    return true;
                  })
                  .map((model) => (
                    <Tooltip key={`openrouter-${model.apiName}`}>
                      <TooltipTrigger asChild>
                        <DropdownMenuItem
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
                          <ModelItemContent model={model} />
                        </DropdownMenuItem>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        {model.description}
                      </TooltipContent>
                    </Tooltip>
                  ))}
            </>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
