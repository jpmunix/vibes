/**
 * Admin — OpenCode Sessions.
 * Diagnostic tool to audit and purge orphaned OpenCode sessions.
 * Dry-run mode generates a markdown report and shares it via md.mnstatic.com.
 */
import { useState } from "react";
import { ipc } from "@/ipc/types";
import { Button } from "@/components/ui/button";
import { Loader2, Share2, Trash2, Search } from "@/components/ui/icons";
import { showError, showSuccess } from "@/lib/toast";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function AdminOpenCode() {
  const [loading, setLoading] = useState(false);
  const [purging, setPurging] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [stats, setStats] = useState<{
    totalInOpenCode: number;
    knownInVibes: number;
    orphaned: number;
    deleted: number;
    errors: number;
  } | null>(null);

  // ── Dry-run: analyze without deleting ──
  const handleAnalyze = async () => {
    setLoading(true);
    setReport(null);
    setStats(null);
    try {
      const result = await ipc.system.purgeOpenCodeSessions({ dryRun: true });
      setReport(result.report);
      setStats({
        totalInOpenCode: result.totalInOpenCode,
        knownInVibes: result.knownInVibes,
        orphaned: result.orphaned,
        deleted: result.deleted,
        errors: result.errors,
      });
    } catch (e) {
      showError(e);
    } finally {
      setLoading(false);
    }
  };

  // ── Real purge: delete orphaned sessions ──
  const handlePurge = async () => {
    setPurging(true);
    try {
      const result = await ipc.system.purgeOpenCodeSessions({ dryRun: false });
      setReport(result.report);
      setStats({
        totalInOpenCode: result.totalInOpenCode,
        knownInVibes: result.knownInVibes,
        orphaned: result.orphaned,
        deleted: result.deleted,
        errors: result.errors,
      });
      if (result.deleted > 0) {
        showSuccess(`${result.deleted} sesiones huérfanas eliminadas`);
      } else {
        showSuccess("No había sesiones huérfanas para eliminar");
      }
    } catch (e) {
      showError(e);
    } finally {
      setPurging(false);
    }
  };

  // ── Share report via md.mnstatic.com ──
  const handleShare = async () => {
    if (!report) return;
    try {
      const result = await ipc.markdownShare.uploadDocument({
        title: "Informe Purgado OpenCode",
        content: report,
        format: "md",
      });
      await navigator.clipboard.writeText(result.data.share_url);
      showSuccess("URL del informe copiada al portapapeles");
    } catch (e) {
      showError(e);
    }
  };

  return (
    <div className="p-8 w-full mx-auto space-y-8">
      <div className="bg-card rounded-2xl shadow-sm p-8 border border-border">
        {/* Header */}
        <div className="mb-8">
          <h2 className="typo-section-title">OpenCode</h2>
          <p className="typo-caption mt-1">
            Diagnóstico y limpieza de sesiones huérfanas en el servidor de OpenCode
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 mb-6">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 cursor-pointer"
            onClick={handleAnalyze}
            disabled={loading || purging}
          >
            {loading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Search className="size-3.5" />
            )}
            Analizar sesiones
          </Button>

          {stats && (
            <Button
              variant="destructive"
              size="sm"
              className="gap-1.5 cursor-pointer"
              onClick={handlePurge}
              disabled={loading || purging}
            >
              {purging ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Trash2 className="size-3.5" />
              )}
              {stats.orphaned > 0
                ? `Purgar ${stats.orphaned} huérfana${stats.orphaned !== 1 ? "s" : ""}`
                : "Limpieza profunda"}
            </Button>
          )}

          {stats && report && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 cursor-pointer ml-auto"
              onClick={handleShare}
            >
              <Share2 className="size-3.5" />
              Compartir informe
            </Button>
          )}
        </div>

        {/* Stats summary */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            <StatCard label="Total en OpenCode" value={stats.totalInOpenCode} />
            <StatCard label="Vinculadas a Vibes" value={stats.knownInVibes} color="text-emerald-500" />
            <StatCard label="Huérfanas" value={stats.orphaned} color={stats.orphaned > 0 ? "text-amber-500" : "text-muted-foreground"} />
            <StatCard label="Eliminadas" value={stats.deleted} color={stats.deleted > 0 ? "text-rose-500" : "text-muted-foreground"} />
          </div>
        )}

        {/* Report rendered as markdown */}
        {report && (
          <div className="rounded-xl border border-border bg-muted/20 overflow-hidden">
            <div className="overflow-y-auto max-h-[60vh] px-6 py-4">
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {report}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!report && !loading && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
            <Search className="size-8 opacity-30" />
            <p className="typo-caption text-center max-w-md">
              Pulsa "Analizar sesiones" para comparar las sesiones de OpenCode con los chats registrados en Vibes
              y generar un informe de sincronización.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Stat card ──

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="p-4 rounded-xl border border-border bg-muted/30">
      <p className="typo-micro text-muted-foreground">{label}</p>
      <p className={`text-2xl font-semibold mt-1 ${color || "text-foreground"}`}>{value}</p>
    </div>
  );
}
