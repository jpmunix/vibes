import { useState, useEffect, useCallback, useMemo } from "react";
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
import { AlertOctagon, Loader2, CloudOff, ArrowRight, Info } from "@/components/ui/icons";
import { showSuccess, showError } from "@/lib/toast";
import { useI18n } from "@/lib/i18n";
import { useNavigate, useRouterState } from "@tanstack/react-router";

/**
 * Helper para obtener el label legible del proveedor sin sesgos ni prefijos internos
 */
function getReadableProviderLabel(provider: string, customProviders?: any[]): string {
  const cleanId = provider.replace(/^custom::/, "");
  if (cleanId === "openrouter") return "OpenRouter";
  if (cleanId === "ollama") return "Ollama";
  if (cleanId === "lmstudio") return "LM Studio";
  if (cleanId === "openai") return "OpenAI";
  if (cleanId === "anthropic") return "Anthropic";
  if (cleanId === "google") return "Google";

  const cp = customProviders?.find((p: any) => p.id === cleanId || p.id === provider);
  return cp?.name || cleanId;
}

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

  const { settings, updateSettings } = useSettings();
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

  const routerState = useRouterState();
  const isSettingsPage =
    routerState.location.pathname === "/settings" ||
    (typeof window !== "undefined" &&
      window.location.hash.includes("/settings"));

  // Detectar si hay slots fallando por proveedor desactivado o no configurado
  const hasProviderIssues = useMemo(() => {
    return invalidSlots.some(
      (s) => s.reason === "provider_disabled" || s.reason === "provider_missing",
    );
  }, [invalidSlots]);

  const formatPreviousValue = useCallback(
    (currentValue: string) => {
      const trimmed = currentValue?.trim() || "";
      if (!trimmed) {
        return (
          <span className="italic text-muted-foreground/70">
            {t("models.validation.reasonModelUnspecifiedShort")}
          </span>
        );
      }

      const parsed = parseModelReference(trimmed);
      if (parsed) {
        const providerName = getReadableProviderLabel(
          parsed.provider,
          settings?.customProviders,
        );
        return (
          <div className="flex items-center gap-1.5 min-w-0 max-w-full">
            <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground border border-border/60">
              {providerName}
            </span>
            <span className="truncate font-mono text-[11px] text-foreground/90">
              {parsed.model}
            </span>
          </div>
        );
      }

      return (
        <span className="truncate font-mono text-[11px] text-foreground/90">
          {trimmed}
        </span>
      );
    },
    [settings?.customProviders, t],
  );

  if (invalidSlots.length === 0 || isSettingsPage) return null;

  const hasNoAvailableModels = !modelsLoading && (!allModels || allModels.length === 0);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-6 gap-4 sm:max-w-2xl">
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

        {hasProviderIssues && !hasNoAvailableModels && (
          <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-200 text-xs">
            <Info size={16} className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <div className="flex-1 leading-relaxed">
              {t("models.validation.bannerProvidersDisabledOrMissing")}
            </div>
          </div>
        )}

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
                  className="bg-card/60 border border-border/80 rounded-xl p-4 space-y-3 transition-colors hover:border-border shadow-xs"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-xs text-foreground">
                      {t(slot.labelKey, slot.labelParams)}
                    </span>
                    {slot.reason === "model_unspecified" && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border/70">
                        {t("models.validation.reasonModelUnspecifiedShort")}
                      </span>
                    )}
                  </div>

                  <div className="text-[11px] text-muted-foreground flex items-center gap-2 overflow-hidden">
                    <span className="shrink-0 text-muted-foreground/80">
                      {t("models.validation.previousValue")}
                    </span>
                    <div className="min-w-0 flex-1">
                      {formatPreviousValue(slot.currentValue)}
                    </div>
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

