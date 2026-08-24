import { useSettings } from "@/hooks/useSettings";
import { useI18n } from "@/lib/i18n";
import { useMultiProviderModels } from "@/hooks/useMultiProviderModels";
import { SettingsModelSelector } from "../SettingsModelSelector";
import {
  DEFAULT_STRATEGIST_MODEL,
  MODEL_PROVIDER_SEPARATOR,
} from "@/lib/schemas";

const DEFAULT_MODEL = DEFAULT_STRATEGIST_MODEL;

/**
 * Selector for the "Modelo Estratega" — used for background/auxiliary tasks
 * (titles, summaries, compaction, mockups).
 * The main chat model for all modes (agent, plan, ask) is controlled by
 * the global ModelPicker in the chat input area.
 *
 * v2: Shows models from ALL providers (OpenRouter + Ollama).
 */
export function StrategistModelSelector() {
  const { settings, updateSettings } = useSettings();
  const { t } = useI18n();
  const { data: allModels, isLoading } = useMultiProviderModels();

  const currentValue =
    !settings?.strategistModel || settings?.strategistModel === ""
      ? DEFAULT_MODEL
      : settings?.strategistModel;

  const handleChange = async (value: string) => {
    await updateSettings({ strategistModel: value }, { showToast: true });
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
      placeholder={t("common.selectModel")}
      disableEnabledFilter
      showProviderBadge
      specialOptions={[
        {
          value: DEFAULT_MODEL,
          label:
            defaultModelInList?.displayName ||
            t("addModel.strategistLabel"),
          description: defaultModelInList ? undefined : t("addModel.defaultModel"),
        },
      ]}
    />
  );
}
