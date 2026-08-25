import { useSettings } from "@/hooks/useSettings";
import { useI18n } from "@/lib/i18n";
import { useMultiProviderModels } from "@/hooks/useMultiProviderModels";
import { ModelSelector } from "../unified/ModelSelector";
import { DEFAULT_STANDARD_MODEL } from "@/lib/schemas";

const DEFAULT_MODEL = DEFAULT_STANDARD_MODEL;

/**
 * Single selector for "Modo Estándar" tasks.
 * Uses the unified `standardModeModel` key.
 * Applies to: app titles, debate summaries, todo analysis.
 */
export function StandardModeModelSelector() {
  const { settings, updateSettings } = useSettings();
  const { t } = useI18n();
  const { data: allModels, isLoading } = useMultiProviderModels();

  const currentValue =
    !settings?.standardModeModel || settings?.standardModeModel === ""
      ? DEFAULT_MODEL
      : settings?.standardModeModel;

  const handleChange = async (value: string) => {
    await updateSettings({ standardModeModel: value }, { showToast: true });
  };

  const defaultModelInList = allModels?.find(
    (m) => m.apiName === DEFAULT_MODEL,
  );

  return (
    <ModelSelector
      variant="pillSoft"
      value={currentValue}
      onChange={handleChange}
      models={(allModels || []).filter(
        (m) => m.apiName !== DEFAULT_MODEL,
      )}
      loading={isLoading}
      placeholder={t("common.selectModel")}
      disableEnabledFilter
      showProviderBadge
      specialOptions={[
        {
          value: DEFAULT_MODEL,
          label:
            defaultModelInList?.displayName ||
            t("addModel.defaultModelLabel"),
          description: defaultModelInList ? undefined : t("addModel.defaultModel"),
        },
      ]}
    />
  );
}
