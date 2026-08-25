import { useSettings } from "@/hooks/useSettings";
import { useI18n } from "@/lib/i18n";
import { useMultiProviderModels } from "@/hooks/useMultiProviderModels";
import { ModelSelector } from "../unified/ModelSelector";

const DEFAULT_MODEL = "google/gemini-3-flash-preview";

/**
 * Model selector for the memory Router (selection/classification).
 * Uses an ultralight model by default — the task is pure classification.
 * Uses the full OpenRouter model list — no hardcoded special options.
 * Default (`google/gemini-3-flash-preview`) only applies when the setting has never been set.
 */
export function MemorySelectionModelSelector() {
  const { settings, updateSettings } = useSettings();
  const { t } = useI18n();
  const { data: allModels, isLoading } = useMultiProviderModels();

  const currentValue =
    !settings?.memoriesRouterModelV2 || settings?.memoriesRouterModelV2 === ""
      ? DEFAULT_MODEL
      : settings?.memoriesRouterModelV2;

  const handleChange = async (value: string) => {
    await updateSettings({ memoriesRouterModelV2: value }, { showToast: true });
  };

  return (
    <ModelSelector
      variant="pillSoft"
      value={currentValue}
      onChange={handleChange}
      models={allModels || []}
      loading={isLoading}
      placeholder={t("common.selectModel")}
      disableEnabledFilter
      showProviderBadge
    />
  );
}
