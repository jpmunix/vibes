import { useSettings } from "@/hooks/useSettings";
import { useLanguageModelsForProvider } from "@/hooks/useLanguageModelsForProvider";
import { SettingsModelSelector } from "./SettingsModelSelector";
import { FALLBACK_STANDARD_MODEL } from "@/ipc/shared/language_model_constants";

const SAME_AS_CHAT_VALUE = "__SAME_AS_CHAT__";
const DEFAULT_MODEL = FALLBACK_STANDARD_MODEL;

export function TodoAnalysisModelSelector() {
  const { settings, updateSettings } = useSettings();
  const { data: openRouterModels, isLoading } =
    useLanguageModelsForProvider("openrouter");

  const currentValue =
    settings?.todoAnalysisModel === "SAME_AS_CHAT" ||
      !settings?.todoAnalysisModel ||
      settings?.todoAnalysisModel === ""
      ? SAME_AS_CHAT_VALUE
      : settings?.todoAnalysisModel;

  const handleChange = async (value: string) => {
    if (value === SAME_AS_CHAT_VALUE) {
      await updateSettings({ todoAnalysisModel: "SAME_AS_CHAT" }, { showToast: true });
    } else {
      await updateSettings({ todoAnalysisModel: value }, { showToast: true });
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

