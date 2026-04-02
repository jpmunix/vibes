import { useSettings } from "@/hooks/useSettings";
import { useLanguageModelsForProvider } from "@/hooks/useLanguageModelsForProvider";
import { SettingsModelSelector } from "./SettingsModelSelector";
import { FALLBACK_PRO_MODEL } from "@/ipc/shared/language_model_constants";

const DEFAULT_VALUE = FALLBACK_PRO_MODEL;

export function KnowledgeModelSelector() {
    const { settings, updateSettings } = useSettings();
    const { data: openRouterModels, isLoading } =
        useLanguageModelsForProvider("openrouter");

    const currentValue =
        !settings?.knowledgeExtractionModel ||
            settings?.knowledgeExtractionModel === ""
            ? DEFAULT_VALUE
            : settings?.knowledgeExtractionModel;

    const handleChange = async (value: string) => {
        await updateSettings({ knowledgeExtractionModel: value }, { showToast: true });
    };

    // Check if default model is in the list
    const defaultModelInList = openRouterModels?.find(m => m.apiName === DEFAULT_VALUE);

    return (
        <SettingsModelSelector
            size="md"
            selectedModel={currentValue}
            onModelSelect={handleChange}
            models={(openRouterModels || []).filter(m => m.apiName !== DEFAULT_VALUE)}
            loading={isLoading}
            placeholder="Selecciona un modelo"
            specialOptions={[
                {
                    value: DEFAULT_VALUE,
                    label: defaultModelInList?.displayName || "Modelo recomendado",
                    description: defaultModelInList ? undefined : "Modelo predeterminado",
                },
            ]}
        />
    );
}

