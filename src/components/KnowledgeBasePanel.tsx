import { useState, useEffect, useCallback } from "react";
import { ipc } from "@/ipc/types";
import type { KnowledgeEntry, KnowledgeCategory } from "@/ipc/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { showError, showSuccess } from "@/lib/toast";
import {
    Brain,
    Plus,
    Trash2,
    ToggleLeft,
    ToggleRight,
    ChevronDown,
    ChevronUp,
    Sparkles,
} from "lucide-react";

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

export function KnowledgeBasePanel({ appId }: { appId: number }) {
    const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
    const [isExpanded, setIsExpanded] = useState(false);
    const [isAdding, setIsAdding] = useState(false);
    const [newContent, setNewContent] = useState("");
    const [newCategory, setNewCategory] = useState<KnowledgeCategory>("convention");
    const [isLoading, setIsLoading] = useState(false);

    const loadEntries = useCallback(async () => {
        try {
            const result = await ipc.knowledge.getKnowledgeEntries(appId);
            setEntries(result);
        } catch (error) {
            console.error("Failed to load knowledge entries:", error);
        }
    }, [appId]);

    useEffect(() => {
        if (isExpanded) {
            loadEntries();
        }
    }, [isExpanded, loadEntries]);

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
        <div className="border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden">
            {/* Header */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
            >
                <div className="flex items-center gap-2">
                    <Brain className="h-4 w-4 text-violet-500" />
                    <span className="font-medium text-sm">Base de Conocimientos IA</span>
                    {entries.length > 0 && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                            {activeCount} activa{activeCount !== 1 ? "s" : ""}
                        </span>
                    )}
                </div>
                {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-gray-400" />
                ) : (
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                )}
            </button>

            {/* Content */}
            {isExpanded && (
                <div className="border-t border-gray-200 dark:border-gray-700 p-3">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                        La IA aprende y respeta estas reglas automáticamente en cada
                        interacción. Puedes añadir reglas manuales o dejar que se
                        auto-extraigan de las conversaciones.
                    </p>

                    {/* Entries list */}
                    {entries.length > 0 ? (
                        <div className="space-y-2 mb-3">
                            {entries.map((entry) => {
                                const cat = getCategoryConfig(entry.category);
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
                        <div className="space-y-2 p-2 border border-violet-200 dark:border-violet-800 rounded-md bg-violet-50/50 dark:bg-violet-950/20">
                            <div className="flex gap-1.5 flex-wrap">
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
                                className="text-xs h-8"
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
                            <div className="flex justify-end gap-1.5">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => {
                                        setIsAdding(false);
                                        setNewContent("");
                                    }}
                                >
                                    Cancelar
                                </Button>
                                <Button
                                    size="sm"
                                    className="h-7 text-xs bg-violet-500 hover:bg-violet-600"
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
                            className="w-full text-xs h-8 border-dashed"
                            onClick={() => setIsAdding(true)}
                        >
                            <Plus className="h-3.5 w-3.5 mr-1" />
                            Añadir regla manualmente
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
}
