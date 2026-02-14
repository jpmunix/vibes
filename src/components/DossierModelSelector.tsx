import { useSettings } from "@/hooks/useSettings";
import { useLanguageModelsForProvider } from "@/hooks/useLanguageModelsForProvider";
import { SettingsModelSelector } from "./SettingsModelSelector";

const DEFAULT_VALUE = "google/gemini-3-flash-preview";

export function DossierModelSelector() {
    const { settings, updateSettings } = useSettings();
    const { data: openRouterModels, isLoading } =
        useLanguageModelsForProvider("openrouter");

    const currentValue =
        !settings?.dossierModel || settings?.dossierModel === ""
            ? DEFAULT_VALUE
            : settings?.dossierModel;

    const handleChange = async (value: string) => {
        await updateSettings({ dossierModel: value });
    };

    const defaultModelInList = openRouterModels?.find(
        (m) => m.apiName === DEFAULT_VALUE,
    );

    return (
        <SettingsModelSelector
            selectedModel={currentValue}
            onModelSelect={handleChange}
            models={(openRouterModels || []).filter(
                (m) => m.apiName !== DEFAULT_VALUE,
            )}
            loading={isLoading}
            placeholder="Selecciona un modelo"
            specialOptions={[
                {
                    value: DEFAULT_VALUE,
                    label:
                        defaultModelInList?.displayName ||
                        "Gemini 3 Flash (recomendado)",
                    description: defaultModelInList
                        ? undefined
                        : "Modelo predeterminado",
                },
            ]}
        />
    );
}
