import { useSettings } from "@/hooks/useSettings";
import { useMultiProviderModels } from "@/hooks/useMultiProviderModels";
import { SettingsModelSelector } from "../SettingsModelSelector";

const DEFAULT_MODEL = "google/gemini-2.5-flash";

export function VisionModelSelector() {
  const { settings, updateSettings } = useSettings();
  const { data: allModels, isLoading } = useMultiProviderModels();

  const currentValue =
    !settings?.visionPreprocessorModel || settings?.visionPreprocessorModel === ""
      ? DEFAULT_MODEL
      : settings?.visionPreprocessorModel;

  const handleChange = async (value: string) => {
    await updateSettings({ visionPreprocessorModel: value }, { showToast: true });
  };

  const defaultModelInList = allModels?.find(
    (m) => m.apiName === DEFAULT_MODEL,
  );

  const filteredModels = (allModels || []).filter(
    (m) => m.apiName !== DEFAULT_MODEL,
  );

  return (
    <SettingsModelSelector
      variant="pill"
      selectedModel={currentValue}
      onModelSelect={handleChange}
      models={filteredModels}
      loading={isLoading}
      placeholder="Selecciona un modelo"
      disableEnabledFilter
      showProviderBadge
      specialOptions={[
        {
          value: DEFAULT_MODEL,
          label:
            defaultModelInList?.displayName ||
            "Gemini 2.5 Flash",
          description: defaultModelInList ? undefined : "Modelo predeterminado",
        },
      ]}
    />
  );
}
