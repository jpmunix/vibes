/**
 * MemorySettings — Settings section for the agent memory system.
 *
 * Follows the exact design patterns from AIBehaviorSettings / OpenCodePermissionsSettings:
 * - SettingRow with TogglePill for toggles
 * - SettingsModelSelector pill for model (same as "Modelo para tareas internas")
 * - Collapsible ChevronRight pattern for stats
 */

import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useSettings } from "@/hooks/useSettings";
import { cn } from "@/lib/utils";
import { ipc } from "@/ipc/types";
import { Button } from "@/components/ui/button";
import { ChevronRight, Loader2, RotateCcw, Check } from "@/components/ui/icons";
import { MemoryExtractionModelSelector } from "./MemoryExtractionModelSelector";
import { useTheme } from "@/contexts/ThemeContext";
import { DEFAULT_PROMPTS } from "@/prompts";
import { toast } from "sonner";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";

// =============================================================================
// SettingRow — same as AIBehaviorSettings.SettingRow
// =============================================================================

function SettingRow({
  label,
  description,
  control,
  onClick,
}: {
  label: string;
  description?: React.ReactNode;
  control: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "flex justify-between gap-8 p-4 rounded-xl hover:bg-muted/50 transition-colors items-center",
        onClick ? "cursor-pointer" : "",
      )}
    >
      <div className="flex-1 min-w-0">
        <h3 className="typo-label">{label}</h3>
        {description && (
          <p className="typo-caption mt-1 leading-relaxed">{description}</p>
        )}
      </div>
      <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
        {control}
      </div>
    </div>
  );
}

// =============================================================================
// TogglePill — same as settings.tsx TogglePill
// =============================================================================

function TogglePill({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="relative bg-muted/50 rounded-xl p-1 flex w-fit border border-border">
      {([false, true] as const).map((value) => (
        <button
          key={String(value)}
          onClick={() => onCheckedChange(value)}
          className={cn(
            "px-4 py-1.5 typo-select !font-bold rounded-lg transition-colors duration-200 cursor-pointer",
            checked === value
              ? "bg-primary text-primary-foreground shadow-sm"
              : "hover:bg-primary/10",
          )}
        >
          {value ? "Activado" : "Desactivado"}
        </button>
      ))}
    </div>
  );
}

// =============================================================================
// Types
// =============================================================================

interface AppMemoryStats {
  appId: number;
  appName: string;
  total: number;
  enabled: number;
  disabled: number;
  autoCount: number;
  manualCount: number;
}

// =============================================================================
// Component
// =============================================================================

export function MemorySettings() {
  const { settings, updateSettings } = useSettings();
  const { theme, intensity } = useTheme();
  const [stats, setStats] = useState<AppMemoryStats[]>([]);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Prompt editor state
  const [promptExpanded, setPromptExpanded] = useState(false);
  const [localPrompt, setLocalPrompt] = useState("");
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const defaultPrompt = DEFAULT_PROMPTS.memory_extraction;
  const currentSaved = settings?.customPrompts?.memory_extraction ?? defaultPrompt;
  const isModified = localPrompt !== defaultPrompt;
  const hasUnsavedChanges = localPrompt !== currentSaved;

  // Sync local prompt from settings
  useEffect(() => {
    if (settings) {
      setLocalPrompt(settings.customPrompts?.memory_extraction ?? defaultPrompt);
    }
  }, [settings?.customPrompts?.memory_extraction]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
    }
  }, [localPrompt, promptExpanded]);

  const handleSavePrompt = useCallback(async () => {
    setIsSavingPrompt(true);
    try {
      await updateSettings({
        customPrompts: { ...settings?.customPrompts, memory_extraction: localPrompt },
      });
      toast.success("Prompt de extracción guardado");
    } catch {
      toast.error("Error al guardar el prompt");
    } finally {
      setIsSavingPrompt(false);
    }
  }, [localPrompt, settings?.customPrompts, updateSettings]);

  const handleResetPrompt = useCallback(async () => {
    try {
      const newCustomPrompts = { ...settings?.customPrompts };
      delete newCustomPrompts.memory_extraction;
      await updateSettings({ customPrompts: newCustomPrompts });
      setLocalPrompt(defaultPrompt);
      toast.success("Prompt restaurado a valores de fábrica");
    } catch {
      toast.error("Error al restaurar el prompt");
    }
  }, [settings?.customPrompts, updateSettings, defaultPrompt]);

  // Load stats when expanded — iterates apps using existing endpoints
  useEffect(() => {
    if (!expanded) return;

    const loadStats = async () => {
      setIsLoadingStats(true);
      try {
        const { apps } = await ipc.app.listApps();
        const allStats: AppMemoryStats[] = [];

        for (const app of apps) {
          try {
            const memories = await ipc.memory.getMemories(app.id);
            // Filter out any leftover global memories (appId=0)
            const appMemories = memories.filter(m => m.appId === app.id);
            if (appMemories.length === 0) continue;

            let enabled = 0;
            let disabled = 0;
            let autoCount = 0;
            let manualCount = 0;

            for (const m of appMemories) {
              if (m.enabled) enabled++;
              else disabled++;
              if (m.source === "auto") autoCount++;
              else manualCount++;
            }

            allStats.push({
              appId: app.id,
              appName: app.name,
              total: appMemories.length,
              enabled,
              disabled,
              autoCount,
              manualCount,
            });
          } catch {
            // Skip apps that fail
          }
        }

        allStats.sort((a, b) => a.appName.localeCompare(b.appName));
        setStats(allStats);
      } catch (err) {
        console.error("Failed to load memory stats:", err);
      } finally {
        setIsLoadingStats(false);
      }
    };

    loadStats();
  }, [expanded]);

  const totalMemories = useMemo(() => stats.reduce((sum, s) => sum + s.total, 0), [stats]);

  return (
    <div className="space-y-4">
      {/* Toggle: memories enabled */}
      <SettingRow
        label="Memorias del agente"
        description="El agente recuerda hechos, preferencias y decisiones entre sesiones"
        onClick={() => updateSettings({ memoriesEnabled: !(settings?.memoriesEnabled !== false) })}
        control={
          <TogglePill
            checked={settings?.memoriesEnabled !== false}
            onCheckedChange={(checked) => updateSettings({ memoriesEnabled: checked })}
          />
        }
      />

      {/* Toggle: auto-extraction */}
      <SettingRow
        label="Extracción automática"
        description="Extrae memorias automáticamente después de cada chat"
        onClick={() => updateSettings({ memoriesAutoExtract: !(settings?.memoriesAutoExtract !== false) })}
        control={
          <TogglePill
            checked={settings?.memoriesAutoExtract !== false}
            onCheckedChange={(checked) => updateSettings({ memoriesAutoExtract: checked })}
          />
        }
      />

      {/* Model selector — same SettingsModelSelector pill as "Modelo para tareas internas" */}
      <SettingRow
        label="Modelo de extracción"
        description="El modelo LLM que analiza las conversaciones para extraer memorias"
        control={<MemoryExtractionModelSelector />}
      />

      {/* Collapsible: extraction prompt editor */}
      <div
        className="flex items-center justify-between cursor-pointer group p-4 rounded-xl border border-border hover:bg-muted/50 transition-colors gap-4"
        onClick={() => setPromptExpanded((e) => !e)}
      >
        <div className="flex-1">
          <h3 className="typo-label">Prompt de extracción</h3>
          <p className="typo-caption mt-1">
            Instrucciones que la IA usa para decidir qué memorias extraer de cada conversación
          </p>
        </div>
        <ChevronRight
          className={cn(
            "size-5 text-muted-foreground/50 group-hover:text-foreground transition-transform duration-200 shrink-0",
            promptExpanded && "rotate-90",
          )}
        />
      </div>

      {promptExpanded && (
        <div className="space-y-3 pl-4">
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
              <span className="typo-mono-xs text-muted-foreground">
                {defaultPrompt.length} chars por defecto
              </span>
              {isModified && (
                <span className="typo-micro px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                  MODIFICADO
                </span>
              )}
            </div>
            <textarea
              ref={textareaRef}
              className="w-full p-4 typo-mono-xs leading-relaxed resize-none border-0 bg-transparent focus:outline-none overflow-hidden"
              spellCheck={false}
              value={localPrompt}
              onChange={(e) => setLocalPrompt(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleResetPrompt}
              disabled={!isModified}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Restaurar
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={handleSavePrompt}
              disabled={isSavingPrompt || !hasUnsavedChanges}
            >
              {isSavingPrompt
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Check className="h-3.5 w-3.5" />
              }
              Guardar
            </Button>
          </div>
        </div>
      )}

      {/* Collapsible: stats per app — follows OpenCodePermissionsSettings pattern */}
      <div
        className="flex items-center justify-between cursor-pointer group p-4 rounded-xl border border-border hover:bg-muted/50 transition-colors gap-4"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex-1">
          <h3 className="typo-label">Estadísticas por aplicación</h3>
          <p className="typo-caption mt-1">
            {totalMemories > 0
              ? `${totalMemories} memorias en total`
              : "Vista de memorias almacenadas por app"
            }
          </p>
        </div>
        <ChevronRight
          className={cn(
            "size-5 text-muted-foreground/50 group-hover:text-foreground transition-transform duration-200 shrink-0",
            expanded && "rotate-90",
          )}
        />
      </div>

      {expanded && (
        <div className="pl-4 space-y-0">
          {isLoadingStats ? (
            <div className="flex items-center gap-2 p-4 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="typo-caption">Cargando estadísticas...</span>
            </div>
          ) : stats.length === 0 ? (
            <div className="p-4">
              <p className="typo-caption">Sin memorias almacenadas aún</p>
            </div>
          ) : (
            stats.map((s) => (
              <div
                key={s.appId}
                className="flex justify-between gap-4 p-4 rounded-xl hover:bg-muted/50 transition-colors items-center"
              >
                <div className="flex-1 min-w-0">
                  <h3 className="typo-label truncate">{s.appName}</h3>
                  <p className="typo-caption mt-1">
                    {s.enabled} activas{s.disabled > 0 ? ` · ${s.disabled} desactivadas` : ""}
                    {" · "}{s.autoCount} automáticas · {s.manualCount} manuales
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => ipc.system.openMemoryWindow({ appId: s.appId, theme, themeIntensity: intensity })}
                  >
                    Ver memorias
                  </Button>
                  <DeleteConfirmationDialog
                    itemName={`todas las memorias de "${s.appName}"`}
                    itemType="memorias"
                    onDelete={async () => {
                      const deleted = await ipc.memory.deleteAllMemories(s.appId);
                      toast.success(`${deleted} memorias eliminadas`);
                      setStats((prev) => prev.filter((x) => x.appId !== s.appId));
                    }}
                    trigger={
                      <Button variant="outline" size="sm" className="text-destructive/70 hover:text-destructive">
                        Eliminar
                      </Button>
                    }
                  />
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
