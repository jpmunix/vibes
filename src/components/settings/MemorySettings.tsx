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
import { ChevronRight, Loader2, RotateCcw, Check, Maximize2, Minimize2 } from "@/components/ui/icons";
import { MemoryExtractionModelSelector } from "./MemoryExtractionModelSelector";
import { MemorySelectionModelSelector } from "./MemorySelectionModelSelector";
import { useTheme } from "@/contexts/ThemeContext";
import { DEFAULT_PROMPTS } from "@/prompts";
import { toast } from "sonner";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import { UnifiedSelector } from "@/components/ui/UnifiedSelector";

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
          <h3 className="typo-label flex items-center gap-2">
            {label}
            {isModified && (
              <span className="size-2 rounded-full bg-primary shrink-0" title="Prompt modificado" />
            )}
          </h3>
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
// PromptsSection — Collapsible wrapper for both prompt editors
// =============================================================================

function PromptsSection() {
  const [expanded, setExpanded] = useState(false);
  const { settings } = useSettings();

  // Check if any child prompt has been customized
  const hasSynthesisCustom = !!settings?.customPrompts?.memory_synthesis;
  const hasSelectionCustom = !!settings?.customPrompts?.memory_selection;
  const anyModified = hasSynthesisCustom || hasSelectionCustom;

  return (
    <>
      <div
        className="flex items-center justify-between cursor-pointer group p-4 rounded-xl border border-border hover:bg-muted/50 transition-colors gap-4"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex-1">
          <h3 className="typo-label flex items-center gap-2">
            Prompts de memoria
            {anyModified && (
              <span className="size-2 rounded-full bg-primary shrink-0" title="Al menos un prompt modificado" />
            )}
          </h3>
          <p className="typo-caption mt-1">
            Instrucciones personalizables para el generador y el router de memorias
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
          <PromptEditor
            label="Prompt de generación"
            description="Instrucciones del Synthesizer: decide qué extraer de cada conversación y genera operaciones (add/update/merge)"
            promptId="memory_synthesis"
          />
          <PromptEditor
            label="Prompt de selección"
            description="Instrucciones del Router: selecciona qué memorias inyectar según el prompt del usuario"
            promptId="memory_selection"
          />
        </div>
      )}
    </>
  );
}

// =============================================================================
// PayloadBlock — Expandable raw data block with toggle
// =============================================================================

function PayloadBlock({ label, content, variant = "default", expanded = false }: {
  label: string;
  content: string;
  variant?: "default" | "error" | "dim";
  expanded?: boolean;
}) {
  const labelColor = variant === "error" ? "text-rose-500" : "text-muted-foreground";
  const textColor = variant === "error"
    ? "text-rose-400 bg-rose-500/10"
    : variant === "dim"
      ? "text-foreground/60 bg-muted"
      : "text-foreground/80 bg-muted";

  return (
    <div>
      <h5 className={cn("typo-micro font-medium mb-1", labelColor)}>{label}</h5>
      <pre className={cn(
        "typo-micro p-2 rounded-lg whitespace-pre-wrap break-all overflow-y-auto",
        textColor,
        !expanded && "max-h-40",
      )}>{content}</pre>
    </div>
  );
}

// =============================================================================
// MemoryAnalyzer — Telemetry + Pipeline Logs per app
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

const STAGE_LABELS: Record<string, { label: string; color: string }> = {
  synthesis: { label: "Síntesis", color: "text-emerald-500" },
  router: { label: "Router", color: "text-blue-500" },
  guardian: { label: "Guardián", color: "text-yellow-500" },
  "bootstrap-dna": { label: "🧬 DNA", color: "text-purple-500" },
  "bootstrap-explore": { label: "🔬 Explore", color: "text-cyan-500" },
};

interface TelemetryEvent {
  action: string;
  reason: string | null;
  extractedKeys: string | null;
  createdAt: string;
}

interface PipelineLog {
  id: number;
  appId: number;
  chatId: number | null;
  stage: string;
  model: string | null;
  systemPrompt: string | null;
  userMessage: string | null;
  rawResponse: string | null;
  parsedResult: string | null;
  resultCount: number;
  durationMs: number | null;
  success: number;
  error: string | null;
  createdAt: string;
}

function MemoryAnalyzer() {
  const [expanded, setExpanded] = useState(false);
  const [apps, setApps] = useState<{ id: number; name: string }[]>([]);
  const [selectedAppId, setSelectedAppId] = useState<number>(0);
  const [stats, setStats] = useState<{ action: string; count: number }[]>([]);
  const [recent, setRecent] = useState<TelemetryEvent[]>([]);
  const [pipelineLogs, setPipelineLogs] = useState<PipelineLog[]>([]);
  const [expandedLogId, setExpandedLogId] = useState<number | null>(null);
  const [fullPayloadLogId, setFullPayloadLogId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"telemetry" | "pipeline">("telemetry");
  const [bootstrapRunning, setBootstrapRunning] = useState(false);

  // Load apps list once
  useEffect(() => {
    if (!expanded) return;
    ipc.memory.getAppsWithAnalyzerData().then(appList => {
      setApps(appList);
    }).catch(() => {});
  }, [expanded]);

  // Load data when app or tab changes
  useEffect(() => {
    if (!expanded) return;

    const load = async () => {
      setIsLoading(true);
      try {
        if (activeTab === "telemetry") {
          const [statsData, recentData] = await Promise.all([
            ipc.memory.getMemoryTelemetryStats(selectedAppId),
            ipc.memory.getMemoryTelemetryRecent(selectedAppId),
          ]);
          setStats(statsData);
          setRecent(recentData);
        } else {
          const logs = await ipc.memory.getPipelineLogs({
            appId: selectedAppId || undefined,
            limit: 50,
          });
          setPipelineLogs(logs);
        }
      } catch (err) {
        console.error("Failed to load analyzer data:", err);
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [expanded, selectedAppId, activeTab]);

  // Compute funnel
  const totalInteractions = useMemo(() =>
    stats.reduce((sum, s) => sum + s.count, 0), [stats]);
  const skippedCount = useMemo(() =>
    stats.filter(s => s.action.startsWith("skipped_")).reduce((sum, s) => sum + s.count, 0), [stats]);
  const synthesizedCount = useMemo(() =>
    stats.find(s => s.action === "synthesized")?.count ?? 0, [stats]);
  const routedCount = useMemo(() =>
    stats.find(s => s.action === "routed")?.count ?? 0, [stats]);

  const evaluatedCount = totalInteractions - skippedCount;
  const evaluatedPct = totalInteractions > 0 ? Math.round((evaluatedCount / totalInteractions) * 100) : 0;
  const savedPct = evaluatedCount > 0 ? Math.round((synthesizedCount / evaluatedCount) * 100) : 0;

  const recentDiscards = useMemo(() =>
    recent.filter(r => r.action.startsWith("skipped_") || r.action === "discarded_quality").slice(0, 5), [recent]);
  const recentOperations = useMemo(() =>
    recent.filter(r => ["synthesized", "overwritten", "merged"].includes(r.action)).slice(0, 5), [recent]);

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      const now = new Date();
      const diffH = Math.round((now.getTime() - d.getTime()) / 3600000);
      if (diffH < 1) return "hace minutos";
      if (diffH < 24) return `hace ${diffH}h`;
      return `hace ${Math.round(diffH / 24)}d`;
    } catch { return "—"; }
  };

  const appOptions = [
    { value: "0", label: "Todas las apps" },
    ...apps.map(a => ({ value: String(a.id), label: a.name })),
  ];

  return (
    <>
      <div
        className="flex items-center justify-between cursor-pointer group p-4 rounded-xl border border-border hover:bg-muted/50 transition-colors gap-4"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex-1">
          <h3 className="typo-label">Analizador de memoria</h3>
          <p className="typo-caption mt-1">
            Métricas del pipeline y logs raw por aplicación
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
          {/* App filter + Tabs */}
          <div className="flex items-center gap-3 flex-wrap">
            <UnifiedSelector
              value={String(selectedAppId)}
              onChange={(v) => setSelectedAppId(Number(v))}
              options={appOptions}
              triggerVariant="pill"
              triggerSize="sm"
              popoverWidth="w-[240px]"
              itemLayout="compact"
            />
            <div className="flex gap-1 ml-auto">
              <Button
                variant={activeTab === "telemetry" ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveTab("telemetry")}
              >
                Telemetría
              </Button>
              <Button
                variant={activeTab === "pipeline" ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveTab("pipeline")}
              >
                Pipeline Logs
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 p-4 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="typo-caption">Cargando...</span>
            </div>
          ) : activeTab === "telemetry" ? (
            /* ── TELEMETRY TAB ── */
            totalInteractions === 0 ? (
              <div className="p-4">
                <p className="typo-caption">Sin datos de telemetría{selectedAppId > 0 ? " para esta app" : ""} aún.</p>
              </div>
            ) : (
              <>
                {/* Funnel */}
                <div className="p-4 rounded-xl border border-border space-y-3">
                  <h4 className="typo-label text-muted-foreground">Embudo de procesamiento</h4>
                  <div className="space-y-1">
                    <div className="flex justify-between typo-caption">
                      <span>Interacciones totales</span>
                      <span className="font-medium">{totalInteractions}</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-muted">
                      <div className="h-full rounded-full bg-foreground/30" style={{ width: "100%" }} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between typo-caption">
                      <span>Evaluadas (pasaron guardián)</span>
                      <span className="font-medium">{evaluatedCount} ({evaluatedPct}%)</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-muted">
                      <div className="h-full rounded-full bg-blue-500" style={{ width: `${evaluatedPct}%` }} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between typo-caption">
                      <span>Guardadas</span>
                      <span className="font-medium">{synthesizedCount} ({savedPct}%)</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-muted">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${totalInteractions > 0 ? Math.round((synthesizedCount / totalInteractions) * 100) : 0}%` }} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between typo-caption">
                      <span>Llamadas al Router</span>
                      <span className="font-medium">{routedCount}</span>
                    </div>
                  </div>
                </div>

                {/* Breakdown */}
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

                {/* Discards */}
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

                {/* Operations */}
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
            )
          ) : (
            /* ── PIPELINE LOGS TAB ── */
            pipelineLogs.length === 0 ? (
              <div className="p-4">
                <p className="typo-caption">Sin logs del pipeline{selectedAppId > 0 ? " para esta app" : ""} aún.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {pipelineLogs.map(log => {
                  const stageMeta = STAGE_LABELS[log.stage] || { label: log.stage, color: "text-muted-foreground" };
                  const isOpen = expandedLogId === log.id;

                  // Parse metadata from parsedResult for inline chips
                  let meta: any = null;
                  try {
                    if (log.parsedResult) {
                      const parsed = JSON.parse(log.parsedResult);
                      meta = parsed?.meta || null;
                      // Guardian puts rejectReason at root level
                      if (!meta && parsed?.rejectReason) {
                        meta = parsed;
                      }
                    }
                  } catch { /* ignore */ }

                  // Build inline chip content based on stage
                  let inlineChip: React.ReactNode = null;
                  if (log.stage === "guardian" && meta?.rejectReason) {
                    const isApproved = meta.rejectReason === "approved";
                    inlineChip = (
                      <span className={cn(
                        "typo-micro px-1.5 py-0.5 rounded-md font-medium shrink-0",
                        isApproved
                          ? "bg-emerald-500/10 text-emerald-500"
                          : "bg-amber-500/10 text-amber-500",
                      )}>
                        {meta.rejectReason}
                      </span>
                    );
                  } else if (log.stage === "synthesis" && meta?.existingMemoriesCount !== undefined) {
                    inlineChip = (
                      <span className="typo-micro px-1.5 py-0.5 rounded-md bg-muted/50 text-muted-foreground shrink-0">
                        {meta.existingMemoriesCount} exist → {meta.operationsGenerated ?? log.resultCount} ops
                      </span>
                    );
                  } else if (log.stage === "router" && meta?.candidatePoolSize !== undefined) {
                    inlineChip = (
                      <span className="typo-micro px-1.5 py-0.5 rounded-md bg-muted/50 text-muted-foreground shrink-0">
                        {meta.candidatePoolSize} → {meta.selectedCount} sel
                      </span>
                    );
                  } else if (log.stage === "bootstrap-dna" && meta?.configFilesFound) {
                    inlineChip = (
                      <span className="typo-micro px-1.5 py-0.5 rounded-md bg-purple-500/10 text-purple-500 shrink-0">
                        {Array.isArray(meta.configFilesFound) ? meta.configFilesFound.length : 0} configs
                      </span>
                    );
                  } else if (log.stage === "bootstrap-explore" && meta?.operationsGenerated !== undefined) {
                    inlineChip = (
                      <span className="typo-micro px-1.5 py-0.5 rounded-md bg-cyan-500/10 text-cyan-500 shrink-0">
                        {meta.operationsGenerated} found → {meta.operationsPersisted ?? 0} saved
                      </span>
                    );
                  }

                  return (
                    <div key={log.id} className="rounded-xl border border-border overflow-hidden">
                      {/* Summary row */}
                      <div
                        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => setExpandedLogId(isOpen ? null : log.id)}
                      >
                        <ChevronRight className={cn(
                          "size-3.5 text-muted-foreground/50 transition-transform duration-200 shrink-0",
                          isOpen && "rotate-90",
                        )} />
                        <span className={cn("typo-caption font-medium shrink-0 w-20", stageMeta.color)}>
                          {stageMeta.label}
                        </span>
                        <span className="typo-caption text-muted-foreground truncate flex-1">
                          {log.model || "—"}
                        </span>
                        {inlineChip}
                        <span className="typo-micro text-muted-foreground shrink-0">
                          chat #{log.chatId ?? "—"}
                        </span>
                        {log.durationMs != null && (
                          <span className="typo-micro text-muted-foreground shrink-0">
                            {log.durationMs}ms
                          </span>
                        )}
                        <span className={cn(
                          "typo-micro font-medium shrink-0",
                          log.success ? "text-emerald-500" : "text-rose-500",
                        )}>
                          {log.success ? `${log.resultCount} ops` : "ERROR"}
                        </span>
                        <span className="typo-micro text-muted-foreground shrink-0">
                          {formatTime(log.createdAt)}
                        </span>
                      </div>

                      {/* Expanded payload */}
                      {isOpen && (() => {
                        const payloadsExpanded = fullPayloadLogId === log.id;
                        return (
                        <div className="border-t border-border p-3 space-y-3 bg-muted/20">
                          {/* Metadata banner */}
                          {meta && (
                            <div className="rounded-lg border border-border/50 bg-muted/30 p-3 space-y-1">
                              {log.stage === "guardian" && meta.rejectReason !== "approved" && (
                                <>
                                  <div className="flex items-center gap-2 typo-micro">
                                    <span className="text-muted-foreground/60">🛡️ Rechazado:</span>
                                    <span className="text-amber-500 font-medium">{meta.rejectReason}</span>
                                  </div>
                                  {meta.promptExcerpt && (
                                    <div className="typo-micro text-muted-foreground/60">
                                      📝 Prompt: <span className="text-muted-foreground italic">"{meta.promptExcerpt.slice(0, 100)}{meta.promptExcerpt.length > 100 ? "…" : ""}"</span>
                                    </div>
                                  )}
                                  {meta.responseExcerpt && (
                                    <div className="typo-micro text-muted-foreground/60">
                                      📄 Respuesta: <span className="text-muted-foreground italic">"{meta.responseExcerpt.slice(0, 100)}{meta.responseExcerpt.length > 100 ? "…" : ""}"</span>
                                      {meta.responseLength && <span> ({meta.responseLength.toLocaleString()} chars)</span>}
                                    </div>
                                  )}
                                </>
                              )}
                              {log.stage === "guardian" && meta.rejectReason === "approved" && (
                                <div className="flex items-center gap-2 typo-micro">
                                  <span className="text-muted-foreground/60">✅ Aprobado</span>
                                  {meta.promptLength && <span className="text-muted-foreground/50">· Prompt: {meta.promptLength.toLocaleString()} chars</span>}
                                  {meta.responseLength && <span className="text-muted-foreground/50">· Response: {meta.responseLength.toLocaleString()} chars</span>}
                                </div>
                              )}
                              {(log.stage === "synthesis" || log.stage === "router") && (
                                <div className="flex flex-wrap gap-x-4 gap-y-1 typo-micro text-muted-foreground/60">
                                  {meta.promptLength && (
                                    <span>📊 Prompt: {meta.promptLength.toLocaleString()} chars</span>
                                  )}
                                  {meta.responseLength && (
                                    <span>· Response: {meta.responseLength.toLocaleString()} chars</span>
                                  )}
                                  {meta.existingMemoriesCount !== undefined && (
                                    <span>📦 Existentes: {meta.existingMemoriesCount}</span>
                                  )}
                                  {meta.candidatePoolSize !== undefined && (
                                    <span>📦 Pool: {meta.candidatePoolSize}</span>
                                  )}
                                  {meta.operationsRatio && (
                                    <span>🎯 Ratio: {meta.operationsRatio}</span>
                                  )}
                                  {meta.selectionRatio && (
                                    <span>🎯 Selección: {meta.selectionRatio}</span>
                                  )}
                                  {meta.inputTokensEstimate && (
                                    <span>💰 ~{meta.inputTokensEstimate.toLocaleString()} tokens</span>
                                  )}
                                </div>
                              )}
                              {(log.stage === "bootstrap-dna") && (
                                <div className="flex flex-wrap gap-x-4 gap-y-1 typo-micro text-muted-foreground/60">
                                  {meta.configFilesFound && (
                                    <span>📁 Configs: {Array.isArray(meta.configFilesFound) ? meta.configFilesFound.join(", ") : meta.configFilesFound}</span>
                                  )}
                                  {meta.hasAgentsMd !== undefined && (
                                    <span>{meta.hasAgentsMd ? "✅" : "❌"} AGENTS.md</span>
                                  )}
                                  {meta.hasDesignMd !== undefined && (
                                    <span>{meta.hasDesignMd ? "✅" : "❌"} DESIGN.md</span>
                                  )}
                                  {meta.dnaPayloadSize && (
                                    <span>📊 Payload: {meta.dnaPayloadSize.toLocaleString()} chars</span>
                                  )}
                                  {meta.inputTokensEstimate && (
                                    <span>💰 ~{meta.inputTokensEstimate.toLocaleString()} tokens</span>
                                  )}
                                </div>
                              )}
                              {(log.stage === "bootstrap-explore") && (
                                <div className="flex flex-wrap gap-x-4 gap-y-1 typo-micro text-muted-foreground/60">
                                  {meta.operationsGenerated !== undefined && (
                                    <span>🔍 Generadas: {meta.operationsGenerated}</span>
                                  )}
                                  {meta.operationsPersisted !== undefined && (
                                    <span>💾 Persistidas: {meta.operationsPersisted}</span>
                                  )}
                                  {meta.existingKeysSkipped && Array.isArray(meta.existingKeysSkipped) && meta.existingKeysSkipped.length > 0 && (
                                    <span>⏭️ Skipped: {meta.existingKeysSkipped.join(", ")}</span>
                                  )}
                                  {meta.exploreDurationMs && (
                                    <span>⏱️ Explore: {(meta.exploreDurationMs / 1000).toFixed(1)}s</span>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          <div className="flex justify-end">
                            <button
                              onClick={() => setFullPayloadLogId(payloadsExpanded ? null : log.id)}
                              className="typo-micro text-muted-foreground/50 hover:text-foreground transition-colors flex items-center gap-1"
                            >
                              {payloadsExpanded ? <Minimize2 className="size-3" /> : <Maximize2 className="size-3" />}
                              {payloadsExpanded ? "Colapsar todo" : "Expandir todo"}
                            </button>
                          </div>
                          {log.error && (
                            <PayloadBlock label="Error" content={log.error} variant="error" expanded={payloadsExpanded} />
                          )}
                          {log.userMessage && (
                            <PayloadBlock label="Input (user message)" content={log.userMessage} expanded={payloadsExpanded} />
                          )}
                          {log.rawResponse && (
                            <PayloadBlock label="Output (raw response)" content={log.rawResponse} expanded={payloadsExpanded} />
                          )}
                          {log.parsedResult && (
                            <PayloadBlock
                              label="Parsed result"
                              content={(() => { try { return JSON.stringify(JSON.parse(log.parsedResult), null, 2); } catch { return log.parsedResult; } })()}
                              expanded={payloadsExpanded}
                            />
                          )}
                          {log.systemPrompt && (
                            <PayloadBlock label="System prompt" content={log.systemPrompt} variant="dim" expanded={payloadsExpanded} />
                          )}
                        </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            )
          )}

          {/* 🧬 Manual Bootstrap */}
          {selectedAppId > 0 && (
            <div className="flex items-center justify-between p-4 rounded-xl border border-purple-500/30 hover:bg-purple-500/5 transition-colors">
              <div className="flex-1 min-w-0">
                <h3 className="typo-label">🧬 Bootstrap de memorias</h3>
                <p className="typo-caption mt-1">
                  Genera memorias fundacionales escaneando la configuración y el codebase del proyecto.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 text-purple-500 border-purple-500/30 hover:bg-purple-500/10"
                disabled={bootstrapRunning}
                onClick={async () => {
                  setBootstrapRunning(true);
                  try {
                    const result = await ipc.memory.bootstrapProjectMemories({ appId: selectedAppId });
                    toast.success(
                      `Bootstrap completado: ${result.phase1Count} (DNA) + ${result.phase2Count} (Explore) memorias`
                    );
                    // Refresh pipeline logs to show bootstrap entries
                    const logs = await ipc.memory.getPipelineLogs({
                      appId: selectedAppId,
                      limit: 50,
                    });
                    setPipelineLogs(logs);
                  } catch (err: any) {
                    toast.error(`Bootstrap falló: ${err.message}`);
                  } finally {
                    setBootstrapRunning(false);
                  }
                }}
              >
                {bootstrapRunning ? (
                  <><Loader2 className="size-3.5 animate-spin mr-1.5" /> Ejecutando...</>
                ) : (
                  "🧬 Bootstrap"
                )}
              </Button>
            </div>
          )}

          {/* 🗑️ Purge stats */}
          <div className="flex items-center justify-between p-4 rounded-xl border border-destructive/30 hover:bg-destructive/5 transition-colors">
            <div className="flex-1 min-w-0">
              <h3 className="typo-label">Borrar datos de análisis</h3>
              <p className="typo-caption mt-1">
                Elimina la telemetría y los logs raw del pipeline. Las memorias no se borran.
              </p>
            </div>
            <DeleteConfirmationDialog
              itemName="todos los datos de análisis del pipeline"
              itemType="datos"
              onDelete={async () => {
                const result = await ipc.memory.purgeAllMemoryStats();
                toast.success(
                  `Datos eliminados: ${result.telemetryDeleted} telemetría + ${result.pipelineLogsDeleted} logs`
                );
                setStats([]);
                setRecent([]);
                setPipelineLogs([]);
              }}
              trigger={
                <Button variant="outline" size="sm" className="text-destructive/70 hover:text-destructive shrink-0">
                  Borrar datos
                </Button>
              }
            />
          </div>
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
        label="Modelo de generación"
        description="Modelo capaz que analiza conversaciones y gestiona memorias (add/update/merge)"
        control={<MemoryExtractionModelSelector />}
      />

      {/* ⚙️ Model selector — Router (reads) */}
      <SettingRow
        label="Modelo de selección"
        description="Modelo ultraligero que clasifica qué memorias inyectar según el prompt del usuario"
        control={<MemorySelectionModelSelector />}
      />

      {/* ⚙️ Max memories to inject */}
      <SettingRow
        label="Memorias máximas por inyección"
        description="Cantidad máxima de memorias que el Router puede seleccionar e inyectar en cada prompt"
        control={
          <UnifiedSelector
            value={String(settings?.memoriesMaxSelection || 10)}
            onChange={(v) => updateSettings({ memoriesMaxSelection: Number(v) })}
            options={[
              { value: "5", label: "5" },
              { value: "10", label: "10" },
              { value: "15", label: "15" },
              { value: "20", label: "20" },
              { value: "30", label: "30" },
            ]}
            triggerVariant="pill"
            triggerSize="sm"
            popoverWidth="w-[120px]"
            itemLayout="compact"
          />
        }
      />

      {/* 📝 Prompts de memoria — collapsible section */}
      <PromptsSection />

      {/* 📊 Collapsible: stats per app */}
      <div
        className="flex items-center justify-between cursor-pointer group p-4 rounded-xl border border-border hover:bg-muted/50 transition-colors gap-4"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex-1">
          <h3 className="typo-label">Memorias por aplicación</h3>
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
