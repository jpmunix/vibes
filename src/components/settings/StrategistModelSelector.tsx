import { useSettings } from "@/hooks/useSettings";
import { useLanguageModelsForProvider } from "@/hooks/useLanguageModelsForProvider";
import { SettingsModelSelector } from "../SettingsModelSelector";
import { DEFAULT_STRATEGIST_MODEL } from "@/lib/schemas";

const DEFAULT_MODEL = DEFAULT_STRATEGIST_MODEL;

/**
 * Selector for the "Modelo Estratega" — reasoning agents (plan, explore, general).
 * Uses the `strategistModel` settings key.
 */
export function StrategistModelSelector() {
    const { settings, updateSettings } = useSettings();
    const { data: openRouterModels, isLoading } =
        useLanguageModelsForProvider("openrouter");

    const currentValue =
        !settings?.strategistModel || settings?.strategistModel === ""
            ? DEFAULT_MODEL
            : settings?.strategistModel;

    const handleChange = async (value: string) => {
        await updateSettings(
            { strategistModel: value },
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
                        defaultModelInList?.displayName || "DeepSeek V4 Flash (recomendado)",
                    description: defaultModelInList ? undefined : "Modelo predeterminado",
                },
            ]}
        />
    );
}
