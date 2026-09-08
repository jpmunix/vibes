import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { useSettings } from "@/hooks/useSettings";
import { useI18n } from "@/lib/i18n";
import { ipc } from "@/ipc/types";
import { Plus, ChevronRight } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { ModelsSection } from "../ModelsSection";
import { CreateCustomModelDialog } from "@/components/CreateCustomModelDialog";
import { useTheme } from "@/contexts/ThemeContext";

/**
 * Card "Deuda" — opciones de OpenRouter aparcadas (mostrar gasto, modelo
 * personalizado, modelos habilitados y playground) hasta replantear la
 * sección de proveedores. Card principal sin colapsible; cada fila mantiene
 * su comportamiento original.
 */
export function ProvidersDebtSection() {
  const { t } = useI18n();
  const { settings, updateSettings } = useSettings();
  const queryClient = useQueryClient();
  const { theme, intensity } = useTheme();
  const providerId = "openrouter";

  const [modelsExpanded, setModelsExpanded] = useState(false);
  const [isCustomModelDialogOpen, setIsCustomModelDialogOpen] = useState(false);
  const openAddModelsRef = useRef<(() => void) | null>(null);

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {/* Card Deuda — sin colapsible, título literal (sin diccionarios) */}
      <div className="px-4 py-3 bg-muted/30 border-b border-border">
        <h4 className="typo-label font-semibold">Deuda</h4>
      </div>

      <div className="bg-muted/10 space-y-0">
        {/* Cost display toggle */}
        <div className="flex justify-between gap-8 p-4 items-center">
          <div className="flex-1">
            <h4 className="typo-label text-sm">{t("aiProviders.costDisplay")}</h4>
            <p className="typo-caption mt-0.5">
              {t("aiProviders.costDisplayDesc")}
            </p>
          </div>
          <div onClick={(e) => e.stopPropagation()}>
            <div className="relative bg-muted/50 rounded-xl p-1 flex w-fit border border-border">
              {([false, true] as const).map((value) => (
                <button
                  key={String(value)}
                  onClick={() => updateSettings({ showCostDisplay: value })}
                  className={cn(
                    "px-4 py-1.5 typo-select !font-bold rounded-lg transition-colors duration-200 cursor-pointer",
                    (settings?.showCostDisplay ?? false) === value
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "hover:bg-primary/10",
                  )}
                >
                  {value ? t("common.enabled") : t("common.disabled")}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Custom model */}
        <div className="flex justify-between gap-8 p-4 items-center">
          <div className="flex-1">
            <h4 className="typo-label text-sm">{t("openRouter.customModel")}</h4>
            <p className="typo-caption mt-0.5">
              {t("aiProviders.customModelDesc")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsCustomModelDialogOpen(true)}
            className="px-4 py-1.5 typo-select rounded-lg bg-primary text-primary-foreground shadow-sm cursor-pointer hover:brightness-110 transition-[filter] duration-200"
          >
            {t("common.create")}
          </button>
        </div>

        <CreateCustomModelDialog
          isOpen={isCustomModelDialogOpen}
          onClose={() => setIsCustomModelDialogOpen(false)}
          onSuccess={() => {
            setIsCustomModelDialogOpen(false);
            queryClient.invalidateQueries({
              queryKey: queryKeys.languageModels.byProviders,
            });
            queryClient.invalidateQueries({
              queryKey: queryKeys.languageModels.forProvider({
                providerId,
              }),
            });
          }}
          providerId={providerId}
        />

        {/* Models section - collapsible */}
        <div className="space-y-0">
          <div
            className="flex items-center justify-between cursor-pointer group p-4 hover:bg-muted/20 transition-colors gap-4"
            onClick={() => setModelsExpanded((e) => !e)}
          >
            <div className="flex-1">
              <h4 className="typo-label text-sm">{t("aiProviders.enabledModels")}</h4>
              <p className="typo-caption mt-0.5">
                {t("aiProviders.enabledModelsDesc")}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (!modelsExpanded) {
                    setModelsExpanded(true);
                    // ModelsSection se montará en el próximo frame; disparar cuando esté listo
                    setTimeout(() => openAddModelsRef.current?.(), 80);
                  } else {
                    openAddModelsRef.current?.();
                  }
                }}
                className="px-3 py-1 typo-select rounded-lg bg-primary text-primary-foreground shadow-sm cursor-pointer hover:brightness-110 transition-[filter] duration-200 flex items-center gap-1.5 text-xs"
              >
                <Plus className="h-3 w-3" /> {t("common.add")}
              </button>
              <ChevronRight
                className={cn(
                  "size-4 text-muted-foreground/50 group-hover:text-foreground transition-transform duration-200 shrink-0",
                  modelsExpanded && "rotate-90",
                )}
              />
            </div>
          </div>
          {modelsExpanded && (
            <div className="pl-8 pb-4">
              <ModelsSection
                providerId={providerId}
                onAddRef={(fn) => {
                  openAddModelsRef.current = fn;
                }}
              />
            </div>
          )}
        </div>

        {/* Playground */}
        <div
          className="flex items-center justify-between cursor-pointer group p-4 hover:bg-muted/20 transition-colors gap-4"
          onClick={() => {
            ipc.system.openPlaygroundWindow({
              theme: theme as "light" | "dark" | "system",
              themeIntensity: intensity,
            });
          }}
        >
          <div className="flex-1">
            <h4 className="typo-label text-sm">{t("aiProviders.playground")}</h4>
            <p className="typo-caption mt-0.5">
              {t("aiProviders.playgroundDesc")}
            </p>
          </div>
          <ChevronRight className="size-4 text-muted-foreground/50 group-hover:text-foreground transition-colors duration-200 shrink-0" />
        </div>
      </div>
    </div>
  );
}
