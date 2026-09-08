import { useState, useEffect, useCallback } from "react";
import { useAtom } from "jotai";
import { invalidModelSlotsAtom } from "@/atoms/modelValidationAtoms";
import { useSettings } from "@/hooks/useSettings";
import { useMultiProviderModels } from "@/hooks/useMultiProviderModels";
import { useLanguageModelProviders } from "@/hooks/useLanguageModelProviders";
import { ModelSelector } from "@/components/unified/ModelSelector";
import { parseModelReference } from "@/ipc/utils/model_reference";
import { ipc } from "@/ipc/types";
import { Button } from "@/components/ui/button";
import { AlertOctagon, Loader2 } from "@/components/ui/icons";
import { showSuccess, showError } from "@/lib/toast";
import { useI18n } from "@/lib/i18n";

/**
 * Modal bloqueante de reasignación de modelos (card #242).
 *
 * Se levanta cuando el validador de arranque detecta ajustes que apuntan a un
 * proveedor borrado o a un modelo inexistente. Obliga a reasignar antes de
 * poder chatear — cero reescritura automática de settings.
 */
export function ModelReassignmentModal() {
  const { t } = useI18n();
  const [invalidSlots, setInvalidSlots] = useAtom(invalidModelSlotsAtom);
  const { updateSettings } = useSettings();
  const { data: allModels, isLoading: modelsLoading } = useMultiProviderModels();
  const { isAnyProviderSetup, isLoading: providersLoading } =
    useLanguageModelProviders();

  const [slotChoices, setSlotChoices] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Inicializar selecciones vacías para cada slot roto
  useEffect(() => {
    if (invalidSlots.length > 0) {
      setSlotChoices((prev) => {
        const next = { ...prev };
        for (const slot of invalidSlots) {
          if (!next[slot.slotKey]) {
            next[slot.slotKey] = "";
          }
        }
        return next;
      });
    }
  }, [invalidSlots]);

  const handleModelChange = (slotKey: string, val: string) => {
    setSlotChoices((prev) => ({
      ...prev,
      [slotKey]: val,
    }));
  };

  const allSlotsAssigned =
    invalidSlots.length > 0 &&
    invalidSlots.every((s) => Boolean(slotChoices[s.slotKey]?.trim()));

  const handleSave = useCallback(async () => {
    if (!allSlotsAssigned) return;
    setIsSaving(true);

    // Fase 1: guardar. Un fallo aquí NO debe confundirse con "sigue inválido":
    // son dos errores distintos y el usuario merece saber cuál le ha tocado.
    try {
      const settingsPatch: Record<string, any> = {};

      for (const slot of invalidSlots) {
        const chosen = slotChoices[slot.slotKey];
        if (!chosen) continue;

        if (slot.slotKey === "selectedModel") {
          const parsed = parseModelReference(chosen);
          if (parsed) {
            settingsPatch.selectedModel = {
              name: parsed.model,
              provider: parsed.provider,
            };
          }
        } else if (slot.slotKey.startsWith("customAgent:")) {
          const agentId = parseInt(slot.slotKey.split(":")[1], 10);
          if (!isNaN(agentId)) {
            await ipc.customAgents.update({ id: agentId, model: chosen });
          }
        } else {
          settingsPatch[slot.slotKey] = chosen;
        }
      }

      if (Object.keys(settingsPatch).length > 0) {
        await updateSettings(settingsPatch);
      }
    } catch (err: any) {
      console.error("[ModelReassignment] Save failed:", err);
      showError(
        t("models.validation.saveError", {
          error: err?.message || String(err),
        }),
      );
      setIsSaving(false);
      return;
    }

    // Fase 2: revalidar contra el backend (fuente de verdad).
    try {
      const checkResult = await ipc.languageModel.checkModelSlotsValidity();
      if (checkResult.isValid) {
        setInvalidSlots([]);
        showSuccess(t("models.validation.saveSuccess"));
      } else {
        setInvalidSlots(checkResult.invalidSlots);
        showError(t("models.validation.stillInvalid"));
      }
    } catch (err: any) {
      console.error("[ModelReassignment] Revalidation failed:", err);
      showError(
        t("models.validation.saveError", {
          error: err?.message || String(err),
        }),
      );
    } finally {
      setIsSaving(false);
    }
  }, [allSlotsAssigned, invalidSlots, slotChoices, updateSettings, setInvalidSlots, t]);

  if (invalidSlots.length === 0) return null;

  // Sin ningún proveedor configurado manda el SetupWizard (z-[9999]): mostrar
  // las dos modales bloqueantes a la vez deja al usuario en un callejón visual.
  if (providersLoading || !isAnyProviderSetup()) return null;

  return (
    <div className="fixed inset-0 z-[9998] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in-0 duration-200">
      <div className="bg-card border border-destructive/40 shadow-2xl rounded-2xl max-w-xl w-full p-6 space-y-5 overflow-hidden">
        <div className="flex items-start gap-3.5">
          <div className="p-2.5 bg-destructive/10 rounded-xl text-destructive shrink-0 mt-0.5">
            <AlertOctagon size={24} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">
              {t("models.validation.title")}
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {t("models.validation.description")}
            </p>
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto space-y-4 pr-1">
          {invalidSlots.map((slot) => (
            <div
              key={slot.slotKey}
              className="bg-background/60 border border-border/80 rounded-xl p-4 space-y-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-sm text-foreground">
                  {t(slot.labelKey, slot.labelParams)}
                </span>
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20">
                  {slot.reason === "provider_missing"
                    ? t("models.validation.reasonProviderMissing")
                    : slot.reason === "provider_disabled"
                      ? t("models.validation.reasonProviderDisabled")
                      : slot.reason === "model_unspecified"
                        ? t("models.validation.reasonModelUnspecified")
                        : t("models.validation.reasonModelNotFound")}
                </span>
              </div>

              <div className="text-xs text-muted-foreground">
                <span>{t("models.validation.previousValue")} </span>
                <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-[11px] text-foreground/80 break-all">
                  {slot.currentValue}
                </code>
              </div>

              <div className="pt-1">
                <ModelSelector
                  value={slotChoices[slot.slotKey] || ""}
                  onChange={(val) => handleModelChange(slot.slotKey, val)}
                  models={allModels || []}
                  loading={modelsLoading}
                  placeholder={t("models.validation.selectPlaceholder")}
                  disableEnabledFilter
                  showProviderBadge
                  variant="default"
                />
              </div>
            </div>
          ))}
        </div>

        <div className="pt-2 border-t border-border flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {allSlotsAssigned
              ? t("models.validation.allAssigned")
              : t("models.validation.pendingAssignments")}
          </p>
          <Button
            onClick={handleSave}
            disabled={!allSlotsAssigned || isSaving}
            className="font-bold cursor-pointer"
          >
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t("models.validation.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}
