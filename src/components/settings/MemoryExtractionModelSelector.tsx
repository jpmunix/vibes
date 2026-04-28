import { useSettings } from "@/hooks/useSettings";
import { useLanguageModelsForProvider } from "@/hooks/useLanguageModelsForProvider";
import { SettingsModelSelector } from "../SettingsModelSelector";

const DEFAULT_MODEL = "google/gemini-3.1-flash-lite-preview";

/**
 * Model selector for the memory extraction pipeline.
 * Same pattern as StandardModeModelSelector but writes to `memoriesExtractionModel`.
 */
export function MemoryExtractionModelSelector() {
    const { settings, updateSettings } = useSettings();
    const { data: openRouterModels, isLoading } =
        useLanguageModelsForProvider("openrouter");

    const currentValue =
        !settings?.memoriesExtractionModel || settings?.memoriesExtractionModel === ""
            ? DEFAULT_MODEL
            : settings?.memoriesExtractionModel;

    const handleChange = async (value: string) => {
        await updateSettings(
            { memoriesExtractionModel: value },
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
                        defaultModelInList?.displayName || "Gemini 3.1 Flash Lite (recomendado)",
                    description: defaultModelInList ? undefined : "Modelo predeterminado",
                },
            ]}
        />
    );
}
