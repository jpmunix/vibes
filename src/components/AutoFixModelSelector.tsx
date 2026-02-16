import { useSettings } from "@/hooks/useSettings";
import { useLanguageModelsForProvider } from "@/hooks/useLanguageModelsForProvider";
import { SettingsModelSelector } from "./SettingsModelSelector";

const SAME_AS_CHAT_VALUE = "__SAME_AS_CHAT__";

export function AutoFixModelSelector() {
  const { settings, updateSettings } = useSettings();
  const { data: openRouterModels, isLoading } =
    useLanguageModelsForProvider("openrouter");

  const currentValue =
    settings?.autoFixModel?.name === "SAME_AS_CHAT"
      ? SAME_AS_CHAT_VALUE
      : (settings?.autoFixModel?.name ?? "");

  const handleChange = async (value: string) => {
    if (value === SAME_AS_CHAT_VALUE) {
      await updateSettings({
        autoFixModel: {
          name: "SAME_AS_CHAT",
          provider: "openrouter",
        },
      }, { showToast: true });
    } else {
      await updateSettings({
        autoFixModel: {
          name: value,
          provider: "openrouter",
        },
      }, { showToast: true });
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

