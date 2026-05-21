import { useSettings } from "@/hooks/useSettings";
import { useLanguageModelsByProviders } from "@/hooks/useLanguageModelsByProviders";
import { useMemo } from "react";

/**
 * Returns whether the currently selected model supports image inputs.
 *
 * Always checks `selectedModel` — the same model is used for all chat modes
 * (agent, plan, ask).
 */
export function useSelectedModelSupportsImages(): boolean {
  const { settings } = useSettings();
  const { data: modelsByProviders } = useLanguageModelsByProviders();

  return useMemo(() => {
    if (!settings || !modelsByProviders) return true;
    if (!settings.selectedModel) return true;

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

/**
 * Returns `true` when the current chat mode is plan or ask.
 * These modes use the same selectedModel but have different agent behavior
 * (restricted tools, read-only, etc.).
 */
export function useIsStrategistMode(): boolean {
  const { settings } = useSettings();
  const mode = settings?.selectedChatMode || "agent";
  return mode === "plan" || mode === "ask";
}
