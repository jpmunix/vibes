import { useState, useEffect, useCallback, useMemo } from "react";
import { ipc } from "@/ipc/types";
import type { KnowledgeEntry, KnowledgeCategory, KnowledgeHealthResult } from "@/ipc/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { showError, showSuccess } from "@/lib/toast";
import {
    Plus,
    Trash2,
    ToggleLeft,
    ToggleRight,
    Sparkles,
    Pencil,
    Check,
    X,
    ShieldAlert,
    Inbox,
    AlertTriangle,
    CheckCheck,
    Zap,
    Loader2,
} from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { HelpCircle } from "lucide-react";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";

// Max entries constant — matches backend
const MAX_ENTRIES = 50;

// Category config
const CATEGORIES: {
    value: KnowledgeCategory;
    label: string;
    emoji: string;
    description: string;
}[] = [
        {
            value: "convention",
            label: "Convención",
            emoji: "📐",
            description: "Estándares de código del proyecto",
        },
        {
            value: "pattern",
            label: "Patrón",
            emoji: "🔁",
            description: "Patrones de diseño recurrentes",
        },
        {
            value: "preference",
            label: "Preferencia",
            emoji: "⚙️",
            description: "Preferencias de estilo y herramientas",
        },
        {
            value: "rule",
            label: "Regla",
            emoji: "🚫",
            description: "Cosas que NUNCA hacer",
        },
        {
            value: "component",
            label: "Componente",
            emoji: "🧩",
            description: "Componentes propios a usar siempre",
        },
    ];

function getCategoryConfig(category: KnowledgeCategory) {
    return CATEGORIES.find((c) => c.value === category) || CATEGORIES[0];
}

// Source badges
function SourceBadge({ source }: { source: string }) {
    const config: Record<string, { label: string; className: string }> = {
        manual: {
            label: "Manual",
            className:
                "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
        },
        "auto-extracted": {
            label: "Auto",
            className:
                "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
        },
        inferred: {
            label: "Inferida",
            className:
                "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
        },
    };

    const c = config[source] || config.manual;
    return (
        <span
            className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${c.className}`}
        >
            {c.label}
        </span>
    );
}

// Durability badge (v2)
function DurabilityBadge({ durability }: { durability: string | null | undefined }) {
    if (!durability || durability === "permanent") return null;
    return (
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
            {durability === "project-phase" ? "Fase" : "Temp"}
        </span>
    );
}

export function KnowledgeBaseModal({
    appId,
    isOpen,
    onClose
}: {
    appId: number;
    isOpen: boolean;
    onClose: () => void;
}) {
    const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
    const [isAdding, setIsAdding] = useState(false);
    const [newContent, setNewContent] = useState("");
    const [newCategory, setNewCategory] = useState<KnowledgeCategory>("convention");
    const [isLoading, setIsLoading] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editContent, setEditContent] = useState("");
    const [editCategory, setEditCategory] = useState<KnowledgeCategory>("convention");
    const [activeTab, setActiveTab] = useState<"active" | "pending">("active");
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [healthResult, setHealthResult] = useState<KnowledgeHealthResult | null>(null);

    const loadEntries = useCallback(async () => {
        try {
            const result = await ipc.knowledge.getKnowledgeEntries(appId);
            setEntries(result);
        } catch (error) {
            console.error("Failed to load knowledge entries:", error);
        }
    }, [appId]);

    useEffect(() => {
        if (isOpen) {
            loadEntries();
            setHealthResult(null);
            // Run decay on open
            ipc.knowledge.decayKnowledge(appId).catch(() => { });
        }
    }, [isOpen, loadEntries, appId]);

    // Computed counts
    const activeEntries = useMemo(() => entries.filter((e) => e.enabled), [entries]);
    const pendingEntries = useMemo(() => entries.filter((e) => !e.enabled && e.source === "auto-extracted"), [entries]);
    const disabledManual = useMemo(() => entries.filter((e) => !e.enabled && e.source !== "auto-extracted"), [entries]);

    const activeCount = activeEntries.length;
    const pendingCount = pendingEntries.length;

    const handleAdd = async () => {
        if (!newContent.trim()) return;
        setIsLoading(true);
        try {
            await ipc.knowledge.createKnowledgeEntry({
                appId,
                category: newCategory,
                content: newContent.trim(),
                source: "manual",
                confidence: 100,
            });
            setNewContent("");
            setIsAdding(false);
            showSuccess("Regla añadida a la base de conocimientos");
            await loadEntries();
        } catch (error) {
            showError(error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleToggle = async (entry: KnowledgeEntry) => {
        try {
            await ipc.knowledge.updateKnowledgeEntry({
                id: entry.id,
                enabled: !entry.enabled,
            });
            await loadEntries();
        } catch (error) {
            showError(error);
        }
    };

    const handleStartEdit = (entry: KnowledgeEntry) => {
        setEditingId(entry.id);
        setEditContent(entry.content);
        setEditCategory(entry.category);
    };

    const handleSaveEdit = async () => {
        if (!editingId || !editContent.trim()) return;
        setIsLoading(true);
        try {
            await ipc.knowledge.updateKnowledgeEntry({
                id: editingId,
                content: editContent.trim(),
                category: editCategory,
            });
            setEditingId(null);
            showSuccess("Regla actualizada");
            await loadEntries();
        } catch (error) {
            showError(error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async (entryId: number) => {
        try {
            await ipc.knowledge.deleteKnowledgeEntry(entryId);
            await loadEntries();
        } catch (error) {
            showError(error);
        }
    };

    const handleApproveEntry = async (entryId: number) => {
        try {
            await ipc.knowledge.bulkApproveKnowledge({ entryIds: [entryId] });
            showSuccess("Entrada aprobada");
            await loadEntries();
        } catch (error) {
            showError(error);
        }
    };

    const handleApprovePending = async () => {
        if (pendingEntries.length === 0) return;
        setIsLoading(true);
        try {
            await ipc.knowledge.bulkApproveKnowledge({
                entryIds: pendingEntries.map((e) => e.id),
            });
            showSuccess(`${pendingEntries.length} entradas aprobadas`);
            await loadEntries();
        } catch (error) {
            showError(error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDismissPending = async () => {
        if (pendingEntries.length === 0) return;
        setIsLoading(true);
        try {
            // Delete pending entries instead of just disabling
            for (const entry of pendingEntries) {
                await ipc.knowledge.deleteKnowledgeEntry(entry.id);
            }
            showSuccess(`${pendingEntries.length} entradas descartadas`);
            await loadEntries();
        } catch (error) {
            showError(error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAnalyzeHealth = async () => {
        setIsAnalyzing(true);
        try {
            const result = await ipc.knowledge.analyzeKnowledgeHealth(appId);
            setHealthResult(result);

            const issues =
                result.noise.length +
                result.redundant.reduce((acc, r) => acc + r.remove.length, 0) +
                result.contradictions.length;

            if (issues === 0) {
                showSuccess("¡Base de conocimientos limpia! Sin problemas detectados.");
            } else {
                showSuccess(`Análisis completado: ${issues} problema(s) detectado(s)`);
            }
        } catch (error) {
            showError(error);
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleCleanNoise = async () => {
        if (!healthResult || healthResult.noise.length === 0) return;
        setIsLoading(true);
        try {
            await ipc.knowledge.bulkDisableKnowledge({
                entryIds: healthResult.noise,
            });
            showSuccess(`${healthResult.noise.length} entradas de ruido desactivadas`);
            setHealthResult(null);
            await loadEntries();
        } catch (error) {
            showError(error);
        } finally {
            setIsLoading(false);
        }
    };

    const noiseIds = useMemo(() => new Set(healthResult?.noise || []), [healthResult]);
    const contradictionIds = useMemo(() => {
        const ids = new Set<number>();
        for (const c of healthResult?.contradictions || []) {
            ids.add(c.entryA);
            ids.add(c.entryB);
        }
        return ids;
    }, [healthResult]);
    const redundantRemoveIds = useMemo(() => {
        const ids = new Set<number>();
        for (const r of healthResult?.redundant || []) {
            for (const id of r.remove) ids.add(id);
        }
        return ids;
    }, [healthResult]);

    const displayEntries = activeTab === "active"
        ? [...activeEntries, ...disabledManual]
        : pendingEntries;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-[95vw]! sm:max-w-[1400px]! w-[95vw]! h-[92vh]! max-h-[92vh]! overflow-hidden flex flex-col p-6">
                <DialogHeader>
                    <div className="flex items-center gap-2">
                        <DialogTitle>Base de Conocimientos IA</DialogTitle>
                        {entries.length > 0 && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                                {activeCount}/{MAX_ENTRIES}
                            </span>
                        )}
                        {pendingCount > 0 && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 animate-pulse">
                                {pendingCount} pendientes
                            </span>
                        )}
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6 ml-1">
                                    <HelpCircle className="h-4 w-4 text-muted-foreground" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-80 p-4">
                                <h4 className="font-medium mb-2">¿Qué significa cada categoría?</h4>
                                <div className="space-y-3 text-sm">
                                    {CATEGORIES.map((cat) => (
                                        <div key={cat.value} className="flex gap-2">
                                            <span className="text-lg">{cat.emoji}</span>
                                            <div>
                                                <p className="font-medium text-xs">{cat.label}</p>
                                                <p className="text-xs text-muted-foreground leading-snug">
                                                    {cat.description}
                                                    {cat.value === "convention" && " (ej: usar siempre camelCase)"}
                                                    {cat.value === "pattern" && " (ej: estructura de carpetas específica)"}
                                                    {cat.value === "preference" && " (ej: prefiero textos cortos)"}
                                                    {cat.value === "rule" && " (ej: NUNCA borrar base de datos)"}
                                                    {cat.value === "component" && " (ej: usar MiBoton en vez de <button>)"}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-3 pt-3 border-t text-xs text-muted-foreground">
                                    <p className="font-medium text-xs text-foreground mb-1">Sistema v2</p>
                                    <p>El extractor ahora filtra ruido automáticamente, detecta duplicados semánticos y clasifica la durabilidad de cada regla.</p>
                                </div>
                            </PopoverContent>
                        </Popover>
                    </div>
                    <DialogDescription>
                        La IA aprende y respeta estas reglas automáticamente en cada interacción.
                    </DialogDescription>
                </DialogHeader>

                {/* Tab bar */}
                <div className="flex items-center gap-2 mt-2 mb-1 border-b border-gray-200 dark:border-gray-700">
                    <button
                        onClick={() => setActiveTab("active")}
                        className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors cursor-pointer ${activeTab === "active"
                            ? "border-violet-500 text-violet-600 dark:text-violet-400"
                            : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                            }`}
                    >
                        Activas ({activeCount})
                    </button>
                    <button
                        onClick={() => setActiveTab("pending")}
                        className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${activeTab === "pending"
                            ? "border-amber-500 text-amber-600 dark:text-amber-400"
                            : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                            }`}
                    >
                        <Inbox className="h-3.5 w-3.5" />
                        Pendientes ({pendingCount})
                        {pendingCount > 0 && (
                            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                        )}
                    </button>

                    <div className="flex-1" />

                    {/* Health analysis button */}
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleAnalyzeHealth}
                        disabled={isAnalyzing || activeCount < 3}
                        className="text-xs h-7 gap-1.5"
                    >
                        {isAnalyzing ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <Zap className="h-3.5 w-3.5" />
                        )}
                        {isAnalyzing ? "Analizando..." : "Limpiar ruido"}
                    </Button>
                </div>

                {/* Health analysis results */}
                {healthResult && (healthResult.noise.length > 0 || healthResult.contradictions.length > 0 || healthResult.redundant.some(r => r.remove.length > 0)) && (
                    <div className="flex items-center gap-2 p-2 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 text-xs">
                        <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                        <span className="flex-1 text-amber-700 dark:text-amber-300">
                            {healthResult.noise.length > 0 && `${healthResult.noise.length} ruido `}
                            {healthResult.redundant.filter(r => r.remove.length > 0).length > 0 && `${healthResult.redundant.reduce((a, r) => a + r.remove.length, 0)} redundantes `}
                            {healthResult.contradictions.length > 0 && `${healthResult.contradictions.length} contradicciones`}
                            {" — las entradas detectadas están marcadas en la lista"}
                        </span>
                        {healthResult.noise.length > 0 && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleCleanNoise}
                                className="h-6 text-[10px] border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                            >
                                Desactivar ruido ({healthResult.noise.length})
                            </Button>
                        )}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => setHealthResult(null)}
                        >
                            <X className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto pr-2 -mr-2">
                    {/* Pending tab: bulk actions */}
                    {activeTab === "pending" && pendingCount > 0 && (
                        <div className="flex items-center gap-2 mb-3 p-2 rounded-md bg-gray-50 dark:bg-gray-800/50">
                            <span className="text-xs text-gray-500 flex-1">
                                {pendingCount} entrada{pendingCount !== 1 ? "s" : ""} esperando revisión
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleApprovePending}
                                disabled={isLoading}
                                className="h-7 text-xs gap-1 text-green-600 border-green-300 hover:bg-green-50 dark:text-green-400 dark:border-green-800 dark:hover:bg-green-900/20"
                            >
                                <CheckCheck className="h-3.5 w-3.5" />
                                Aprobar todas
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleDismissPending}
                                disabled={isLoading}
                                className="h-7 text-xs gap-1 text-red-600 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/20"
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                                Descartar todas
                            </Button>
                        </div>
                    )}

                    {/* Entries list */}
                    {displayEntries.length > 0 ? (
                        <div className="space-y-2 mb-3">
                            {displayEntries.map((entry) => {
                                const cat = getCategoryConfig(entry.category);
                                const isEditing = editingId === entry.id;
                                const isNoise = noiseIds.has(entry.id);
                                const isContradiction = contradictionIds.has(entry.id);
                                const isRedundant = redundantRemoveIds.has(entry.id);
                                const hasHealthFlag = isNoise || isContradiction || isRedundant;

                                if (isEditing) {
                                    return (
                                        <div
                                            key={entry.id}
                                            className="space-y-2 p-3 border border-violet-200 dark:border-violet-800 rounded-md bg-violet-50/10 dark:bg-violet-950/10"
                                        >
                                            <div className="flex gap-1.5 flex-wrap mb-1">
                                                {CATEGORIES.map((cat) => (
                                                    <button
                                                        key={cat.value}
                                                        onClick={() => setEditCategory(cat.value)}
                                                        className={`text-[10px] px-2 py-0.5 rounded-full transition-colors cursor-pointer ${editCategory === cat.value
                                                            ? "bg-violet-500 text-white"
                                                            : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                                                            }`}
                                                    >
                                                        {cat.emoji} {cat.label}
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="flex gap-2">
                                                <Input
                                                    value={editContent}
                                                    onChange={(e) => setEditContent(e.target.value)}
                                                    className="text-xs h-8 flex-1"
                                                    autoFocus
                                                    onKeyDown={(e) => {
                                                        if (e.key === "Enter") handleSaveEdit();
                                                        if (e.key === "Escape") setEditingId(null);
                                                    }}
                                                />
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className="h-8 w-8 text-green-500 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"
                                                    onClick={handleSaveEdit}
                                                    disabled={isLoading || !editContent.trim()}
                                                >
                                                    <Check className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className="h-8 w-8 text-gray-400 hover:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                                                    onClick={() => setEditingId(null)}
                                                >
                                                    <X className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </div>
                                    );
                                }

                                return (
                                    <div
                                        key={entry.id}
                                        className={`flex items-start gap-2 p-2 rounded-md border text-sm transition-all ${hasHealthFlag
                                            ? isNoise
                                                ? "border-red-300 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20"
                                                : isContradiction
                                                    ? "border-yellow-300 dark:border-yellow-800 bg-yellow-50/50 dark:bg-yellow-950/20"
                                                    : "border-orange-300 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/20"
                                            : entry.enabled
                                                ? "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                                                : "border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 opacity-50"
                                            }`}
                                    >
                                        <span className="text-sm mt-0.5 flex-shrink-0">
                                            {cat.emoji}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <p
                                                className={`text-xs ${entry.enabled ? "" : "line-through text-gray-400"}`}
                                            >
                                                {entry.content}
                                            </p>
                                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                                <SourceBadge source={entry.source} />
                                                <DurabilityBadge durability={entry.durability} />
                                                {entry.confidence < 100 && (
                                                    <span className="text-[10px] text-gray-400">
                                                        {entry.confidence}%
                                                    </span>
                                                )}
                                                {isNoise && (
                                                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 flex items-center gap-0.5">
                                                        <ShieldAlert className="h-3 w-3" />
                                                        Ruido
                                                    </span>
                                                )}
                                                {isContradiction && (
                                                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 flex items-center gap-0.5">
                                                        <AlertTriangle className="h-3 w-3" />
                                                        Contradicción
                                                    </span>
                                                )}
                                                {isRedundant && (
                                                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                                                        Redundante
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-0.5 flex-shrink-0">
                                            {activeTab === "pending" && (
                                                <button
                                                    onClick={() => handleApproveEntry(entry.id)}
                                                    className="p-1 rounded hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors cursor-pointer text-gray-400 hover:text-green-500"
                                                    title="Aprobar"
                                                >
                                                    <Check className="h-3.5 w-3.5" />
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleStartEdit(entry)}
                                                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer text-gray-400 hover:text-blue-500"
                                                title="Editar"
                                            >
                                                <Pencil className="h-3.5 w-3.5" />
                                            </button>
                                            <button
                                                onClick={() => handleToggle(entry)}
                                                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                                                title={entry.enabled ? "Desactivar" : "Activar"}
                                            >
                                                {entry.enabled ? (
                                                    <ToggleRight className="h-4 w-4 text-green-500" />
                                                ) : (
                                                    <ToggleLeft className="h-4 w-4 text-gray-400" />
                                                )}
                                            </button>
                                            <button
                                                onClick={() => handleDelete(entry.id)}
                                                className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors cursor-pointer"
                                                title="Eliminar"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="text-center py-4 mb-3">
                            {activeTab === "pending" ? (
                                <>
                                    <Inbox className="h-6 w-6 text-gray-300 mx-auto mb-2" />
                                    <p className="text-xs text-gray-400">
                                        No hay entradas pendientes de revisión.
                                    </p>
                                    <p className="text-xs text-gray-400 mt-1">
                                        Las entradas con baja confianza o fase de proyecto aparecerán aquí.
                                    </p>
                                </>
                            ) : (
                                <>
                                    <Sparkles className="h-6 w-6 text-violet-300 mx-auto mb-2" />
                                    <p className="text-xs text-gray-400">
                                        Sin reglas todavía. Añade una regla manual o la IA las
                                        extraerá automáticamente de las conversaciones.
                                    </p>
                                </>
                            )}
                        </div>
                    )}

                    {/* Add new entry form — only on active tab */}
                    {activeTab === "active" && (
                        <>
                            {isAdding ? (
                                <div className="space-y-2 p-3 border border-violet-200 dark:border-violet-800 rounded-md bg-violet-50/50 dark:bg-violet-950/20">
                                    <div className="flex gap-1.5 flex-wrap mb-2">
                                        {CATEGORIES.map((cat) => (
                                            <button
                                                key={cat.value}
                                                onClick={() => setNewCategory(cat.value)}
                                                className={`text-[10px] px-2 py-1 rounded-full transition-colors cursor-pointer ${newCategory === cat.value
                                                    ? "bg-violet-500 text-white"
                                                    : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                                                    }`}
                                                title={cat.description}
                                            >
                                                {cat.emoji} {cat.label}
                                            </button>
                                        ))}
                                    </div>
                                    <Input
                                        value={newContent}
                                        onChange={(e) => setNewContent(e.target.value)}
                                        placeholder="Ej: Siempre usar nuestro componente Dialog en vez de confirm()"
                                        className="text-sm"
                                        autoFocus
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" && newContent.trim()) {
                                                handleAdd();
                                            }
                                            if (e.key === "Escape") {
                                                setIsAdding(false);
                                                setNewContent("");
                                            }
                                        }}
                                    />
                                    <div className="flex justify-end gap-2 pt-1">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => {
                                                setIsAdding(false);
                                                setNewContent("");
                                            }}
                                        >
                                            Cancelar
                                        </Button>
                                        <Button
                                            size="sm"
                                            className="bg-violet-500 hover:bg-violet-600"
                                            onClick={handleAdd}
                                            disabled={!newContent.trim() || isLoading}
                                        >
                                            Añadir regla
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full border-dashed"
                                    onClick={() => setIsAdding(true)}
                                >
                                    <Plus className="h-4 w-4 mr-2" />
                                    Añadir regla manualmente
                                </Button>
                            )}
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
