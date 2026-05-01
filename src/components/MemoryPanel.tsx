/**
 * MemoryPanel — Agent memory management UI.
 *
 * Uses the app's design tokens (typo-*, --foreground, --muted, --border, --primary).
 * Title lives in the window bar, not duplicated here.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ipc } from "@/ipc/types";
import type { MemoryEntry, MemoryType } from "@/ipc/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UnifiedSelector } from "@/components/ui/UnifiedSelector";
import type { SelectorOption } from "@/components/ui/UnifiedSelector";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus,
  Trash2,
  Pencil,
  Loader2,
  Check,
  Eye,
  EyeOff,
  Sparkles,
  Clock,
  ChevronDown,
  ChevronRight,
  Dna,
} from "@/components/ui/icons";
import { toast } from "sonner";

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

const TYPE_LABELS: Record<string, string> = {
  fact: "Hecho",
  preference: "Preferencia",
  issue: "Problema",
  episode: "Episodio",
  decision: "Decisión",
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
  const [filter, setFilter] = useState<string>("all");
  const [showDisabled, setShowDisabled] = useState(false);
  const [isContextOpen, setIsContextOpen] = useState(false);

  // Create dialog
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    type: "fact" as MemoryType,
    key: "",
    content: "",
    importance: 70,
  });
  const [isCreating, setIsCreating] = useState(false);

  // Bootstrap
  const [bootstrapRunning, setBootstrapRunning] = useState(false);

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
      setContextPreview(ctx || "");
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
        appId: appId,
        type: createForm.type,
        key: createForm.key || null,
        content: createForm.content,
        importance: createForm.importance / 100,
        source: "manual",
      });
      setIsCreateOpen(false);
      setCreateForm({ type: "fact", key: "", content: "", importance: 70 });
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

  // ── Filters ────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return memories.filter(m => {
      if (!showDisabled && !m.enabled) return false;
      if (filter !== "all" && m.type !== filter) return false;
      return true;
    });
  }, [memories, filter, showDisabled]);

  // ── Stats ──────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = memories.length;
    const enabled = memories.filter(m => m.enabled).length;
    const disabled = total - enabled;
    const auto = memories.filter(m => m.source === "auto").length;
    const manual = total - auto;
    const byType: Record<string, number> = {};
    for (const m of memories) {
      byType[m.type] = (byType[m.type] || 0) + 1;
    }
    return { total, enabled, disabled, auto, manual, byType };
  }, [memories]);

  const formatDate = (d: Date | string | number) => {
    try {
      const date = typeof d === "number" ? new Date(d * 1000) : new Date(d);
      return date.toLocaleDateString("es", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    } catch { return "—"; }
  };

  const normalizeImportance = (imp: unknown): number => {
    if (typeof imp !== "number") return 50;
    return imp > 1 ? imp : Math.round(imp * 100);
  };

  return (
    <div className="space-y-4">
      {/* Toolbar: filters + new button */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
          {["all", "fact", "preference", "issue", "episode", "decision"].map(t => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`px-3 py-1.5 typo-select rounded-lg border transition-colors ${
                filter === t
                  ? "bg-primary/10 text-primary border-primary/20"
                  : "bg-transparent text-muted-foreground border-border hover:bg-muted/50"
              }`}
            >
              {t === "all" ? "Todas" : TYPE_LABELS[t] || t}
              {t !== "all" && stats.byType[t] ? ` (${stats.byType[t]})` : ""}
            </button>
          ))}
          <div className="mx-0.5 h-5 w-px bg-border" />
          <button
            onClick={() => setShowDisabled(!showDisabled)}
            className={`px-3 py-1.5 typo-select rounded-lg border transition-colors flex items-center gap-1.5 ${
              showDisabled
                ? "bg-primary/10 text-primary border-primary/20"
                : "bg-transparent text-muted-foreground border-border hover:bg-muted/50"
            }`}
          >
            {showDisabled ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            Desactivadas
          </button>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            className="typo-button gap-1.5"
            disabled={bootstrapRunning}
            onClick={async () => {
              setBootstrapRunning(true);
              try {
                const result = await ipc.memory.bootstrapProjectMemories({ appId });
                toast.success(
                  `Bootstrap: ${result.phase1Count} (DNA) + ${result.phase2Count} (Explore) memorias`
                );
                await loadMemories();
              } catch (err: any) {
                toast.error(`Bootstrap falló: ${err.message}`);
              } finally {
                setBootstrapRunning(false);
              }
            }}
          >
            {bootstrapRunning ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Escaneando...</>
            ) : (
              <><Dna className="h-4 w-4" /> Escanear proyecto</>
            )}
          </Button>
          {stats.total > 0 && (
            <DeleteConfirmationDialog
              itemName={`las ${stats.total} memorias de esta app`}
              itemType="memorias"
              onDelete={async () => {
                try {
                  const count = await ipc.memory.deleteAllMemories(appId);
                  toast.success(`${count} memorias eliminadas`);
                  await loadMemories();
                } catch (err: any) {
                  toast.error(`Error: ${err.message}`);
                }
              }}
              trigger={
                <Button
                  variant="outline"
                  size="sm"
                  className="typo-button gap-1.5 text-destructive/70 border-destructive/20 hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                  Eliminar todas
                </Button>
              }
            />
          )}
          <Button
            className="typo-button gap-1.5"
            onClick={() => setIsCreateOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Nueva memoria
          </Button>
        </div>
      </div>

      {/* Stats bar — subtle, inline */}
      <div className="flex items-center gap-4 typo-micro text-muted-foreground px-1">
        <span>{stats.total} {stats.total === 1 ? "memoria" : "memorias"}</span>
        <span className="h-3 w-px bg-border" />
        <span>{stats.enabled} activas</span>
        {stats.disabled > 0 && (
          <>
            <span className="h-3 w-px bg-border" />
            <span>{stats.disabled} desactivadas</span>
          </>
        )}
        <span className="h-3 w-px bg-border" />
        <span>{stats.auto} auto · {stats.manual} manual</span>
      </div>

      {/* Context preview */}
      <div className="border border-border rounded-xl">
        <button
          onClick={() => setIsContextOpen(!isContextOpen)}
          className="w-full flex items-center gap-2 px-4 py-2.5 typo-caption text-muted-foreground hover:bg-muted/30 transition-colors rounded-xl"
        >
          {isContextOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <Sparkles className="h-3.5 w-3.5" />
          Contexto inyectado
        </button>
        {isContextOpen && (
          <div className="px-4 py-3 border-t border-border bg-muted/20 max-h-[300px] overflow-y-auto rounded-b-xl">
            {contextPreview ? (
              <pre className="typo-mono-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                {contextPreview}
              </pre>
            ) : (
              <p className="typo-caption text-muted-foreground italic">
                Sin memorias activas para inyectar
              </p>
            )}
          </div>
        )}
      </div>

      {/* Memory list */}
      <div className="space-y-1">
        {isLoading && memories.length === 0 && (
          <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground typo-caption">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando memorias...
          </div>
        )}
        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-10 space-y-3">
            <p className="text-muted-foreground typo-caption">
              {memories.length === 0 ? "Sin memorias aún" : "Ninguna memoria coincide con los filtros"}
            </p>
            {bootstrapRunning && (
              <div className="flex items-center justify-center gap-2 text-muted-foreground typo-caption">
                <Loader2 className="h-4 w-4 animate-spin" />
                Escaneando proyecto...
              </div>
            )}
          </div>
        )}
        {filtered.map(mem => (
          <div
            key={mem.id}
            className={`group border rounded-xl px-4 py-3 transition-all hover:bg-muted/30 ${
              mem.enabled
                ? "border-border"
                : "border-border/50 opacity-50"
            }`}
          >
            {/* Row 1: type badge + content + actions */}
            <div className="flex items-start gap-3">
              <span className="shrink-0 px-2 py-0.5 typo-micro rounded-md bg-muted text-muted-foreground border border-border">
                {TYPE_LABELS[mem.type] || mem.type}
                {mem.type === "issue" && mem.status ? `:${mem.status}` : ""}
              </span>
              <p className="flex-1 typo-body leading-relaxed min-w-0">
                {mem.content}
              </p>
              <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => {
                    setEditMemory(mem);
                    setEditForm({
                      content: mem.content,
                      importance: normalizeImportance(mem.importance),
                      key: mem.key || "",
                    });
                  }}
                  className="flex items-center gap-1 px-2 py-1 typo-micro text-muted-foreground hover:bg-muted rounded-lg transition-colors"
                >
                  <Pencil className="h-3 w-3" />
                  Editar
                </button>
                <button
                  onClick={() => handleToggle(mem)}
                  className="flex items-center gap-1 px-2 py-1 typo-micro text-muted-foreground hover:bg-muted rounded-lg transition-colors"
                >
                  {mem.enabled
                    ? <><EyeOff className="h-3 w-3" /> Desactivar</>
                    : <><Eye className="h-3 w-3 text-primary" /> Activar</>
                  }
                </button>
                <DeleteConfirmationDialog
                  itemName={mem.content.slice(0, 60) + (mem.content.length > 60 ? "..." : "")}
                  itemType="memoria"
                  onDelete={() => handleDelete(mem.id)}
                  trigger={
                    <button
                      className="flex items-center gap-1 px-2 py-1 typo-micro text-destructive/60 hover:bg-destructive/10 rounded-lg transition-colors"
                    >
                      <Trash2 className="h-3 w-3" />
                      Eliminar
                    </button>
                  }
                />
              </div>
            </div>
            {/* Row 2: metadata */}
            <div className="flex items-center gap-3 mt-2 typo-micro text-muted-foreground">
              {mem.key && (
                <span className="typo-mono-xs bg-muted/50 px-1.5 py-0.5 rounded">key:{mem.key}</span>
              )}
              <span>imp:{normalizeImportance(mem.importance)}</span>
              <span>score:{mem._score.toFixed(2)}</span>
              <span>{mem.source}</span>
              <span className="flex items-center gap-0.5">
                <Clock className="h-2.5 w-2.5" />
                {formatDate(mem.updatedAt)}
              </span>
              <span className="text-muted-foreground/40">#{mem.id}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Create Dialog ── */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>Nueva memoria</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="typo-label">Tipo</label>
              <UnifiedSelector
                value={createForm.type}
                onChange={(v) => setCreateForm(f => ({ ...f, type: v as MemoryType }))}
                triggerVariant="default"
                triggerSize="md"
                triggerClassName="w-full justify-between"
                showCheckmark
                popoverWidth="w-[580px]"
                options={[
                  { value: "fact", label: "Hecho", description: "Datos técnicos del proyecto: stack, estructura, versiones, dependencias" },
                  { value: "preference", label: "Preferencia", description: "Convenciones y gustos del usuario: estilo de código, idioma, patrones favoritos" },
                  { value: "decision", label: "Decisión", description: "Elecciones de arquitectura o diseño tomadas y su justificación" },
                  { value: "issue", label: "Problema", description: "Bugs conocidos, gotchas, limitaciones técnicas a tener en cuenta" },
                  { value: "episode", label: "Episodio", description: "Eventos o interacciones relevantes ocurridas en sesiones anteriores" },
                ]}
              />
            </div>
            <div className="space-y-2">
              <label className="typo-label">Key (opcional)</label>
              <Input
                value={createForm.key}
                onChange={e => setCreateForm(f => ({ ...f, key: e.target.value }))}
                placeholder="ej: backend_stack"
              />
              <p className="typo-caption">Identificador único para sobrescribir memorias duplicadas</p>
            </div>
            <div className="space-y-2">
              <label className="typo-label">Contenido</label>
              <textarea
                value={createForm.content}
                onChange={e => setCreateForm(f => ({ ...f, content: e.target.value }))}
                placeholder="Contenido de la memoria..."
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 typo-body ring-offset-background placeholder:opacity-50 resize-none"
              />
            </div>
            <div className="space-y-2">
              <label className="typo-label flex justify-between">
                Importancia
                <span className={`typo-caption font-semibold ${
                  createForm.importance >= 90 ? "text-rose-500" :
                  createForm.importance >= 70 ? "text-amber-500" :
                  "text-blue-500"
                }`}>
                  {createForm.importance} — {
                    createForm.importance >= 90 ? "Crítico" :
                    createForm.importance >= 70 ? "Alto" :
                    "Medio"
                  }
                </span>
              </label>
              <input
                type="range"
                min={50}
                max={100}
                step={5}
                value={createForm.importance}
                onChange={e => setCreateForm(f => ({ ...f, importance: Number(e.target.value) }))}
                className="w-full accent-primary"
              />
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1">
                <p className="typo-micro font-semibold text-muted-foreground/80 uppercase tracking-wider">Guía de importancia</p>
                <div className="grid gap-0.5 typo-micro text-muted-foreground">
                  <span><span className="inline-block w-2 h-2 rounded-full bg-rose-500 mr-1.5" />90–100 · Crítico: stack principal, convenciones globales del proyecto</span>
                  <span><span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1.5" />70–85 · Alto: arquitectura de módulos, librerías clave, flujos de auth</span>
                  <span><span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1.5" />50–65 · Medio: gotchas técnicos, preferencias de formato, rarezas de APIs</span>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleCreate}
              disabled={isCreating || !createForm.content.trim()}
            >
              {isCreating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
              Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog ── */}
      <Dialog open={!!editMemory} onOpenChange={open => !open && setEditMemory(null)}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>Editar memoria #{editMemory?.id}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="typo-label">Key</label>
              <Input
                value={editForm.key}
                onChange={e => setEditForm(f => ({ ...f, key: e.target.value }))}
                placeholder="Key"
              />
            </div>
            <div className="space-y-2">
              <label className="typo-label">Contenido</label>
              <textarea
                value={editForm.content}
                onChange={e => setEditForm(f => ({ ...f, content: e.target.value }))}
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 typo-body ring-offset-background placeholder:opacity-50 resize-none"
              />
            </div>
            <div className="space-y-2">
              <label className="typo-label flex justify-between">
                Importancia
                <span className={`typo-caption font-semibold ${
                  editForm.importance >= 90 ? "text-rose-500" :
                  editForm.importance >= 70 ? "text-amber-500" :
                  editForm.importance >= 50 ? "text-blue-500" :
                  "text-muted-foreground"
                }`}>
                  {editForm.importance} — {
                    editForm.importance >= 90 ? "Crítico" :
                    editForm.importance >= 70 ? "Alto" :
                    editForm.importance >= 50 ? "Medio" :
                    "Bajo (puede ser podada)"
                  }
                </span>
              </label>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={editForm.importance}
                onChange={e => setEditForm(f => ({ ...f, importance: Number(e.target.value) }))}
                className="w-full accent-primary"
              />
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1">
                <p className="typo-micro font-semibold text-muted-foreground/80 uppercase tracking-wider">Guía de importancia</p>
                <div className="grid gap-0.5 typo-micro text-muted-foreground">
                  <span><span className="inline-block w-2 h-2 rounded-full bg-rose-500 mr-1.5" />90–100 · Crítico: stack principal, convenciones globales del proyecto</span>
                  <span><span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1.5" />70–85 · Alto: arquitectura de módulos, librerías clave, flujos de auth</span>
                  <span><span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1.5" />50–65 · Medio: gotchas técnicos, preferencias de formato, rarezas de APIs</span>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditMemory(null)}>Cancelar</Button>
            <Button onClick={handleUpdate}>
              <Check className="h-4 w-4 mr-2" />
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
