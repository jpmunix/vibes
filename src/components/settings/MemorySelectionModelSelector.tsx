import { useSettings } from "@/hooks/useSettings";
import { useLanguageModelsForProvider } from "@/hooks/useLanguageModelsForProvider";
import { SettingsModelSelector } from "../SettingsModelSelector";

const DEFAULT_MODEL = "google/gemini-3-flash-preview";

/**
 * Model selector for the memory Router (selection/classification).
 * Uses an ultralight model by default — the task is pure classification.
 * Uses the full OpenRouter model list — no hardcoded special options.
 * Default (`google/gemini-3-flash-preview`) only applies when the setting has never been set.
 */
export function MemorySelectionModelSelector() {
    const { settings, updateSettings } = useSettings();
    const { data: openRouterModels, isLoading } =
        useLanguageModelsForProvider("openrouter");

    const currentValue =
        !settings?.memoriesRouterModelV2 || settings?.memoriesRouterModelV2 === ""
            ? DEFAULT_MODEL
            : settings?.memoriesRouterModelV2;

    const handleChange = async (value: string) => {
        await updateSettings(
            { memoriesRouterModelV2: value },
            { showToast: true },
        );
    };

    return (
        <SettingsModelSelector
            variant="pill"
            selectedModel={currentValue}
            onModelSelect={handleChange}
            models={openRouterModels || []}
            loading={isLoading}
            placeholder="Selecciona un modelo"
            disableEnabledFilter
        />
    );
}
