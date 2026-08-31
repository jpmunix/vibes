import { useSettings } from "@/hooks/useSettings";
import { useI18n } from "@/lib/i18n";
import { useMultiProviderModels } from "@/hooks/useMultiProviderModels";
import { ModelSelector } from "../unified/ModelSelector";

/**
 * #215: selector del modelo de respaldo (fallbackModel) del loop del agente.
 * Ajustes > Agente. Sin toggle: "Sin respaldo" es una opción del desplegable
 * (valor `undefined`), igual que hace el selector de modelo estratega.
 *
 * El label y la descripción los provee el SettingRow padre.
 *
 * El valor persistido es un string "provider::model" (mismo formato que
 * strategistModel/executorModel) o `undefined` (sin respaldo). Se resuelve a
 * ModelProvider en runtime_host al aplicar settings → runtime (hot-reload
 * sobre loopConfigMutable.fallbackModel).
 */
export function FallbackModelSelector() {
  const { settings, updateSettings } = useSettings();
  const { t } = useI18n();
  const { data: allModels, isLoading } = useMultiProviderModels();

  // "" = sin respaldo (opción por defecto del desplegable).
  const currentValue = settings?.fallbackModel ?? "";

  const handleChange = async (value: string) => {
    // "Sin respaldo" usa valor "" → persistir como undefined (sin fallback).
    await updateSettings(
      { fallbackModel: value || undefined },
      { showToast: true },
    );
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
