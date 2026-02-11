import { useState, useEffect, useCallback } from "react";
import { ipc } from "@/ipc/types";
import type { KnowledgeEntry, KnowledgeCategory } from "@/ipc/types";
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
        }
    }, [isOpen, loadEntries]);

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

    const activeCount = entries.filter((e) => e.enabled).length;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-[95vw]! sm:max-w-[1400px]! w-[95vw]! h-[92vh]! max-h-[92vh]! overflow-hidden flex flex-col p-6">
                <DialogHeader>
                    <div className="flex items-center gap-2">
                        <DialogTitle>Base de Conocimientos IA</DialogTitle>
                        {entries.length > 0 && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                                {activeCount} activa{activeCount !== 1 ? "s" : ""}
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
                            </PopoverContent>
                        </Popover>
                    </div>
                    <DialogDescription>
                        La IA aprende y respeta estas reglas automáticamente en cada interacción.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto pr-2 -mr-2 mt-4">
                    {/* Entries list */}
                    {entries.length > 0 ? (
                        <div className="space-y-2 mb-3">
                            {entries.map((entry) => {
                                const cat = getCategoryConfig(entry.category);
                                const isEditing = editingId === entry.id;

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
                                        className={`flex items-start gap-2 p-2 rounded-md border text-sm transition-opacity ${entry.enabled
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
                                            <div className="flex items-center gap-1.5 mt-1">
                                                <SourceBadge source={entry.source} />
                                                {entry.confidence < 100 && (
                                                    <span className="text-[10px] text-gray-400">
                                                        {entry.confidence}% confianza
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-0.5 flex-shrink-0">
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
                            <Sparkles className="h-6 w-6 text-violet-300 mx-auto mb-2" />
                            <p className="text-xs text-gray-400">
                                Sin reglas todavía. Añade una regla manual o la IA las
                                extraerá automáticamente de las conversaciones.
                            </p>
                        </div>
                    )}

                    {/* Add new entry form */}
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
                </div>
            </DialogContent>
        </Dialog>
    );
}
