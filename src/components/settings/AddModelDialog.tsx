import React, { useState, useMemo } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Search, Info } from "lucide-react";
import { useLanguageModelsByProviders } from "@/hooks/useLanguageModelsByProviders";
import { useSettings } from "@/hooks/useSettings";
import { DEFAULT_ENABLED_MODELS } from "@/ipc/shared/language_model_constants";
import { ModelInfoDialog } from "@/components/ModelInfoDialog";
import type { LanguageModel } from "@/ipc/types";
import { cn } from "@/lib/utils";

// =============================================================================
// Extensible filter config
// To add a new filter: append an entry to MODEL_CAPABILITY_FILTERS.
// The `parameter` must match a key in model.supportedParameters (from OpenRouter).
// =============================================================================

type FilterValue = "with" | "without" | "all";

interface CapabilityFilter {
    /** Unique key, also used as state key */
    id: string;
    /** Label displayed above the chips */
    label: string;
    /** The supported_parameters key to match against (e.g. "reasoning", "tools") */
    parameter: string;
    options: Array<{ value: FilterValue; label: string }>;
    defaultValue: FilterValue;
}

const MODEL_CAPABILITY_FILTERS: CapabilityFilter[] = [
    {
        id: "reasoning",
        label: "Razonamiento",
        parameter: "reasoning",
        options: [
            { value: "with", label: "Con razonamiento" },
            { value: "without", label: "Sin razonamiento" },
            { value: "all", label: "Todos" },
        ],
        defaultValue: "with",
    },
    {
        id: "tools",
        label: "Tool calling",
        parameter: "tools",
        options: [
            { value: "with", label: "Con tools" },
            { value: "without", label: "Sin tools" },
            { value: "all", label: "Todos" },
        ],
        defaultValue: "with",
    },
    // ── Add future filters here ──────────────────────────────────────────────
    // {
    //   id: "vision",
    //   label: "Visión",
    //   parameter: "image_input",          // or whatever OpenRouter uses
    //   options: [
    //     { value: "with",    label: "Con visión" },
    //     { value: "without", label: "Sin visión" },
    //     { value: "all",     label: "Todos" },
    //   ],
    //   defaultValue: "all",
    // },
];

// Build initial state from defaults
function buildDefaultFilterState(): Record<string, FilterValue> {
    return Object.fromEntries(
        MODEL_CAPABILITY_FILTERS.map((f) => [f.id, f.defaultValue])
    );
}

// =============================================================================
// Component
// =============================================================================

interface AddModelDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function AddModelDialog({ open, onOpenChange }: AddModelDialogProps) {
    const [search, setSearch] = useState("");
    const [filters, setFilters] = useState<Record<string, FilterValue>>(buildDefaultFilterState);
    const { settings, updateSettings } = useSettings();
    const { data: modelsByProviders, isLoading } = useLanguageModelsByProviders();
    const [detailModel, setDetailModel] = useState<LanguageModel | null>(null);

    const enabledModels = settings?.enabledOpenRouterModels ?? DEFAULT_ENABLED_MODELS;

    const allModels = useMemo(
        () => modelsByProviders?.["openrouter"] ?? [],
        [modelsByProviders]
    );

    // Apply capability filters then text search
    const filteredModels = useMemo(() => {
        let result = allModels;

        // Capability filters
        for (const filterDef of MODEL_CAPABILITY_FILTERS) {
            const value = filters[filterDef.id];
            if (value === "with") {
                result = result.filter((m) =>
                    m.supportedParameters?.includes(filterDef.parameter)
                );
            } else if (value === "without") {
                result = result.filter(
                    (m) => !m.supportedParameters?.includes(filterDef.parameter)
                );
            }
            // "all" → no filter
        }

        // Text search
        if (search.trim()) {
            const query = search.toLowerCase();
            result = result.filter(
                (m) =>
                    m.displayName.toLowerCase().includes(query) ||
                    m.apiName.toLowerCase().includes(query) ||
                    (m.description && m.description.toLowerCase().includes(query))
            );
        }

        return result;
    }, [allModels, filters, search]);

    const handleToggle = (modelApiName: string, enabled: boolean) => {
        const current = settings?.enabledOpenRouterModels ?? [...DEFAULT_ENABLED_MODELS];
        const newEnabled = enabled
            ? [...current, modelApiName]
            : current.filter((id) => id !== modelApiName);
        updateSettings({ enabledOpenRouterModels: newEnabled });
    };

    const setFilter = (id: string, value: FilterValue) => {
        setFilters((prev) => ({ ...prev, [id]: value }));
    };

    const dollarLabel = (d?: number) => {
        if (d === undefined || d === 0) return "Gratis";
        return "$".repeat(d);
    };

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
                    <DialogHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0">
                        <DialogTitle>Añadir modelos</DialogTitle>
                    </DialogHeader>

                    {/* Filters + Search */}
                    <div className="px-6 py-4 space-y-3 shrink-0 border-b border-border bg-muted/20">
                        {/* Capability filter chips */}
                        <div className="flex flex-wrap gap-4">
                            {MODEL_CAPABILITY_FILTERS.map((filterDef) => (
                                <div key={filterDef.id} className="flex items-center gap-2">
                                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest shrink-0">
                                        {filterDef.label}
                                    </span>
                                    <div className="flex bg-muted/50 rounded-lg p-0.5 border border-border">
                                        {filterDef.options.map((opt) => (
                                            <button
                                                key={opt.value}
                                                type="button"
                                                onClick={() => setFilter(filterDef.id, opt.value)}
                                                className={cn(
                                                    "px-3 py-1 text-xs font-semibold rounded-md transition-all duration-150 cursor-pointer",
                                                    filters[filterDef.id] === opt.value
                                                        ? "bg-background text-foreground shadow-sm"
                                                        : "text-muted-foreground hover:text-foreground"
                                                )}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Search */}
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                type="text"
                                placeholder="Buscar modelos..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-10"
                                autoFocus
                            />
                        </div>
                    </div>

                    {/* Model list */}
                    <div className="flex-1 overflow-y-auto min-h-0 px-4 py-2">
                        {isLoading ? (
                            <div className="text-center py-8 text-muted-foreground text-sm">
                                Cargando modelos...
                            </div>
                        ) : filteredModels.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground text-sm">
                                No se encontraron modelos
                            </div>
                        ) : (
                            filteredModels.map((model) => {
                                const isEnabled = enabledModels.includes(model.apiName);
                                return (
                                    <div
                                        key={model.apiName}
                                        className="flex items-center justify-between gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors"
                                    >
                                        <button
                                            type="button"
                                            className="flex-1 min-w-0 text-left cursor-pointer group"
                                            onClick={() => setDetailModel(model)}
                                            title="Ver detalles del modelo"
                                        >
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                                                    {model.displayName}
                                                </span>
                                                <Info className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary/70 shrink-0 transition-colors" />
                                                {model.dollarSigns !== undefined && (
                                                    <span className="text-xs text-muted-foreground/70 shrink-0">
                                                        {dollarLabel(model.dollarSigns)}
                                                    </span>
                                                )}
                                                {model.contextWindow && (
                                                    <span className="text-xs text-muted-foreground/50 shrink-0">
                                                        {model.contextWindow >= 1_000_000
                                                            ? `${(model.contextWindow / 1_000_000).toFixed(0)}M ctx`
                                                            : `${(model.contextWindow / 1_000).toFixed(0)}K ctx`}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-xs text-muted-foreground/70 truncate mt-0.5">
                                                {model.apiName}
                                            </div>
                                        </button>
                                        <Switch
                                            checked={isEnabled}
                                            onCheckedChange={(checked) =>
                                                handleToggle(model.apiName, checked)
                                            }
                                        />
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* Footer */}
                    <div className="px-6 py-3 border-t border-border shrink-0 text-xs text-muted-foreground text-center bg-muted/10">
                        {filteredModels.length} de {allModels.length} modelos · {enabledModels.length} habilitados
                    </div>
                </DialogContent>
            </Dialog>

            {/* Model detail dialog */}
            {detailModel && (
                <ModelInfoDialog
                    model={detailModel}
                    open={!!detailModel}
                    onOpenChange={(open) => {
                        if (!open) setDetailModel(null);
                    }}
                />
            )}
        </>
    );
}
