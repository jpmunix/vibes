import { useSettings } from "@/hooks/useSettings";
import { useLanguageModelsForProvider } from "@/hooks/useLanguageModelsForProvider";
import { SettingsModelSelector } from "../SettingsModelSelector";

const SAME_AS_CHAT_VALUE = "__SAME_AS_CHAT__";

export function SummaryModelSelector() {
  const { settings, updateSettings } = useSettings();
  const { data: openRouterModels, isLoading } =
    useLanguageModelsForProvider("openrouter");

  const currentValue =
    settings?.summaryModel === "SAME_AS_CHAT" ||
      !settings?.summaryModel ||
      settings?.summaryModel === ""
      ? SAME_AS_CHAT_VALUE
      : settings?.summaryModel;

  const handleChange = async (value: string) => {
    if (value === SAME_AS_CHAT_VALUE) {
      await updateSettings({ summaryModel: "SAME_AS_CHAT" });
    } else {
      await updateSettings({ summaryModel: value });
    }
  };

  return (
    <SettingsModelSelector
      selectedModel={currentValue}
      onModelSelect={handleChange}
      models={openRouterModels || []}
      loading={isLoading}
      placeholder="Selecciona un modelo"
      specialOptions={[
        {
          value: SAME_AS_CHAT_VALUE,
          label: "El mismo del chat",
          description: "Sigue la selección principal del chat",
        },
      ]}
    />
  );
}

