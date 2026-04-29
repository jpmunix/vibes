/**
 * MemorySettings — Settings section for the agent memory system.
 *
 * Follows the exact design patterns from AIBehaviorSettings / OpenCodePermissionsSettings:
 * - SettingRow with TogglePill for toggles
 * - SettingsModelSelector pill for model (same as "Modelo para tareas internas")
 * - Collapsible ChevronRight pattern for stats
 * - Prompt editors for synthesis and selection
 * - MemoryAnalyzer for telemetry
 */

import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useSettings } from "@/hooks/useSettings";
import { cn } from "@/lib/utils";
import { ipc } from "@/ipc/types";
import { Button } from "@/components/ui/button";
import { ChevronRight, Loader2, RotateCcw, Check } from "@/components/ui/icons";
import { MemoryExtractionModelSelector } from "./MemoryExtractionModelSelector";
import { MemorySelectionModelSelector } from "./MemorySelectionModelSelector";
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
// PromptEditor — Reusable collapsible prompt editor
// =============================================================================

function PromptEditor({
  label,
  description,
  promptId,
}: {
  label: string;
  description: string;
  promptId: "memory_extraction" | "memory_synthesis" | "memory_selection";
}) {
  const { settings, updateSettings } = useSettings();
  const [expanded, setExpanded] = useState(false);
  const [localPrompt, setLocalPrompt] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const defaultPrompt = DEFAULT_PROMPTS[promptId];
  const currentSaved = settings?.customPrompts?.[promptId] ?? defaultPrompt;
  const isModified = localPrompt !== defaultPrompt;
  const hasUnsavedChanges = localPrompt !== currentSaved;

  // Sync local prompt from settings
  useEffect(() => {
    if (settings) {
      setLocalPrompt(settings.customPrompts?.[promptId] ?? defaultPrompt);
    }
  }, [settings?.customPrompts?.[promptId]]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
    }
  }, [localPrompt, expanded]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      await updateSettings({
        customPrompts: { ...settings?.customPrompts, [promptId]: localPrompt },
      });
      toast.success(`Prompt de ${label.toLowerCase()} guardado`);
    } catch {
      toast.error("Error al guardar el prompt");
    } finally {
      setIsSaving(false);
    }
  }, [localPrompt, settings?.customPrompts, updateSettings, promptId, label]);

  const handleReset = useCallback(async () => {
    try {
      const newCustomPrompts = { ...settings?.customPrompts };
      delete newCustomPrompts[promptId];
      await updateSettings({ customPrompts: newCustomPrompts });
      setLocalPrompt(defaultPrompt);
      toast.success("Prompt restaurado a valores de fábrica");
    } catch {
      toast.error("Error al restaurar el prompt");
    }
  }, [settings?.customPrompts, updateSettings, defaultPrompt, promptId]);

  return (
    <>
      <div
        className="flex items-center justify-between cursor-pointer group p-4 rounded-xl border border-border hover:bg-muted/50 transition-colors gap-4"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex-1">
          <h3 className="typo-label">{label}</h3>
          <p className="typo-caption mt-1">{description}</p>
        </div>
        <ChevronRight
          className={cn(
            "size-5 text-muted-foreground/50 group-hover:text-foreground transition-transform duration-200 shrink-0",
            expanded && "rotate-90",
          )}
        />
      </div>

      {expanded && (
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
              onClick={handleReset}
              disabled={!isModified}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Restaurar
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={handleSave}
              disabled={isSaving || !hasUnsavedChanges}
            >
              {isSaving
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Check className="h-3.5 w-3.5" />
              }
              Guardar
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

// =============================================================================
// MemoryAnalyzer — Telemetry visualization
// =============================================================================

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  skipped_trivial: { label: "Guardián (trivial)", color: "bg-yellow-500" },
  skipped_no_tech: { label: "Guardián (no técnico)", color: "bg-yellow-400" },
  synthesized: { label: "Sintetizada", color: "bg-emerald-500" },
  routed: { label: "Router (inyectada)", color: "bg-blue-500" },
  overwritten: { label: "Sobreescrita", color: "bg-violet-500" },
  merged: { label: "Fusionada", color: "bg-violet-400" },
  discarded_quality: { label: "Descartada (calidad)", color: "bg-rose-500" },
};

interface TelemetryEvent {
  action: string;
  reason: string | null;
  extractedKeys: string | null;
  createdAt: string;
}

function MemoryAnalyzer() {
  const [expanded, setExpanded] = useState(false);
  const [stats, setStats] = useState<{ action: string; count: number }[]>([]);
  const [recent, setRecent] = useState<TelemetryEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!expanded) return;

    const load = async () => {
      setIsLoading(true);
      try {
        const [statsData, recentData] = await Promise.all([
          ipc.memory.getMemoryTelemetryStats(0),
          ipc.memory.getMemoryTelemetryRecent(0),
        ]);
        setStats(statsData);
        setRecent(recentData);
      } catch (err) {
        console.error("Failed to load telemetry:", err);
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [expanded]);

  // Compute funnel
  const totalInteractions = useMemo(() =>
    stats.reduce((sum, s) => sum + s.count, 0),
    [stats],
  );
  const skippedCount = useMemo(() =>
    stats.filter(s => s.action.startsWith("skipped_")).reduce((sum, s) => sum + s.count, 0),
    [stats],
  );
  const synthesizedCount = useMemo(() =>
    stats.find(s => s.action === "synthesized")?.count ?? 0,
    [stats],
  );
  const routedCount = useMemo(() =>
    stats.find(s => s.action === "routed")?.count ?? 0,
    [stats],
  );

  const evaluatedCount = totalInteractions - skippedCount;
  const evaluatedPct = totalInteractions > 0 ? Math.round((evaluatedCount / totalInteractions) * 100) : 0;
  const savedPct = evaluatedCount > 0 ? Math.round((synthesizedCount / evaluatedCount) * 100) : 0;

  // Split recent into discards vs operations
  const recentDiscards = useMemo(() =>
    recent.filter(r => r.action.startsWith("skipped_") || r.action === "discarded_quality").slice(0, 5),
    [recent],
  );
  const recentOperations = useMemo(() =>
    recent.filter(r => ["synthesized", "overwritten", "merged"].includes(r.action)).slice(0, 5),
    [recent],
  );

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      const now = new Date();
      const diffH = Math.round((now.getTime() - d.getTime()) / 3600000);
      if (diffH < 1) return "hace minutos";
      if (diffH < 24) return `hace ${diffH}h`;
      return `hace ${Math.round(diffH / 24)}d`;
    } catch {
      return "—";
    }
  };

  return (
    <>
      <div
        className="flex items-center justify-between cursor-pointer group p-4 rounded-xl border border-border hover:bg-muted/50 transition-colors gap-4"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex-1">
          <h3 className="typo-label">Analizador de memoria</h3>
          <p className="typo-caption mt-1">
            Métricas del pipeline de extracción y selección (últimos 30 días)
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
        <div className="pl-4 space-y-4">
          {isLoading ? (
            <div className="flex items-center gap-2 p-4 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="typo-caption">Cargando telemetría...</span>
            </div>
          ) : totalInteractions === 0 ? (
            <div className="p-4">
              <p className="typo-caption">Sin datos de telemetría aún. Las estadísticas aparecerán después de usar el chat con memorias activadas.</p>
            </div>
          ) : (
            <>
              {/* Funnel visualization */}
              <div className="p-4 rounded-xl border border-border space-y-3">
                <h4 className="typo-label text-muted-foreground">Embudo de procesamiento</h4>
                {/* Total interactions */}
                <div className="space-y-1">
                  <div className="flex justify-between typo-caption">
                    <span>Interacciones totales</span>
                    <span className="font-medium">{totalInteractions}</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-muted">
                    <div className="h-full rounded-full bg-foreground/30" style={{ width: "100%" }} />
                  </div>
                </div>
                {/* Evaluated (passed guardian) */}
                <div className="space-y-1">
                  <div className="flex justify-between typo-caption">
                    <span>Evaluadas (pasaron guardián)</span>
                    <span className="font-medium">{evaluatedCount} ({evaluatedPct}%)</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-muted">
                    <div className="h-full rounded-full bg-blue-500" style={{ width: `${evaluatedPct}%` }} />
                  </div>
                </div>
                {/* Saved */}
                <div className="space-y-1">
                  <div className="flex justify-between typo-caption">
                    <span>Guardadas</span>
                    <span className="font-medium">{synthesizedCount} ({savedPct}%)</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-muted">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${totalInteractions > 0 ? Math.round((synthesizedCount / totalInteractions) * 100) : 0}%` }} />
                  </div>
                </div>
                {/* Routed */}
                <div className="space-y-1">
                  <div className="flex justify-between typo-caption">
                    <span>Llamadas al Router</span>
                    <span className="font-medium">{routedCount}</span>
                  </div>
                </div>
              </div>

              {/* Breakdown by action */}
              <div className="p-4 rounded-xl border border-border space-y-2">
                <h4 className="typo-label text-muted-foreground">Desglose por acción</h4>
                {stats.map(s => {
                  const meta = ACTION_LABELS[s.action] || { label: s.action, color: "bg-gray-400" };
                  return (
                    <div key={s.action} className="flex items-center gap-2 typo-caption">
                      <div className={cn("w-2 h-2 rounded-full shrink-0", meta.color)} />
                      <span className="flex-1">{meta.label}</span>
                      <span className="font-medium">{s.count}</span>
                    </div>
                  );
                })}
              </div>

              {/* Recent discards */}
              {recentDiscards.length > 0 && (
                <div className="p-4 rounded-xl border border-border space-y-2">
                  <h4 className="typo-label text-muted-foreground">Últimos descartes</h4>
                  {recentDiscards.map((r, i) => {
                    const meta = ACTION_LABELS[r.action] || { label: r.action, color: "bg-gray-400" };
                    return (
                      <div key={i} className="flex items-start gap-2 typo-caption">
                        <div className={cn("w-2 h-2 rounded-full shrink-0 mt-1", meta.color)} />
                        <div className="flex-1 min-w-0">
                          <span className="font-medium">{meta.label}</span>
                          {r.reason && <span className="text-muted-foreground"> — {r.reason}</span>}
                        </div>
                        <span className="typo-micro text-muted-foreground shrink-0">{formatTime(r.createdAt)}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Recent operations */}
              {recentOperations.length > 0 && (
                <div className="p-4 rounded-xl border border-border space-y-2">
                  <h4 className="typo-label text-muted-foreground">Operaciones recientes</h4>
                  {recentOperations.map((r, i) => {
                    const meta = ACTION_LABELS[r.action] || { label: r.action, color: "bg-gray-400" };
                    let keys: string[] = [];
                    try { keys = r.extractedKeys ? JSON.parse(r.extractedKeys) : []; } catch { /* ignore */ }
                    return (
                      <div key={i} className="flex items-start gap-2 typo-caption">
                        <div className={cn("w-2 h-2 rounded-full shrink-0 mt-1", meta.color)} />
                        <div className="flex-1 min-w-0">
                          <span className="font-medium">{meta.label}</span>
                          {keys.length > 0 && (
                            <span className="text-muted-foreground"> — {keys.join(", ")}</span>
                          )}
                        </div>
                        <span className="typo-micro text-muted-foreground shrink-0">{formatTime(r.createdAt)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </>
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
      {/* ⚙️ Toggle: memories enabled */}
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

      {/* ⚙️ Toggle: auto-extraction */}
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

      {/* ⚙️ Model selector — Synthesizer (writes) */}
      <SettingRow
        label="Modelo de síntesis"
        description="Modelo capaz que analiza conversaciones y gestiona memorias (add/update/merge)"
        control={<MemoryExtractionModelSelector />}
      />

      {/* ⚙️ Model selector — Router (reads) */}
      <SettingRow
        label="Modelo de selección"
        description="Modelo ultraligero que clasifica qué memorias inyectar según el prompt del usuario"
        control={<MemorySelectionModelSelector />}
      />

      {/* 📝 Prompt editor — Synthesis */}
      <PromptEditor
        label="Prompt de síntesis"
        description="Instrucciones del Synthesizer: analiza conversaciones y produce operaciones (add/update/merge)"
        promptId="memory_synthesis"
      />

      {/* 📝 Prompt editor — Selection (Router) */}
      <PromptEditor
        label="Prompt de selección"
        description="Instrucciones del Router: selecciona qué memorias inyectar según el prompt del usuario"
        promptId="memory_selection"
      />

      {/* 📊 Collapsible: stats per app */}
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

      {/* 📈 MemoryAnalyzer — Telemetry */}
      <MemoryAnalyzer />
    </div>
  );
}
