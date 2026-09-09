import { useState, useEffect, useCallback } from "react";
import { useAtom, useSetAtom } from "jotai";
import {
  invalidModelSlotsAtom,
  modelFixDialogOpenAtom,
  settingsFocusSectionAtom,
} from "@/atoms/modelValidationAtoms";
import { useSettings } from "@/hooks/useSettings";
import { useMultiProviderModels } from "@/hooks/useMultiProviderModels";
import { ModelSelector } from "@/components/unified/ModelSelector";
import { parseModelReference } from "@/ipc/utils/model_reference";
import { ipc } from "@/ipc/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { AlertOctagon, Loader2, CloudOff, ArrowRight } from "@/components/ui/icons";
import { showSuccess, showError } from "@/lib/toast";
import { useI18n } from "@/lib/i18n";
import { useNavigate } from "@tanstack/react-router";

/**
 * Diálogo de reasignación / ajuste de modelos rotos (card #242).
 *
 * No es bloqueante a nivel app: se puede cerrar con ESC, X o 'Más tarde'.
 * Al cerrarse sin guardar, se muestra un banner recordatorio y el chat
 * permanece deshabilitado.
 */
export function ModelReassignmentModal() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [invalidSlots, setInvalidSlots] = useAtom(invalidModelSlotsAtom);
  const [isOpen, setIsOpen] = useAtom(modelFixDialogOpenAtom);
  const setSettingsFocusSection = useSetAtom(settingsFocusSectionAtom);

  const { updateSettings } = useSettings();
  const { data: allModels, isLoading: modelsLoading } = useMultiProviderModels();

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

  const assignedCount = invalidSlots.filter((s) =>
    Boolean(slotChoices[s.slotKey]?.trim()),
  ).length;

  const allSlotsAssigned =
    invalidSlots.length > 0 && assignedCount === invalidSlots.length;

  const handleGoToProviders = () => {
    setSettingsFocusSection("models-connectivity");
    setIsOpen(false);
    navigate({ to: "/settings" as any });
  };

  const handleSave = useCallback(async () => {
    if (!allSlotsAssigned) return;
    setIsSaving(true);

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

    try {
      const checkResult = await ipc.languageModel.checkModelSlotsValidity();
      if (checkResult.isValid) {
        setInvalidSlots([]);
        setIsOpen(false);
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
  }, [allSlotsAssigned, invalidSlots, slotChoices, updateSettings, setInvalidSlots, setIsOpen, t]);

  if (invalidSlots.length === 0) return null;

  const hasNoAvailableModels = !modelsLoading && (!allModels || allModels.length === 0);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-xl max-h-[85vh] flex flex-col p-6 gap-5">
        <DialogHeader className="flex flex-row items-start gap-3.5 text-left sm:text-left space-y-0">
          <div className="p-2.5 bg-destructive/10 rounded-xl text-destructive shrink-0 mt-0.5">
            <AlertOctagon size={22} />
          </div>
          <div className="flex-1 min-w-0 pr-6">
            <DialogTitle className="text-base font-bold text-foreground">
              {t("models.validation.title")}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-1">
              {t("models.validation.description")}
            </DialogDescription>
          </div>
        </DialogHeader>

        {hasNoAvailableModels ? (
          <div className="flex flex-col items-center justify-center p-6 border border-dashed border-border rounded-xl bg-muted/20 text-center space-y-4">
            <div className="p-3 bg-muted rounded-full text-muted-foreground">
              <CloudOff size={28} />
            </div>
            <div className="space-y-1 max-w-sm">
              <h3 className="text-sm font-semibold text-foreground">
                {t("models.validation.noProvidersTitle")}
              </h3>
              <p className="text-xs text-muted-foreground">
                {t("models.validation.noProvidersDesc")}
              </p>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsOpen(false)}
                className="cursor-pointer text-xs"
              >
                {t("models.validation.later")}
              </Button>
              <Button
                size="sm"
                onClick={handleGoToProviders}
                className="cursor-pointer text-xs font-semibold"
              >
                {t("models.validation.configureProvidersCta")}
                <ArrowRight size={14} className="ml-1.5" />
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-1 text-xs text-muted-foreground font-medium">
              <span>
                {t("models.validation.progressAssigned", {
                  done: String(assignedCount),
                  total: String(invalidSlots.length),
                })}
              </span>
              <span className="text-[11px] opacity-75">
                {Math.round((assignedCount / invalidSlots.length) * 100)}%
              </span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-[140px]">
              {invalidSlots.map((slot) => (
                <div
                  key={slot.slotKey}
                  className="bg-background/60 border border-border/80 rounded-xl p-3.5 space-y-2.5 transition-colors hover:border-border"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-xs text-foreground">
                      {t(slot.labelKey, slot.labelParams)}
                    </span>
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20">
                      {slot.reason === "provider_missing"
                        ? t("models.validation.reasonProviderMissing")
                        : slot.reason === "provider_disabled"
                          ? t("models.validation.reasonProviderDisabled")
                          : slot.reason === "model_unspecified"
                            ? t("models.validation.reasonModelUnspecified")
                            : t("models.validation.reasonModelNotFound")}
                    </span>
                  </div>

                  <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 overflow-hidden">
                    <span className="shrink-0">{t("models.validation.previousValue")}</span>
                    <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-[10px] text-foreground/80 truncate">
                      {slot.currentValue}
                    </code>
                  </div>

                  <div className="pt-0.5">
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

            <DialogFooter className="pt-3 border-t border-border flex flex-row items-center justify-between gap-2 sm:justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsOpen(false)}
                className="cursor-pointer text-xs"
              >
                {t("models.validation.later")}
              </Button>
              <Button
                onClick={handleSave}
                disabled={!allSlotsAssigned || isSaving}
                size="sm"
                className="font-bold cursor-pointer text-xs"
              >
                {isSaving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                {t("models.validation.save")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

