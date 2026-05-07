import { useSettings } from "@/hooks/useSettings";
import { useLanguageModelsByProviders } from "@/hooks/useLanguageModelsByProviders";
import { useMemo } from "react";
import { DEFAULT_STRATEGIST_MODEL } from "@/lib/schemas";

/**
 * Returns whether the *effective* model for the current chat mode supports image inputs.
 *
 * - In **plan** / **ask** mode the effective model is `strategistModel` (OpenRouter).
 * - In **agent** / other modes the effective model is `selectedModel` (any provider).
 *
 * Also exposes `isStrategistMode` so consumers can craft targeted warning messages.
 */
export function useSelectedModelSupportsImages(): boolean {
  const { settings } = useSettings();
  // We use the language models hook to get the latest cached list
  const { data: modelsByProviders } = useLanguageModelsByProviders();

  return useMemo(() => {
    if (!settings || !modelsByProviders) return true;

    const mode = settings.selectedChatMode || "agent";
    const isStrategistMode = mode === "plan" || mode === "ask";

    if (isStrategistMode) {
      // ── Strategist path (plan / ask) ─────────────────────────────
      const strategistName = settings.strategistModel || DEFAULT_STRATEGIST_MODEL;
      const openRouterModels = modelsByProviders["openrouter"];
      if (!openRouterModels) return true; // models not loaded yet

      const model = openRouterModels.find((m) => m.apiName === strategistName);
      if (model?.inputModalities) {
        return model.inputModalities.includes("image");
      }
      // Default to true for models that don't explicitly specify their modalities.
      return true;
    }

    // ── Agent / default path ─────────────────────────────────────
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
  }, [settings?.selectedModel, settings?.selectedChatMode, settings?.strategistModel, modelsByProviders]);
}

/**
 * Returns `true` when the current chat mode routes through the strategist model
 * (plan or ask). Useful for crafting targeted warning messages.
 */
export function useIsStrategistMode(): boolean {
  const { settings } = useSettings();
  const mode = settings?.selectedChatMode || "agent";
  return mode === "plan" || mode === "ask";
}
