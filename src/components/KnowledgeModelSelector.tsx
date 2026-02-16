import { useSettings } from "@/hooks/useSettings";
import { useLanguageModelsForProvider } from "@/hooks/useLanguageModelsForProvider";
import { SettingsModelSelector } from "./SettingsModelSelector";

const DEFAULT_VALUE = "openai/gpt-4.1-mini";

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
                    label: defaultModelInList?.displayName || "GPT-4.1 Mini (recomendado)",
                    description: defaultModelInList ? undefined : "Modelo predeterminado",
                },
            ]}
        />
    );
}

