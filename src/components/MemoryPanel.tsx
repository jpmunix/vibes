/**
 * MemoryPanel — Agent preferences management UI.
 *
 * Uses the app's design tokens (typo-*, --foreground, --muted, --border, --primary).
 * Title lives in the window bar, not duplicated here.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ipc } from "@/ipc/types";
import type { MemoryEntry } from "@/ipc/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UnifiedSelector } from "@/components/ui/UnifiedSelector";

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
  RefreshCw,
  MoreHorizontal,
} from "@/components/ui/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

// =============================================================================
// Types
// =============================================================================

interface MemoryWithScore extends MemoryEntry {
  _score: number;
  _recency: number;
}



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
  const typeWeight = 1.0;
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
  const [sortBy, setSortBy] = useState<string>("score");
  const [isContextOpen, setIsContextOpen] = useState(false);

  // Create dialog
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    key: "",
    content: "",
    importance: 70,
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
      // Only show manual preferences — old session/issue/auto memories stay in DB but are hidden
      const filtered = raw.filter(m => m.type === "preference" && m.source === "manual");
      const scored = filtered.map(m => {
        const { score, recency } = computeScore(m);
        return { ...m, _score: score, _recency: recency };
      });
      scored.sort((a, b) => b._score - a._score);
      setMemories(scored);

      const ctx = await ipc.memory.getMemoryContext(appId);
      setContextPreview(ctx || "");
    } catch (err) {
      console.error("Failed to load preferences:", err);
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
        type: "preference",
        key: createForm.key || null,
        content: createForm.content,
        importance: createForm.importance / 100,
        source: "manual",
      });
      setIsCreateOpen(false);
      setCreateForm({ key: "", content: "", importance: 70 });
      await loadMemories();
    } catch (err) {
      console.error("Failed to create preference:", err);
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
      console.error("Failed to update preference:", err);
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
      console.error("Failed to toggle preference:", err);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await ipc.memory.deleteMemory(id);
      await loadMemories();
    } catch (err) {
      console.error("Failed to delete preference:", err);
    }
  };

  const normalizeImportance = (imp: unknown): number => {
    if (typeof imp !== "number") return 50;
    return imp > 1 ? imp : Math.round(imp * 100);
  };

  // ── Filters & Sort ──────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let result = memories.filter(m => {
      if (filter === "disabled") return !m.enabled;
      if (!m.enabled) return false; // all other filters exclude disabled
      return true;
    });

    // Sort
    switch (sortBy) {
      case "score":
        result.sort((a, b) => b._score - a._score);
        break;
      case "imp_desc":
        result.sort((a, b) => normalizeImportance(b.importance) - normalizeImportance(a.importance));
        break;
      case "imp_asc":
        result.sort((a, b) => normalizeImportance(a.importance) - normalizeImportance(b.importance));
        break;
      case "score_asc":
        result.sort((a, b) => a._score - b._score);
        break;
      case "date":
        result.sort((a, b) => {
          const da = typeof a.updatedAt === "number" ? a.updatedAt : new Date(a.updatedAt).getTime() / 1000;
          const db_ = typeof b.updatedAt === "number" ? b.updatedAt : new Date(b.updatedAt).getTime() / 1000;
          return db_ - da;
        });
        break;
      case "date_asc":
        result.sort((a, b) => {
          const da = typeof a.updatedAt === "number" ? a.updatedAt : new Date(a.updatedAt).getTime() / 1000;
          const db_ = typeof b.updatedAt === "number" ? b.updatedAt : new Date(b.updatedAt).getTime() / 1000;
          return da - db_;
        });
        break;
    }

    return result;
  }, [memories, filter, sortBy]);

  // ── Stats ──────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = memories.length;
    const enabled = memories.filter(m => m.enabled).length;
    const disabled = total - enabled;
    return { total, enabled, disabled };
  }, [memories]);

  const formatDate = (d: Date | string | number) => {
    try {
      const date = typeof d === "number" ? new Date(d * 1000) : new Date(d);
      return date.toLocaleDateString("es", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    } catch { return "—"; }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar: filters + new button */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <UnifiedSelector
            value={filter}
            onChange={(v) => setFilter(v as string)}
            triggerVariant="outline"
            triggerSize="sm"
            triggerClassName="min-w-[140px]"
            showCheckmark
            options={[
              { value: "all", label: `Todas (${stats.total})` },
              { value: "disabled", label: `Desactivadas (${stats.disabled})` },
            ]}
          />
          <UnifiedSelector
            value={sortBy}
            onChange={(v) => setSortBy(v as string)}
            triggerVariant="outline"
            triggerSize="sm"
            triggerClassName="min-w-[140px]"
            showCheckmark
            options={[
              { value: "score", label: "Score ↓" },
              { value: "score_asc", label: "Score ↑" },
              { value: "imp_desc", label: "Importancia ↓" },
              { value: "imp_asc", label: "Importancia ↑" },
              { value: "date", label: "Más recientes" },
              { value: "date_asc", label: "Más antiguas" },
            ]}
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            className="typo-button gap-1.5"
            onClick={() => setIsCreateOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Nueva directriz
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[200px]">
              <DropdownMenuItem onClick={loadMemories}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refrescar
              </DropdownMenuItem>

              {stats.total > 0 && (
                <DeleteConfirmationDialog
                  itemName={`las ${stats.total} directrices de esta app`}
                  itemType="directrices"
                  onDelete={async () => {
                    try {
                      const count = await ipc.memory.deleteAllMemories(appId);
                      toast.success(`${count} directrices eliminadas`);
                      await loadMemories();
                    } catch (err: any) {
                      toast.error(`Error: ${err.message}`);
                    }
                  }}
                  trigger={
                    <DropdownMenuItem
                      className="text-destructive/70 focus:text-destructive"
                      onSelect={(e) => e.preventDefault()}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Eliminar todas
                    </DropdownMenuItem>
                  }
                />
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Stats bar — subtle, inline */}
      <div className="flex items-center gap-4 typo-micro text-muted-foreground px-1">
        <span>{stats.total} {stats.total === 1 ? "directriz" : "directrices"}</span>
        <span className="h-3 w-px bg-border" />
        <span>{stats.enabled} activas</span>
        {stats.disabled > 0 && (
          <>
            <span className="h-3 w-px bg-border" />
            <span>{stats.disabled} desactivadas</span>
          </>
        )}
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
                Sin directrices activas para inyectar
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
            Cargando directrices...
          </div>
        )}
        {!isLoading && filtered.length === 0 && (
          <div className="text-center py-10 space-y-3">
            <p className="text-muted-foreground typo-caption">
              {memories.length === 0 ? "Sin directrices aún" : "Ninguna directriz coincide con los filtros"}
            </p>
          </div>
        )}
        {filtered.map(mem => {
          const imp = normalizeImportance(mem.importance);
          const impColor = imp >= 90 ? "bg-rose-500" : imp >= 70 ? "bg-amber-500" : imp >= 50 ? "bg-blue-500" : "bg-muted-foreground/30";
          const impLabel = imp >= 90 ? "Crítico" : imp >= 70 ? "Alto" : imp >= 50 ? "Medio" : "Bajo";


          return (
          <div
            key={mem.id}
            className={`group border rounded-xl overflow-hidden transition-all hover:bg-muted/20 ${
              mem.enabled
                ? "border-border"
                : "border-border/50 opacity-50"
            }`}
          >

            <div className="px-4 py-3 space-y-2">
              {/* Row 1: metadata chips + actions */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                  {/* Key pill */}
                  {mem.key && (
                    <span className="typo-mono-xs bg-muted/60 text-muted-foreground px-1.5 py-0.5 rounded-md border border-border/50">
                      {mem.key}
                    </span>
                  )}
                  {/* Importance chip */}
                  <span className="flex items-center gap-1 typo-micro text-muted-foreground/70">
                    <span className={`inline-block w-1.5 h-1.5 rounded-full ${impColor}`} />
                    {imp} · {impLabel}
                  </span>
                </div>
                {/* Actions — visible on hover */}
                <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => {
                      setEditMemory(mem);
                      setEditForm({
                        content: mem.content,
                        importance: normalizeImportance(mem.importance),
                        key: mem.key || "",
                      });
                    }}
                    className="p-1.5 text-muted-foreground hover:bg-muted rounded-lg transition-colors"
                    title="Editar"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => handleToggle(mem)}
                    className="p-1.5 text-muted-foreground hover:bg-muted rounded-lg transition-colors"
                    title={mem.enabled ? "Desactivar" : "Activar"}
                  >
                    {mem.enabled
                      ? <EyeOff className="h-3 w-3" />
                      : <Eye className="h-3 w-3 text-primary" />
                    }
                  </button>
                  <DeleteConfirmationDialog
                    itemName={mem.content.slice(0, 60) + (mem.content.length > 60 ? "..." : "")}
                    itemType="directriz"
                    onDelete={() => handleDelete(mem.id)}
                    trigger={
                      <button
                        className="p-1.5 text-destructive/50 hover:bg-destructive/10 rounded-lg transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    }
                  />
                </div>
              </div>

              {/* Row 2: content */}
              <p className="typo-body leading-relaxed text-foreground/90">
                {mem.content}
              </p>

              {/* Row 3: footer — date */}
              <div className="flex items-center gap-3 typo-micro text-muted-foreground/50">
                <span className="flex items-center gap-1">
                  <Clock className="h-2.5 w-2.5" />
                  {formatDate(mem.updatedAt)}
                </span>
              </div>
            </div>
          </div>
          );
        })}
      </div>

      {/* ── Create Dialog ── */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>Nueva directriz</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">

            <div className="space-y-2">
              <label className="typo-label">Key (opcional)</label>
              <Input
                value={createForm.key}
                onChange={e => setCreateForm(f => ({ ...f, key: e.target.value }))}
                placeholder="ej: backend_stack"
              />
              <p className="typo-caption">Identificador único para sobrescribir directrices duplicadas</p>
            </div>
            <div className="space-y-2">
              <label className="typo-label">Contenido</label>
              <textarea
                value={createForm.content}
                onChange={e => setCreateForm(f => ({ ...f, content: e.target.value }))}
                placeholder="Contenido de la directriz..."
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
            <DialogTitle>Editar directriz #{editMemory?.id}</DialogTitle>
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
