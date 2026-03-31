import { useSettings } from "@/hooks/useSettings";
import { useLanguageModelsForProvider } from "@/hooks/useLanguageModelsForProvider";
import { SettingsModelSelector } from "../SettingsModelSelector";
import { DEFAULT_STANDARD_MODEL } from "@/lib/schemas";

const DEFAULT_MODEL = DEFAULT_STANDARD_MODEL;

/**
 * Single selector for "Modo Estándar" tasks.
 * Uses the unified `standardModeModel` key.
 * Applies to: app titles, debate summaries, todo analysis.
 */
export function StandardModeModelSelector() {
    const { settings, updateSettings } = useSettings();
    const { data: openRouterModels, isLoading } =
        useLanguageModelsForProvider("openrouter");

    const currentValue =
        !settings?.standardModeModel || settings?.standardModeModel === ""
            ? DEFAULT_MODEL
            : settings?.standardModeModel;

    const handleChange = async (value: string) => {
        await updateSettings(
            { standardModeModel: value },
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
                        defaultModelInList?.displayName || "Gemini 2.5 Flash Lite (recomendado)",
                    description: defaultModelInList ? undefined : "Modelo predeterminado",
                },
            ]}
        />
    );
}
