/**
 * MemoryPanel — Full diagnostic UI for the agent memory system.
 *
 * Shows ALL memory data for evaluation:
 * - All memories with type, key, content, importance, scope, status, source, dates
 * - Live-computed scores (same formula as context builder)
 * - Formatted context preview (exactly what gets injected into the agent)
 * - Create, edit, enable/disable, delete actions
 * - Manual decay + extraction triggers
 * - Stats overview
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ipc } from "@/ipc/types";
import type { MemoryEntry, MemoryType } from "@/ipc/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Brain,
  Plus,
  Trash2,
  Pencil,
  RefreshCw,
  Loader2,
  Check,
  X,
  Eye,
  EyeOff,
  Sparkles,
  Clock,
  ArrowDown,
  ChevronDown,
  ChevronRight,
} from "@/components/ui/icons";

// =============================================================================
// Types
// =============================================================================

interface MemoryWithScore extends MemoryEntry {
  _score: number;
  _recency: number;
}

const TYPE_WEIGHTS: Record<string, number> = {
  preference: 1.0,
  fact: 0.9,
  decision: 0.8,
  issue: 0.6,
  episode: 0.4,
};

const TYPE_COLORS: Record<string, string> = {
  fact: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  preference: "bg-purple-500/15 text-purple-400 border-purple-500/20",
  issue: "bg-red-500/15 text-red-400 border-red-500/20",
  episode: "bg-green-500/15 text-green-400 border-green-500/20",
  decision: "bg-amber-500/15 text-amber-400 border-amber-500/20",
};

const TYPE_LABELS: Record<string, string> = {
  fact: "Fact",
  preference: "Preference",
  issue: "Issue",
  episode: "Episode",
  decision: "Decision",
};

// =============================================================================
// Scoring (mirrors memory_context_builder.ts)
// =============================================================================

function computeRecency(updatedAt: Date | string | number): number {
  const updated = typeof updatedAt === "number"
    ? updatedAt * 1000
    : new Date(updatedAt).getTime();
  const now = Date.now();
  const hoursAgo = (now - updated) / (1000 * 60 * 60);
  if (hoursAgo < 24) return 1.0;
  if (hoursAgo < 24 * 7) return 0.8;
  if (hoursAgo < 24 * 30) return 0.5;
  return 0.2;
}

function computeScore(mem: MemoryEntry): { score: number; recency: number } {
  const importance = typeof mem.importance === "number"
    ? (mem.importance > 1 ? mem.importance / 100 : mem.importance)
    : 0.5;
  const recency = computeRecency(mem.updatedAt);
  const typeWeight = TYPE_WEIGHTS[mem.type] ?? 0.5;
  const score = importance * 0.5 + recency * 0.3 + typeWeight * 0.2;
  return { score, recency };
}

// =============================================================================
// Component
// =============================================================================

export function MemoryPanel({ appId }: { appId: number }) {
  const [memories, setMemories] = useState<MemoryWithScore[]>([]);
  const [contextPreview, setContextPreview] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isDecaying, setIsDecaying] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [scopeFilter, setScopeFilter] = useState<string>("all");
  const [showDisabled, setShowDisabled] = useState(false);
  const [isContextOpen, setIsContextOpen] = useState(false);

  // Create dialog
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    type: "fact" as MemoryType,
    key: "",
    content: "",
    importance: 70,
    scope: "project" as "global" | "project",
  });
  const [isCreating, setIsCreating] = useState(false);

  // Edit dialog
  const [editMemory, setEditMemory] = useState<MemoryEntry | null>(null);
  const [editForm, setEditForm] = useState({
    content: "",
    importance: 50,
    key: "",
  });

  // ── Load ───────────────────────────────────────────────────────────────
  const loadMemories = useCallback(async () => {
    setIsLoading(true);
    try {
      const raw = await ipc.memory.getMemories(appId);
      const scored = raw.map(m => {
        const { score, recency } = computeScore(m);
        return { ...m, _score: score, _recency: recency };
      });
      scored.sort((a, b) => b._score - a._score);
      setMemories(scored);

      const ctx = await ipc.memory.getMemoryContext(appId);
      setContextPreview(ctx);
    } catch (err) {
      console.error("Failed to load memories:", err);
    } finally {
      setIsLoading(false);
    }
  }, [appId]);

  useEffect(() => { loadMemories(); }, [loadMemories]);

  // ── Actions ────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    setIsCreating(true);
    try {
      await ipc.memory.createMemory({
        appId: createForm.scope === "global" ? 0 : appId,
        type: createForm.type,
        key: createForm.key || null,
        content: createForm.content,
        importance: createForm.importance / 100,
        source: "manual",
      });
      setIsCreateOpen(false);
      setCreateForm({ type: "fact", key: "", content: "", importance: 70, scope: "project" });
      await loadMemories();
    } catch (err) {
      console.error("Failed to create memory:", err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleUpdate = async () => {
    if (!editMemory) return;
    try {
      await ipc.memory.updateMemory({
        id: editMemory.id,
        content: editForm.content,
        importance: editForm.importance / 100,
        key: editForm.key || null,
      });
      setEditMemory(null);
      await loadMemories();
    } catch (err) {
      console.error("Failed to update memory:", err);
    }
  };

  const handleToggle = async (mem: MemoryEntry) => {
    try {
      await ipc.memory.updateMemory({
        id: mem.id,
        enabled: !mem.enabled,
      });
      await loadMemories();
    } catch (err) {
      console.error("Failed to toggle memory:", err);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await ipc.memory.deleteMemory(id);
      await loadMemories();
    } catch (err) {
      console.error("Failed to delete memory:", err);
    }
  };

  const handleDecay = async () => {
    setIsDecaying(true);
    try {
      const count = await ipc.memory.decayMemories(appId);
      console.log(`[Memory] Decayed ${count} memories`);
      await loadMemories();
    } catch (err) {
      console.error("Decay failed:", err);
    } finally {
      setIsDecaying(false);
    }
  };

  // ── Filters ────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return memories.filter(m => {
      if (!showDisabled && !m.enabled) return false;
      if (filter !== "all" && m.type !== filter) return false;
      if (scopeFilter === "global" && m.appId !== 0) return false;
      if (scopeFilter === "project" && m.appId === 0) return false;
      return true;
    });
  }, [memories, filter, scopeFilter, showDisabled]);

  // ── Stats ──────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = memories.length;
    const enabled = memories.filter(m => m.enabled).length;
    const disabled = total - enabled;
    const global = memories.filter(m => m.appId === 0).length;
    const project = total - global;
    const auto = memories.filter(m => m.source === "auto").length;
    const manual = total - auto;
    const byType: Record<string, number> = {};
    for (const m of memories) {
      byType[m.type] = (byType[m.type] || 0) + 1;
    }
    return { total, enabled, disabled, global, project, auto, manual, byType };
  }, [memories]);

  const formatDate = (d: Date | string | number) => {
    try {
      const date = typeof d === "number" ? new Date(d * 1000) : new Date(d);
      return date.toLocaleDateString("es", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    } catch { return "—"; }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">Memorias del Agente</h2>
          <span className="text-xs text-muted-foreground/60 ml-1">
            {stats.enabled}/{stats.total}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1 cursor-pointer"
            onClick={handleDecay}
            disabled={isDecaying}
          >
            {isDecaying ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowDown className="h-3 w-3" />}
            Decay
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1 cursor-pointer"
            onClick={loadMemories}
            disabled={isLoading}
          >
            {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          </Button>
          <Button
            size="sm"
            className="h-7 text-xs gap-1 cursor-pointer"
            onClick={() => setIsCreateOpen(true)}
          >
            <Plus className="h-3 w-3" />
            Nueva
          </Button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex flex-wrap gap-2 text-[11px]">
        <span className="px-2 py-0.5 rounded-full bg-muted/50 text-muted-foreground">
          {stats.total} total
        </span>
        <span className="px-2 py-0.5 rounded-full bg-green-500/10 text-green-400">
          {stats.enabled} activas
        </span>
        {stats.disabled > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-400">
            {stats.disabled} desactivadas
          </span>
        )}
        <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400">
          {stats.project} proyecto
        </span>
        <span className="px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400">
          {stats.global} globales
        </span>
        <span className="px-2 py-0.5 rounded-full bg-muted/50 text-muted-foreground">
          {stats.auto} auto / {stats.manual} manual
        </span>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {["all", "fact", "preference", "issue", "episode", "decision"].map(t => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`px-2 py-0.5 text-[11px] rounded-full border transition-colors cursor-pointer ${
              filter === t
                ? "bg-primary/15 text-primary border-primary/30"
                : "bg-transparent text-muted-foreground/60 border-border/30 hover:border-border/60"
            }`}
          >
            {t === "all" ? "Todas" : TYPE_LABELS[t] || t}
            {t !== "all" && stats.byType[t] ? ` (${stats.byType[t]})` : ""}
          </button>
        ))}
        <div className="mx-1 h-4 w-px bg-border/30" />
        {["all", "project", "global"].map(s => (
          <button
            key={s}
            onClick={() => setScopeFilter(s)}
            className={`px-2 py-0.5 text-[11px] rounded-full border transition-colors cursor-pointer ${
              scopeFilter === s
                ? "bg-primary/15 text-primary border-primary/30"
                : "bg-transparent text-muted-foreground/60 border-border/30 hover:border-border/60"
            }`}
          >
            {s === "all" ? "Ambos scopes" : s === "project" ? "Proyecto" : "Global"}
          </button>
        ))}
        <div className="mx-1 h-4 w-px bg-border/30" />
        <button
          onClick={() => setShowDisabled(!showDisabled)}
          className={`px-2 py-0.5 text-[11px] rounded-full border transition-colors cursor-pointer ${
            showDisabled
              ? "bg-red-500/10 text-red-400 border-red-500/20"
              : "bg-transparent text-muted-foreground/60 border-border/30"
          }`}
        >
          {showDisabled ? <EyeOff className="h-3 w-3 inline mr-1" /> : <Eye className="h-3 w-3 inline mr-1" />}
          Desactivadas
        </button>
      </div>

      {/* Context preview */}
      <div className="border border-border/30 rounded-lg overflow-hidden">
        <button
          onClick={() => setIsContextOpen(!isContextOpen)}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:bg-muted/30 transition-colors cursor-pointer"
        >
          {isContextOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <Sparkles className="h-3 w-3" />
          Vista previa del contexto inyectado ({contextPreview.length} chars)
        </button>
        {isContextOpen && (
          <div className="px-3 py-2 border-t border-border/20 bg-muted/10">
            {contextPreview ? (
              <pre className="text-[11px] text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">
                {contextPreview}
              </pre>
            ) : (
              <p className="text-[11px] text-muted-foreground/50 italic">
                Sin memorias activas para inyectar
              </p>
            )}
          </div>
        )}
      </div>

      {/* Memory list */}
      <div className="space-y-1.5">
        {filtered.length === 0 && (
          <div className="text-center py-8 text-muted-foreground/40 text-sm">
            {memories.length === 0 ? "Sin memorias aún" : "Ninguna memoria coincide con los filtros"}
          </div>
        )}
        {filtered.map(mem => (
          <div
            key={mem.id}
            className={`group border rounded-lg px-3 py-2 transition-all hover:border-border/60 ${
              mem.enabled
                ? "border-border/30 bg-transparent"
                : "border-border/10 bg-muted/5 opacity-50"
            }`}
          >
            {/* Row 1: type badge + content + actions */}
            <div className="flex items-start gap-2">
              <span className={`shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded border ${TYPE_COLORS[mem.type] || "bg-muted text-muted-foreground border-border"}`}>
                {TYPE_LABELS[mem.type] || mem.type}
                {mem.type === "issue" && mem.status ? `:${mem.status}` : ""}
              </span>
              <p className="flex-1 text-xs leading-relaxed min-w-0">
                {mem.content}
              </p>
              <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => {
                    setEditMemory(mem);
                    setEditForm({
                      content: mem.content,
                      importance: typeof mem.importance === "number"
                        ? (mem.importance > 1 ? mem.importance : Math.round(mem.importance * 100))
                        : 50,
                      key: mem.key || "",
                    });
                  }}
                  className="p-1 hover:bg-muted/50 rounded cursor-pointer"
                  title="Editar"
                >
                  <Pencil className="h-3 w-3 text-muted-foreground" />
                </button>
                <button
                  onClick={() => handleToggle(mem)}
                  className="p-1 hover:bg-muted/50 rounded cursor-pointer"
                  title={mem.enabled ? "Desactivar" : "Activar"}
                >
                  {mem.enabled
                    ? <EyeOff className="h-3 w-3 text-muted-foreground" />
                    : <Eye className="h-3 w-3 text-green-400" />
                  }
                </button>
                <button
                  onClick={() => handleDelete(mem.id)}
                  className="p-1 hover:bg-destructive/10 rounded cursor-pointer"
                  title="Eliminar"
                >
                  <Trash2 className="h-3 w-3 text-destructive/60" />
                </button>
              </div>
            </div>
            {/* Row 2: metadata */}
            <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground/50">
              {mem.key && (
                <span className="font-mono bg-muted/30 px-1 rounded">key:{mem.key}</span>
              )}
              <span>imp:{typeof mem.importance === "number" ? (mem.importance > 1 ? mem.importance : Math.round(mem.importance * 100)) : "?"}</span>
              <span>score:{mem._score.toFixed(2)}</span>
              <span>rec:{mem._recency.toFixed(1)}</span>
              <span className={mem.appId === 0 ? "text-purple-400/60" : "text-blue-400/60"}>
                {mem.appId === 0 ? "🌐 global" : `📁 app:${mem.appId}`}
              </span>
              <span>{mem.source}</span>
              <span className="flex items-center gap-0.5">
                <Clock className="h-2.5 w-2.5" />
                {formatDate(mem.updatedAt)}
              </span>
              <span className="text-muted-foreground/30">id:{mem.id}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Create Dialog ── */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-md p-4">
          <DialogHeader className="pb-2">
            <DialogTitle>Nueva memoria</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <select
                value={createForm.type}
                onChange={e => setCreateForm(f => ({ ...f, type: e.target.value as MemoryType }))}
                className="h-9 rounded-md border border-border/40 bg-background px-2 text-xs"
              >
                <option value="fact">Fact</option>
                <option value="preference">Preference</option>
                <option value="issue">Issue</option>
                <option value="episode">Episode</option>
                <option value="decision">Decision</option>
              </select>
              <select
                value={createForm.scope}
                onChange={e => setCreateForm(f => ({ ...f, scope: e.target.value as "global" | "project" }))}
                className="h-9 rounded-md border border-border/40 bg-background px-2 text-xs"
              >
                <option value="project">Proyecto</option>
                <option value="global">Global</option>
              </select>
            </div>
            <Input
              value={createForm.key}
              onChange={e => setCreateForm(f => ({ ...f, key: e.target.value }))}
              placeholder="Key (opcional, ej: backend_stack)"
              className="text-xs"
            />
            <textarea
              value={createForm.content}
              onChange={e => setCreateForm(f => ({ ...f, content: e.target.value }))}
              placeholder="Contenido de la memoria..."
              className="w-full h-20 rounded-md border border-border/40 bg-background p-2 text-xs resize-none"
            />
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">Importancia:</label>
              <input
                type="range"
                min={10}
                max={100}
                step={5}
                value={createForm.importance}
                onChange={e => setCreateForm(f => ({ ...f, importance: Number(e.target.value) }))}
                className="flex-1"
              />
              <span className="text-xs font-mono w-8 text-right">{createForm.importance}</span>
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button variant="outline" size="sm" onClick={() => setIsCreateOpen(false)} className="cursor-pointer">
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={isCreating || !createForm.content.trim()}
              className="cursor-pointer"
            >
              {isCreating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
              Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog ── */}
      <Dialog open={!!editMemory} onOpenChange={open => !open && setEditMemory(null)}>
        <DialogContent className="max-w-md p-4">
          <DialogHeader className="pb-2">
            <DialogTitle>Editar memoria #{editMemory?.id}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={editForm.key}
              onChange={e => setEditForm(f => ({ ...f, key: e.target.value }))}
              placeholder="Key"
              className="text-xs"
            />
            <textarea
              value={editForm.content}
              onChange={e => setEditForm(f => ({ ...f, content: e.target.value }))}
              className="w-full h-20 rounded-md border border-border/40 bg-background p-2 text-xs resize-none"
            />
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">Importancia:</label>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={editForm.importance}
                onChange={e => setEditForm(f => ({ ...f, importance: Number(e.target.value) }))}
                className="flex-1"
              />
              <span className="text-xs font-mono w-8 text-right">{editForm.importance}</span>
            </div>
          </div>
          <DialogFooter className="pt-2">
            <Button variant="outline" size="sm" onClick={() => setEditMemory(null)} className="cursor-pointer">
              Cancelar
            </Button>
            <Button size="sm" onClick={handleUpdate} className="cursor-pointer">
              <Check className="h-3 w-3 mr-1" />
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
