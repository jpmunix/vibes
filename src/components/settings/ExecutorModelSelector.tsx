import { useSettings } from "@/hooks/useSettings";
import { useLanguageModelsForProvider } from "@/hooks/useLanguageModelsForProvider";
import { SettingsModelSelector } from "../SettingsModelSelector";
import { DEFAULT_EXECUTOR_MODEL } from "@/lib/schemas";

const DEFAULT_MODEL = DEFAULT_EXECUTOR_MODEL;

/**
 * Selector for the "Modelo Ejecutor" — lightweight tasks (titles, summaries,
 * compaction, mockups, commit messages, etc.).
 * Uses the `executorModel` settings key.
 */
export function ExecutorModelSelector() {
    const { settings, updateSettings } = useSettings();
    const { data: openRouterModels, isLoading } =
        useLanguageModelsForProvider("openrouter");

    const currentValue =
        !settings?.executorModel || settings?.executorModel === ""
            ? DEFAULT_MODEL
            : settings?.executorModel;

    const handleChange = async (value: string) => {
        await updateSettings(
            { executorModel: value },
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
                        defaultModelInList?.displayName || "Gemini 2.5 Flash Lite (recomendado)",
                    description: defaultModelInList ? undefined : "Modelo predeterminado",
                },
            ]}
        />
    );
}
