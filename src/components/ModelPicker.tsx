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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { useEffect, useState } from "react";
import { useLocalModels } from "@/hooks/useLocalModels";
import { useLocalLMSModels } from "@/hooks/useLMStudioModels";
import { useLanguageModelsByProviders } from "@/hooks/useLanguageModelsByProviders";

import { LocalModel } from "@/ipc/types";
import { useLanguageModelProviders } from "@/hooks/useLanguageModelProviders";
import { useSettings } from "@/hooks/useSettings";
import { PriceBadge } from "@/components/PriceBadge";
import { BrainBadge } from "@/components/BrainBadge";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

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

  const {
    data: providers,
    isLoading: providersLoading,
    isProviderSetup,
  } = useLanguageModelProviders();

  const loading = modelsByProvidersLoading || providersLoading;
  // Ollama Models Hook
  const {
    models: ollamaModels,
    error: ollamaError,
    loadModels: loadOllamaModels,
  } = useLocalModels();

  // LM Studio Models Hook
  const {
    models: lmStudioModels,
    error: lmStudioError,
    loadModels: loadLMStudioModels,
  } = useLocalLMSModels();

  const isOllamaSetup = ollamaModels.length > 0 && !ollamaError;
  const isLMStudioSetup = lmStudioModels.length > 0 && !lmStudioError;

  // Load models when the dropdown opens
  useEffect(() => {
    if (open) {
      loadOllamaModels();
      loadLMStudioModels();
    }
  }, [open, loadOllamaModels, loadLMStudioModels]);

  // Get display name for the selected model
  const getModelDisplayName = () => {
    if (selectedModel.provider === "ollama") {
      return (
        ollamaModels.find(
          (model: LocalModel) => model.modelName === selectedModel.name,
        )?.displayName || selectedModel.name
      );
    }
    if (selectedModel.provider === "lmstudio") {
      return (
        lmStudioModels.find(
          (model: LocalModel) => model.modelName === selectedModel.name,
        )?.displayName || selectedModel.name // Fallback to path if not found
      );
    }

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
  const providerEntries =
    !loading && modelsByProviders
      ? Object.entries(modelsByProviders).filter(
          ([providerId]) => providerId !== "auto",
        )
      : [];
  const primaryProviders = providerEntries.filter(([providerId, models]) => {
    if (models.length === 0) return false;
    const provider = providers?.find((p) => p.id === providerId);
    return !(provider && provider.secondary);
  });
  // if (settings && isDyadProEnabled(settings)) {
  //   primaryProviders.unshift(["auto", TURBO_MODELS]);
  // }
  const secondaryProviders = providerEntries.filter(([providerId, models]) => {
    if (models.length === 0) return false;
    const provider = providers?.find((p) => p.id === providerId);
    return !!(provider && provider.secondary);
  });

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
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{modelDisplayName}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        className="w-64"
        align="start"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {/* OpenRouter models only */}
        {!isTrial &&
          (loading ? (
            <div className="text-xs text-center py-2 text-muted-foreground">
              Cargando modelos...
            </div>
          ) : !modelsByProviders ||
            !modelsByProviders["openrouter"] ||
            modelsByProviders["openrouter"].length === 0 ? (
            <div className="text-xs text-center py-2 text-muted-foreground">
              No hay modelos de OpenRouter disponibles
            </div>
          ) : (
            /* OpenRouter models loaded */
            <>
              <DropdownMenuLabel>Modelos de OpenRouter</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {modelsByProviders["openrouter"]
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
                        className={
                          selectedModel.provider === "openrouter" &&
                          selectedModel.name === model.apiName
                            ? "bg-secondary"
                            : ""
                        }
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
                        <div className="flex justify-between items-start w-full gap-1">
                          <span className="flex-1">{model.displayName}</span>
                          <div className="flex items-center gap-1">
                            <PriceBadge dollarSigns={model.dollarSigns} />
                            <BrainBadge brainSigns={model.brainSigns} />
                            {model.tag && (
                              <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">
                                {model.tag}
                              </span>
                            )}
                          </div>
                        </div>
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
