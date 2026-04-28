/**
 * MemorySettings — Settings section for the agent memory system.
 *
 * Follows the exact design patterns from AIBehaviorSettings / OpenCodePermissionsSettings:
 * - SettingRow with TogglePill for toggles
 * - Collapsible ChevronRight pattern for stats
 * - typo-input for model field
 */

import React, { useEffect, useState, useMemo } from "react";
import { useSettings } from "@/hooks/useSettings";
import { cn } from "@/lib/utils";
import { ipc } from "@/ipc/types";
import { ChevronRight, Loader2 } from "@/components/ui/icons";

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
  byType: Record<string, number>;
  autoCount: number;
  manualCount: number;
}

// =============================================================================
// Component
// =============================================================================

export function MemorySettings() {
  const { settings, updateSettings } = useSettings();
  const [stats, setStats] = useState<AppMemoryStats[]>([]);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Load stats when expanded
  useEffect(() => {
    if (!expanded || stats.length > 0) return;

    const loadStats = async () => {
      setIsLoadingStats(true);
      try {
        const apps = await ipc.app.listApps();
        const allStats: AppMemoryStats[] = [];

        for (const app of apps) {
          try {
            const memories = await ipc.memory.getMemories(app.id);
            if (memories.length === 0) continue;

            const byType: Record<string, number> = {};
            let enabled = 0;
            let disabled = 0;
            let autoCount = 0;
            let manualCount = 0;

            for (const m of memories) {
              byType[m.type] = (byType[m.type] || 0) + 1;
              if (m.enabled) enabled++;
              else disabled++;
              if (m.source === "auto") autoCount++;
              else manualCount++;
            }

            allStats.push({
              appId: app.id,
              appName: app.name,
              total: memories.length,
              enabled,
              disabled,
              byType,
              autoCount,
              manualCount,
            });
          } catch {
            // Skip apps that fail
          }
        }

        // Also get global memories (appId=0)
        try {
          const globalMems = await ipc.memory.getMemories(0);
          if (globalMems.length > 0) {
            const byType: Record<string, number> = {};
            let enabled = 0;
            let disabled = 0;
            let autoCount = 0;
            let manualCount = 0;

            for (const m of globalMems) {
              byType[m.type] = (byType[m.type] || 0) + 1;
              if (m.enabled) enabled++;
              else disabled++;
              if (m.source === "auto") autoCount++;
              else manualCount++;
            }

            allStats.unshift({
              appId: 0,
              appName: "Globales",
              total: globalMems.length,
              enabled,
              disabled,
              byType,
              autoCount,
              manualCount,
            });
          }
        } catch { /* ignore */ }

        setStats(allStats);
      } catch (err) {
        console.error("Failed to load memory stats:", err);
      } finally {
        setIsLoadingStats(false);
      }
    };

    loadStats();
  }, [expanded]); // eslint-disable-line react-hooks/exhaustive-deps

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

      {/* Model selector */}
      <SettingRow
        label="Modelo de extracción"
        description="El modelo LLM que analiza las conversaciones para extraer memorias"
        control={
          <input
            type="text"
            value={settings?.memoriesExtractionModel || "google/gemini-3.1-flash-lite-preview"}
            onChange={(e) => updateSettings({ memoriesExtractionModel: e.target.value })}
            placeholder="google/gemini-3.1-flash-lite-preview"
            className="px-3 py-1.5 typo-input rounded-lg border border-border bg-background focus:border-primary/50 transition-colors w-[320px] font-mono text-xs"
          />
        }
      />

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
              : "Vista global de memorias almacenadas"
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
                className="flex justify-between gap-8 p-4 rounded-xl hover:bg-muted/50 transition-colors items-center"
              >
                <div className="flex-1 min-w-0">
                  <h3 className="typo-label truncate">{s.appName}</h3>
                  <p className="typo-caption mt-1">
                    {s.enabled} activas · {s.disabled > 0 ? `${s.disabled} desactivadas · ` : ""}
                    {s.autoCount} automáticas · {s.manualCount} manuales
                  </p>
                </div>
                <div className="shrink-0">
                  <span className="typo-select text-muted-foreground">
                    {s.total} {s.total === 1 ? "memoria" : "memorias"}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
