import { useSettings } from "@/hooks/useSettings";
import { useLanguageModelsForProvider } from "@/hooks/useLanguageModelsForProvider";
import { SettingsModelSelector } from "./SettingsModelSelector";

const SAME_AS_CHAT_VALUE = "__SAME_AS_CHAT__";

export function TurboEditModelSelector() {
  const { settings, updateSettings } = useSettings();
  const { data: openRouterModels, isLoading } =
    useLanguageModelsForProvider("openrouter");

  const currentValue =
    settings?.turboEditModel === "SAME_AS_CHAT" ||
      !settings?.turboEditModel ||
      settings?.turboEditModel === ""
      ? SAME_AS_CHAT_VALUE
      : settings?.turboEditModel;

  const handleChange = async (value: string) => {
    if (value === SAME_AS_CHAT_VALUE) {
      await updateSettings({ turboEditModel: "SAME_AS_CHAT" }, { showToast: true });
    } else {
      await updateSettings({ turboEditModel: value }, { showToast: true });
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

