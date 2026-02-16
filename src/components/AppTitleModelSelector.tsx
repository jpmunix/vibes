import { useSettings } from "@/hooks/useSettings";
import { useLanguageModelsForProvider } from "@/hooks/useLanguageModelsForProvider";
import { SettingsModelSelector } from "./SettingsModelSelector";

const SAME_AS_CHAT_VALUE = "__SAME_AS_CHAT__";

export function AppTitleModelSelector() {
  const { settings, updateSettings } = useSettings();
  const { data: openRouterModels, isLoading } =
    useLanguageModelsForProvider("openrouter");

  const currentValue =
    settings?.appTitleGenerationModel === "SAME_AS_CHAT" ||
      !settings?.appTitleGenerationModel ||
      settings?.appTitleGenerationModel === ""
      ? SAME_AS_CHAT_VALUE
      : settings?.appTitleGenerationModel;

  const handleChange = async (value: string) => {
    if (value === SAME_AS_CHAT_VALUE) {
      await updateSettings({ appTitleGenerationModel: "SAME_AS_CHAT" }, { showToast: true });
    } else {
      await updateSettings({ appTitleGenerationModel: value }, { showToast: true });
    }
  };

  return (
    <SettingsModelSelector
      size="md"
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

