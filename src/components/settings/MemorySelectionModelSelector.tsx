import { useSettings } from "@/hooks/useSettings";
import { useLanguageModelsForProvider } from "@/hooks/useLanguageModelsForProvider";
import { SettingsModelSelector } from "../SettingsModelSelector";

const DEFAULT_MODEL = "google/gemini-2.5-flash-lite-preview";

/**
 * Model selector for the memory Router (selection/classification).
 * Uses an ultralight model by default — the task is pure classification.
 */
export function MemorySelectionModelSelector() {
    const { settings, updateSettings } = useSettings();
    const { data: openRouterModels, isLoading } =
        useLanguageModelsForProvider("openrouter");

    const currentValue =
        !settings?.memoriesRouterModel || settings?.memoriesRouterModel === ""
            ? DEFAULT_MODEL
            : settings?.memoriesRouterModel;

    const handleChange = async (value: string) => {
        await updateSettings(
            { memoriesRouterModel: value },
            { showToast: true },
        );
    };

    const defaultModelInList = openRouterModels?.find(
        (m) => m.apiName === DEFAULT_MODEL,
    );

    return (
        <SettingsModelSelector
            variant="pill"
            selectedModel={currentValue}
            onModelSelect={handleChange}
            models={(openRouterModels || []).filter(
                (m) => m.apiName !== DEFAULT_MODEL,
            )}
            loading={isLoading}
            placeholder="Selecciona un modelo"
            disableEnabledFilter
            specialOptions={[
                {
                    value: DEFAULT_MODEL,
                    label:
                        defaultModelInList?.displayName || "Gemini 2.5 Flash Lite",
                    description: defaultModelInList ? undefined : "Modelo ultraligero para clasificación",
                },
            ]}
        />
    );
}
