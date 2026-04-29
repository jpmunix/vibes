import { useSettings } from "@/hooks/useSettings";
import { useLanguageModelsForProvider } from "@/hooks/useLanguageModelsForProvider";
import { SettingsModelSelector } from "../SettingsModelSelector";

const DEFAULT_MODEL = "google/gemini-2.5-flash";

/**
 * Model selector for the memory synthesis (generator) pipeline.
 * Same pattern as StandardModeModelSelector but writes to `memoriesSynthesisModelV2`.
 */
export function MemoryExtractionModelSelector() {
    const { settings, updateSettings } = useSettings();
    const { data: openRouterModels, isLoading } =
        useLanguageModelsForProvider("openrouter");

    const currentValue =
        !settings?.memoriesSynthesisModelV2 || settings?.memoriesSynthesisModelV2 === ""
            ? DEFAULT_MODEL
            : settings?.memoriesSynthesisModelV2;

    const handleChange = async (value: string) => {
        await updateSettings(
            { memoriesSynthesisModelV2: value },
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
                        defaultModelInList?.displayName || "Gemini 2.5 Flash",
                    description: defaultModelInList ? undefined : "Modelo predeterminado",
                },
            ]}
        />
    );
}
