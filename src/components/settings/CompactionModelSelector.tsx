import { useSettings } from "@/hooks/useSettings";
import { useI18n } from "@/lib/i18n";
import { useMultiProviderModels } from "@/hooks/useMultiProviderModels";
import { ModelSelector } from "../unified/ModelSelector";

/** Selector del modelo provider-agnóstico usado para resumir contexto. */
export function CompactionModelSelector() {
  const { settings, updateSettings } = useSettings();
  const { t } = useI18n();
  const { data: allModels, isLoading } = useMultiProviderModels();
  const currentValue = settings?.compactionModel ?? "";

  const handleChange = async (value: string) => {
    await updateSettings({ compactionModel: value || undefined }, { showToast: true });
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
      specialOptions={[{ value: "", label: t("common.disabled") }]}
    />
  );
}
