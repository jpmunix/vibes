import { useSettings } from "@/hooks/useSettings";
import { useLanguageModelsForProvider } from "@/hooks/useLanguageModelsForProvider";
import { SettingsModelSelector } from "../SettingsModelSelector";
import { FALLBACK_STANDARD_MODEL } from "@/ipc/shared/language_model_constants";

const DEFAULT_MODEL = FALLBACK_STANDARD_MODEL;

/**
 * Single selector for "Modo Pro" tasks.
 * Uses the unified `proModeModel` key.
 * Applies to: debates, knowledge extraction.
 */
export function ProModeModelSelector() {
    const { settings, updateSettings } = useSettings();
    const { data: openRouterModels, isLoading } =
        useLanguageModelsForProvider("openrouter");

    const currentValue =
        !settings?.proModeModel || settings?.proModeModel === ""
            ? DEFAULT_MODEL
            : settings?.proModeModel;

    const handleChange = async (value: string) => {
        await updateSettings(
            { proModeModel: value },
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
            specialOptions={[
                {
                    value: DEFAULT_MODEL,
                    label:
                        defaultModelInList?.displayName ||
                        "Gemini 3 Flash (recomendado)",
                    description: defaultModelInList ? undefined : "Modelo predeterminado",
                },
            ]}
        />
    );
}
