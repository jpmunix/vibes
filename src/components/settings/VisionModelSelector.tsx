import { useSettings } from "@/hooks/useSettings";
import { useI18n } from "@/lib/i18n";
import { useMultiProviderModels } from "@/hooks/useMultiProviderModels";
import { ModelSelector } from "../unified/ModelSelector";

const DEFAULT_MODEL = "google/gemini-2.5-flash";

export function VisionModelSelector() {
  const { settings, updateSettings } = useSettings();
  const { t } = useI18n();
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
    <ModelSelector
      variant="pillSoft"
      value={currentValue}
      onChange={handleChange}
      models={filteredModels}
      loading={isLoading}
      placeholder={t("common.selectModel")}
      disableEnabledFilter
      showProviderBadge
      specialOptions={[
        {
          value: DEFAULT_MODEL,
          label:
            defaultModelInList?.displayName ||
            "Gemini 2.5 Flash",
          description: defaultModelInList ? undefined : t("addModel.defaultModel"),
        },
      ]}
    />
  );
}
