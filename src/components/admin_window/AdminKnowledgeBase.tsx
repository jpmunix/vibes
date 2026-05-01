/**
 * Admin — Memorias.
 * Hierarchy: User → App (only with data) → Memory stats + Analyzer.
 * Exact clone of MemorySettings UI scoped per user/app.
 */
import React, { useEffect, useState, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { ipc } from "@/ipc/types";
import { Button } from "@/components/ui/button";
import { ChevronRight, Loader2, Maximize2, Minimize2 } from "@/components/ui/icons";

// ── Types ───────────────────────────────────────────────────────────────────

interface AppMemStats {
  appId: number; appName: string;
  total: number; enabled: number; disabled: number; autoCount: number; manualCount: number;
}
interface UserMemStats { userId: string; displayName: string; apps: AppMemStats[]; }
interface TelemetryEvent { action: string; reason: string | null; extractedKeys: string | null; createdAt: string; }
interface PipelineLog {
  id: number; appId: number; chatId: number | null; stage: string; model: string | null;
  systemPrompt: string | null; userMessage: string | null; rawResponse: string | null;
  parsedResult: string | null; resultCount: number; durationMs: number | null;
  success: number; error: string | null; createdAt: string;
}
interface DebugLogEntry {
  id: number; appId: number; appName: string; filename: string;
  contentMd: string; createdAt: string;
}

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

function formatTime(iso: string) {
  try {
    const d = new Date(iso); const now = new Date();
    const diffH = Math.round((now.getTime() - d.getTime()) / 3600000);
    if (diffH < 1) return "hace minutos";
    if (diffH < 24) return `hace ${diffH}h`;
    return `hace ${Math.round(diffH / 24)}d`;
  } catch { return "—"; }
}

function PayloadBlock({ label, content, variant = "default", expanded = false }: {
  label: string; content: string; variant?: "default" | "error" | "dim"; expanded?: boolean;
}) {
  const labelColor = variant === "error" ? "text-rose-500" : "text-muted-foreground";
  const textColor = variant === "error" ? "text-rose-400 bg-rose-500/10" : variant === "dim" ? "text-foreground/60 bg-muted" : "text-foreground/80 bg-muted";
  return (
    <div>
      <h5 className={cn("typo-micro font-medium mb-1", labelColor)}>{label}</h5>
      <pre className={cn("typo-micro p-2 rounded-lg whitespace-pre-wrap break-all overflow-y-auto", textColor, !expanded && "max-h-40")}>{content}</pre>
    </div>
  );
}

// ── Main ────────────────────────────────────────────────────────────────────

export function AdminKnowledgeBase() {
  const [data, setData] = useState<UserMemStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [expandedAppId, setExpandedAppId] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    ipc.admin.getAdminMemoryStats({})
      .then((r) => setData(r.users))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-full"><Loader2 size={24} className="animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="p-8 w-full mx-auto space-y-8">
      <div className="bg-card rounded-2xl shadow-sm p-8 border border-border">
        <div className="mb-8">
          <h2 className="typo-section-title">Memorias</h2>
          <p className="typo-caption mt-1">Memorias, métricas y debug logs del pipeline de todos los usuarios</p>
        </div>
        <div className="space-y-4">
          {data.length === 0 ? (
            <p className="typo-caption text-muted-foreground">Sin datos de conocimiento registrados.</p>
          ) : data.map((user) => {
            const isUserOpen = expandedUserId === user.userId;
            const totalMems = user.apps.reduce((s, a) => s + a.total, 0);
            return (
              <div key={user.userId}>
                {/* ── User row ── */}
                <div
                  className="flex items-center justify-between gap-8 p-4 rounded-xl border border-border hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => { setExpandedUserId(isUserOpen ? null : user.userId); setExpandedAppId(null); }}
                >
                  <div className="flex-1 min-w-0">
                    <h3 className="typo-label truncate">{user.displayName}</h3>
                    <p className="typo-caption mt-0.5">{user.apps.length} app{user.apps.length !== 1 ? "s" : ""} · {totalMems} memorias</p>
                  </div>
                  <ChevronRight className={cn("size-5 text-muted-foreground/50 transition-transform duration-200 shrink-0", isUserOpen && "rotate-90")} />
                </div>

                {/* ── Apps list ── */}
                {isUserOpen && (
                  <div className="pl-8 mt-2 space-y-3 mb-4">
                    {user.apps.map((app) => {
                      const isAppOpen = expandedAppId === app.appId;
                      return (
                        <div key={app.appId}>
                          {/* App row */}
                          <div
                            className="flex items-center justify-between gap-8 p-4 rounded-xl border border-border/50 hover:bg-muted/50 transition-colors cursor-pointer"
                            onClick={() => setExpandedAppId(isAppOpen ? null : app.appId)}
                          >
                            <div className="flex-1 min-w-0">
                              <h4 className="typo-label truncate">{app.appName}</h4>
                              <p className="typo-caption mt-0.5">
                                {app.enabled} activas{app.disabled > 0 ? ` · ${app.disabled} desactivadas` : ""} · {app.autoCount} automáticas · {app.manualCount} manuales
                              </p>
                            </div>
                            <ChevronRight className={cn("size-4 text-muted-foreground/50 transition-transform duration-200 shrink-0", isAppOpen && "rotate-90")} />
                          </div>

                          {/* App detail: analyzer */}
                          {isAppOpen && <AppAnalyzer userId={user.userId} appId={app.appId} />}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── AppAnalyzer — telemetry + pipeline for a specific user+app ──────────────

function AppAnalyzer({ userId, appId }: { userId: string; appId: number }) {
  const [stats, setStats] = useState<{ action: string; count: number }[]>([]);
  const [recent, setRecent] = useState<TelemetryEvent[]>([]);
  const [pipelineLogs, setPipelineLogs] = useState<PipelineLog[]>([]);
  const [expandedLogId, setExpandedLogId] = useState<number | null>(null);
  const [fullPayloadLogId, setFullPayloadLogId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"telemetry" | "pipeline" | "debug">("telemetry");
  const [debugLogs, setDebugLogs] = useState<DebugLogEntry[]>([]);
  const [debugLoading, setDebugLoading] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    ipc.admin.getAdminAnalyzerData({ userId, appId })
      .then((r) => { setStats(r.stats); setRecent(r.recent); setPipelineLogs(r.pipelineLogs); })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [userId, appId]);

  // Load debug logs when tab is selected
  useEffect(() => {
    if (activeTab !== "debug") return;
    setDebugLoading(true);
    ipc.admin.getAdminDebugLogs({ userId, appId, limit: 500 })
      .then(setDebugLogs)
      .catch(() => {})
      .finally(() => setDebugLoading(false));
  }, [activeTab, userId, appId]);

  const totalInteractions = useMemo(() => stats.reduce((s, x) => s + x.count, 0), [stats]);
  const skippedCount = useMemo(() => stats.filter(s => s.action.startsWith("skipped_")).reduce((s, x) => s + x.count, 0), [stats]);
  const synthesizedCount = useMemo(() => stats.find(s => s.action === "synthesized")?.count ?? 0, [stats]);
  const routedCount = useMemo(() => stats.find(s => s.action === "routed")?.count ?? 0, [stats]);
  const evaluatedCount = totalInteractions - skippedCount;
  const evaluatedPct = totalInteractions > 0 ? Math.round((evaluatedCount / totalInteractions) * 100) : 0;
  const savedPct = evaluatedCount > 0 ? Math.round((synthesizedCount / evaluatedCount) * 100) : 0;
  const recentDiscards = useMemo(() => recent.filter(r => r.action.startsWith("skipped_") || r.action === "discarded_quality").slice(0, 5), [recent]);
  const recentOps = useMemo(() => recent.filter(r => ["synthesized", "overwritten", "merged"].includes(r.action)).slice(0, 5), [recent]);

  if (isLoading) {
    return <div className="flex items-center gap-2 p-4 pl-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /><span className="typo-caption">Cargando análisis...</span></div>;
  }

  const hasAnyData = totalInteractions > 0 || pipelineLogs.length > 0;
  if (!hasAnyData) {
    return <div className="p-4 pl-8"><p className="typo-caption text-muted-foreground">Sin datos de análisis para esta app.</p></div>;
  }

  return (
    <div className="pl-4 mt-2 space-y-4 mb-2">
      {/* Tabs */}
      <div className="flex gap-1">
        <Button variant={activeTab === "telemetry" ? "default" : "outline"} size="sm" onClick={() => setActiveTab("telemetry")}>Telemetría</Button>
        <Button variant={activeTab === "pipeline" ? "default" : "outline"} size="sm" onClick={() => setActiveTab("pipeline")}>Pipeline Logs</Button>
        <Button variant={activeTab === "debug" ? "default" : "outline"} size="sm" onClick={() => setActiveTab("debug")}>Debug Logs</Button>
      </div>

      {activeTab === "telemetry" ? (
        totalInteractions === 0 ? (
          <p className="typo-caption p-4">Sin datos de telemetría.</p>
        ) : (
          <>
            {/* Funnel */}
            <div className="p-4 rounded-xl border border-border space-y-3">
              <h4 className="typo-label text-muted-foreground">Embudo de procesamiento</h4>
              <FunnelBar label="Interacciones totales" value={totalInteractions} pct={100} color="bg-foreground/30" />
              <FunnelBar label="Evaluadas (pasaron guardián)" value={`${evaluatedCount} (${evaluatedPct}%)`} pct={evaluatedPct} color="bg-blue-500" />
              <FunnelBar label="Guardadas" value={`${synthesizedCount} (${savedPct}%)`} pct={totalInteractions > 0 ? Math.round((synthesizedCount / totalInteractions) * 100) : 0} color="bg-emerald-500" />
              <div className="flex justify-between typo-caption"><span>Llamadas al Router</span><span className="font-medium">{routedCount}</span></div>
            </div>
            {/* Breakdown */}
            <div className="p-4 rounded-xl border border-border space-y-2">
              <h4 className="typo-label text-muted-foreground">Desglose por acción</h4>
              {stats.map(s => { const m = ACTION_LABELS[s.action] || { label: s.action, color: "bg-gray-400" }; return (
                <div key={s.action} className="flex items-center gap-2 typo-caption"><div className={cn("w-2 h-2 rounded-full shrink-0", m.color)} /><span className="flex-1">{m.label}</span><span className="font-medium">{s.count}</span></div>
              ); })}
            </div>
            {recentDiscards.length > 0 && (
              <div className="p-4 rounded-xl border border-border space-y-2">
                <h4 className="typo-label text-muted-foreground">Últimos descartes</h4>
                {recentDiscards.map((r, i) => { const m = ACTION_LABELS[r.action] || { label: r.action, color: "bg-gray-400" }; return (
                  <div key={i} className="flex items-start gap-2 typo-caption"><div className={cn("w-2 h-2 rounded-full shrink-0 mt-1", m.color)} /><div className="flex-1 min-w-0"><span className="font-medium">{m.label}</span>{r.reason && <span className="text-muted-foreground"> — {r.reason}</span>}</div><span className="typo-micro text-muted-foreground shrink-0">{formatTime(r.createdAt)}</span></div>
                ); })}
              </div>
            )}
            {recentOps.length > 0 && (
              <div className="p-4 rounded-xl border border-border space-y-2">
                <h4 className="typo-label text-muted-foreground">Operaciones recientes</h4>
                {recentOps.map((r, i) => { const m = ACTION_LABELS[r.action] || { label: r.action, color: "bg-gray-400" }; let keys: string[] = []; try { keys = r.extractedKeys ? JSON.parse(r.extractedKeys) : []; } catch { /* */ } return (
                  <div key={i} className="flex items-start gap-2 typo-caption"><div className={cn("w-2 h-2 rounded-full shrink-0 mt-1", m.color)} /><div className="flex-1 min-w-0"><span className="font-medium">{m.label}</span>{keys.length > 0 && <span className="text-muted-foreground"> — {keys.join(", ")}</span>}</div><span className="typo-micro text-muted-foreground shrink-0">{formatTime(r.createdAt)}</span></div>
                ); })}
              </div>
            )}
          </>
        )
      ) : activeTab === "pipeline" ? (
        pipelineLogs.length === 0 ? (
          <p className="typo-caption p-4">Sin logs del pipeline.</p>
        ) : (
          <div className="space-y-2">
            {pipelineLogs.map(log => <PipelineLogRow key={log.id} log={log} isOpen={expandedLogId === log.id} onToggle={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)} fullPayload={fullPayloadLogId === log.id} onTogglePayload={() => setFullPayloadLogId(fullPayloadLogId === log.id ? null : log.id)} />)}
          </div>
        )
      ) : (
        /* Debug Logs tab */
        debugLoading ? (
          <div className="flex items-center gap-2 p-4 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /><span className="typo-caption">Cargando debug logs...</span></div>
        ) : debugLogs.length === 0 ? (
          <p className="typo-caption p-4">Sin debug logs para esta app. Los debug logs solo se generan en producción (app empaquetada).</p>
        ) : (
          <DebugLogViewer logs={debugLogs} />
        )
      )}
    </div>
  );
}

function FunnelBar({ label, value, pct, color }: { label: string; value: string | number; pct: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between typo-caption"><span>{label}</span><span className="font-medium">{value}</span></div>
      <div className="w-full h-2 rounded-full bg-muted"><div className={cn("h-full rounded-full", color)} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function PipelineLogRow({ log, isOpen, onToggle, fullPayload, onTogglePayload }: { log: PipelineLog; isOpen: boolean; onToggle: () => void; fullPayload: boolean; onTogglePayload: () => void }) {
  const stageMeta = STAGE_LABELS[log.stage] || { label: log.stage, color: "text-muted-foreground" };
  let meta: any = null;
  try { if (log.parsedResult) { const p = JSON.parse(log.parsedResult); meta = p?.meta || (p?.rejectReason ? p : null); } } catch { /* */ }
  let chip: React.ReactNode = null;
  if (log.stage === "guardian" && meta?.rejectReason) {
    const ok = meta.rejectReason === "approved";
    chip = <span className={cn("typo-micro px-1.5 py-0.5 rounded-md font-medium shrink-0", ok ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500")}>{meta.rejectReason}</span>;
  } else if (log.stage === "synthesis" && meta?.existingMemoriesCount !== undefined) {
    chip = <span className="typo-micro px-1.5 py-0.5 rounded-md bg-muted/50 text-muted-foreground shrink-0">{meta.existingMemoriesCount} exist → {meta.operationsGenerated ?? log.resultCount} ops</span>;
  } else if (log.stage === "router" && meta?.candidatePoolSize !== undefined) {
    chip = <span className="typo-micro px-1.5 py-0.5 rounded-md bg-muted/50 text-muted-foreground shrink-0">{meta.candidatePoolSize} → {meta.selectedCount} sel</span>;
  }
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors" onClick={onToggle}>
        <ChevronRight className={cn("size-3.5 text-muted-foreground/50 transition-transform duration-200 shrink-0", isOpen && "rotate-90")} />
        <span className={cn("typo-caption font-medium shrink-0 w-20", stageMeta.color)}>{stageMeta.label}</span>
        <span className="typo-caption text-muted-foreground truncate flex-1">{log.model || "—"}</span>
        {chip}
        <span className="typo-micro text-muted-foreground shrink-0">chat #{log.chatId ?? "—"}</span>
        {log.durationMs != null && <span className="typo-micro text-muted-foreground shrink-0">{log.durationMs}ms</span>}
        <span className={cn("typo-micro font-medium shrink-0", log.success ? "text-emerald-500" : "text-rose-500")}>{log.success ? `${log.resultCount} ops` : "ERROR"}</span>
        <span className="typo-micro text-muted-foreground shrink-0">{formatTime(log.createdAt)}</span>
      </div>
      {isOpen && (
        <div className="border-t border-border p-3 space-y-3 bg-muted/20">
          <div className="flex justify-end">
            <button onClick={onTogglePayload} className="typo-micro text-muted-foreground/50 hover:text-foreground transition-colors flex items-center gap-1">
              {fullPayload ? <Minimize2 className="size-3" /> : <Maximize2 className="size-3" />}{fullPayload ? "Colapsar todo" : "Expandir todo"}
            </button>
          </div>
          {log.error && <PayloadBlock label="Error" content={log.error} variant="error" expanded={fullPayload} />}
          {log.userMessage && <PayloadBlock label="Input (user message)" content={log.userMessage} expanded={fullPayload} />}
          {log.rawResponse && <PayloadBlock label="Output (raw response)" content={log.rawResponse} expanded={fullPayload} />}
          {log.parsedResult && <PayloadBlock label="Parsed result" content={(() => { try { return JSON.stringify(JSON.parse(log.parsedResult), null, 2); } catch { return log.parsedResult; } })()} expanded={fullPayload} />}
          {log.systemPrompt && <PayloadBlock label="System prompt" content={log.systemPrompt} variant="dim" expanded={fullPayload} />}
        </div>
      )}
    </div>
  );
}

// ── DebugLogViewer — groups logs by session, renders markdown content ────────

function DebugLogViewer({ logs }: { logs: DebugLogEntry[] }) {
  const [viewingLog, setViewingLog] = useState<DebugLogEntry | null>(null);

  return (
    <>
      <div className="space-y-1">
        <p className="typo-caption text-muted-foreground mb-2">{logs.length} archivos de log</p>
        {logs.map((log) => (
          <div
            key={log.id}
            className="flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-muted/50 transition-colors cursor-pointer"
            onClick={() => setViewingLog(log)}
          >
            <span className="text-lg">📄</span>
            <div className="flex-1 min-w-0">
              <p className="typo-caption font-medium truncate">{log.appName || log.filename}</p>
              <p className="typo-micro text-muted-foreground">{log.filename} · {(log.contentMd?.length ?? 0).toLocaleString()} chars</p>
            </div>
            <span className="typo-micro text-muted-foreground shrink-0">{formatTime(log.createdAt)}</span>
            <Button variant="ghost" size="sm" className="shrink-0 h-7 px-2" onClick={(e) => { e.stopPropagation(); setViewingLog(log); }}>
              Ver
            </Button>
          </div>
        ))}
      </div>

      {/* Full markdown modal */}
      {viewingLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setViewingLog(null)}>
          <div
            className="bg-background rounded-2xl border border-border shadow-2xl w-[90vw] max-w-[900px] h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div>
                <h3 className="typo-body font-semibold">{viewingLog.appName || viewingLog.filename}</h3>
                <p className="typo-micro text-muted-foreground">{viewingLog.filename} · {formatTime(viewingLog.createdAt)}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setViewingLog(null)}>✕</Button>
            </div>
            {/* Markdown content */}
            <div className="flex-1 overflow-y-auto p-6">
              <pre className="typo-caption whitespace-pre-wrap break-words text-foreground/90 leading-relaxed font-mono">
                {viewingLog.contentMd}
              </pre>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

