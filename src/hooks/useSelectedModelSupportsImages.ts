import { useSettings } from "@/hooks/useSettings";
import { useLanguageModelsByProviders } from "@/hooks/useLanguageModelsByProviders";
import { useMemo } from "react";

export function useSelectedModelSupportsImages(): boolean {
  const { settings } = useSettings();
  // We use the language models hook to get the latest cached list
  const { data: modelsByProviders } = useLanguageModelsByProviders();

  return useMemo(() => {
    if (!settings || !settings.selectedModel || !modelsByProviders) return true;

    const selectedProvider = settings.selectedModel.provider;
    const selectedModelName = settings.selectedModel.name;

    const providerModels = modelsByProviders[selectedProvider];
    if (!providerModels) return true;
    
    // Check if it's a custom model first
    const customFoundModel = providerModels.find(
      (m) => m.type === "custom" && m.id === settings.selectedModel.customModelId
    );
    const model = customFoundModel || providerModels.find((m) => m.apiName === selectedModelName);

    if (model?.inputModalities) {
      return model.inputModalities.includes("image");
    }

    // Default to true for models that don't explicitly specify their modalities.
    return true;
  }, [settings?.selectedModel, modelsByProviders]);
}
