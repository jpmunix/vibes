import React, { useState, useMemo } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Search, RefreshCw } from "@/components/ui/icons";
import { useLanguageModelsByProviders } from "@/hooks/useLanguageModelsByProviders";
import { useSettings } from "@/hooks/useSettings";
import { DEFAULT_ENABLED_MODELS } from "@/ipc/shared/language_model_constants";
import { ModelInfoDialog } from "@/components/ModelInfoDialog";
import type { LanguageModel } from "@/ipc/types";
import { cn } from "@/lib/utils";
import { ipc } from "@/ipc/types";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { showError, showSuccess } from "@/lib/toast";

// =============================================================================
// Price formatting — clean, no "/M" suffix (prices are always per million)
// =============================================================================

function formatPricePerMillion(pricePerToken: string | undefined): string {
    if (!pricePerToken) return "—";
    const num = parseFloat(pricePerToken);
    if (isNaN(num)) return "—";
    if (num === 0) return "gratis";
    const perMillion = num * 1_000_000;
    if (perMillion < 0.01) return `$${perMillion.toFixed(4)}`;
    if (perMillion < 1) return `$${perMillion.toFixed(2)}`;
    return `$${perMillion.toFixed(2)}`;
}

// =============================================================================
// Token formatting helper
// =============================================================================

function formatTokens(num: number | undefined): string {
    if (num === undefined) return "—";
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(0)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(0)}K`;
    return num.toString();
}

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
];

// =============================================================================
// Enabled filter
// =============================================================================

type EnabledFilterValue = "all" | "enabled" | "disabled";

const ENABLED_FILTER_OPTIONS: Array<{ value: EnabledFilterValue; label: string }> = [
    { value: "all", label: "Todos" },
    { value: "enabled", label: "Habilitados" },
    { value: "disabled", label: "No habilitados" },
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
    const [enabledFilter, setEnabledFilter] = useState<EnabledFilterValue>("all");
    const { settings, updateSettings } = useSettings();
    const { data: modelsByProviders, isLoading } = useLanguageModelsByProviders();
    const [detailModel, setDetailModel] = useState<LanguageModel | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const queryClient = useQueryClient();

    const enabledModels = settings?.enabledOpenRouterModels ?? DEFAULT_ENABLED_MODELS;

    const allModels = useMemo(
        () => modelsByProviders?.["openrouter"] ?? [],
        [modelsByProviders]
    );

    const handleRefresh = async () => {
        setIsRefreshing(true);
        try {
            await ipc.languageModel.refreshOpenRouterModels();
            queryClient.invalidateQueries({ queryKey: queryKeys.languageModels.forProvider({ providerId: "openrouter" }) });
            queryClient.invalidateQueries({ queryKey: queryKeys.languageModels.byProviders });
            showSuccess("Modelos actualizados");
        } catch (error: any) {
            console.error("Error en refreshModels:", error);
            showError("Error al actualizar los modelos");
        } finally {
            setIsRefreshing(false);
        }
    };

    // Apply capability filters, enabled filter, then text search
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

        // Enabled filter
        if (enabledFilter === "enabled") {
            result = result.filter((m) => enabledModels.includes(m.apiName));
        } else if (enabledFilter === "disabled") {
            result = result.filter((m) => !enabledModels.includes(m.apiName));
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
    }, [allModels, filters, enabledFilter, enabledModels, search]);

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

    // ─── Filter chip component ───────────────────────────────────────────────
    function FilterChip<T extends string>({
        label,
        options,
        value,
        onChange,
    }: {
        label: string;
        options: Array<{ value: T; label: string }>;
        value: T;
        onChange: (v: T) => void;
    }) {
        return (
            <div className="flex items-center gap-2">
                <span className="typo-menu-header opacity-60 shrink-0 uppercase tracking-wider" style={{ fontSize: "0.65rem" }}>
                    {label}
                </span>
                <div className="flex bg-muted/40 rounded-lg p-0.5 border border-border/50">
                    {options.map((opt) => (
                        <button
                            key={opt.value}
                            type="button"
                            onClick={() => onChange(opt.value)}
                            className={cn(
                                "px-2.5 py-1 text-xs rounded-md transition-all duration-150 cursor-pointer whitespace-nowrap",
                                value === opt.value
                                    ? "bg-background shadow-sm text-foreground font-medium"
                                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                            )}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent
                    className="sm:max-w-2xl max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden"
                    showCloseButton={false}
                >
                    {/* ── Header with title + refresh + close ── */}
                    <DialogHeader className="px-6 pt-5 pb-4 border-b border-border/50 shrink-0">
                        <div className="flex items-center justify-between">
                            <DialogTitle>Añadir modelos</DialogTitle>
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={handleRefresh}
                                    disabled={isRefreshing}
                                    className="p-2 rounded-md opacity-60 hover:opacity-100 hover:bg-muted transition-all duration-200 cursor-pointer disabled:opacity-30"
                                    title="Actualizar lista de modelos"
                                >
                                    <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onOpenChange(false)}
                                    className="p-2 rounded-md opacity-60 hover:opacity-100 hover:bg-muted transition-all duration-200 cursor-pointer"
                                >
                                    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.557 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.557 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"/>
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </DialogHeader>

                    {/* ── Filters + Search ── */}
                    <div className="px-6 py-4 space-y-3 shrink-0 border-b border-border/30 bg-muted/10">
                        {/* Filter row — compact inline chips */}
                        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                            {MODEL_CAPABILITY_FILTERS.map((filterDef) => (
                                <FilterChip
                                    key={filterDef.id}
                                    label={filterDef.label}
                                    options={filterDef.options}
                                    value={filters[filterDef.id]}
                                    onChange={(v) => setFilter(filterDef.id, v)}
                                />
                            ))}
                            <FilterChip
                                label="Estado"
                                options={ENABLED_FILTER_OPTIONS}
                                value={enabledFilter}
                                onChange={setEnabledFilter}
                            />
                        </div>

                        {/* Search */}
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                            <Input
                                type="text"
                                placeholder="Buscar modelos..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-10 bg-background/50 border-border/40"
                                autoFocus
                            />
                        </div>
                    </div>

                    {/* ── Model list ── */}
                    <div className="flex-1 overflow-y-auto min-h-0 px-2 py-1">
                        {isLoading ? (
                            <div className="text-center py-12 typo-caption opacity-60">
                                Cargando modelos...
                            </div>
                        ) : filteredModels.length === 0 ? (
                            <div className="text-center py-12 typo-caption opacity-60">
                                No se encontraron modelos
                            </div>
                        ) : (
                            filteredModels.map((model) => {
                                const isEnabled = enabledModels.includes(model.apiName);
                                return (
                                    <div
                                        key={model.apiName}
                                        className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg hover:bg-muted/40 transition-colors group"
                                    >
                                        <button
                                            type="button"
                                            className="flex-1 min-w-0 text-left cursor-pointer"
                                            onClick={() => setDetailModel(model)}
                                            title="Ver detalles del modelo"
                                        >
                                            {/* Line 1: Model name */}
                                            <div className="typo-label truncate group-hover:text-primary transition-colors">
                                                {model.displayName}
                                            </div>

                                            {/* Line 2: Context window + max output tokens */}
                                            <div className="typo-caption truncate mt-0.5 flex items-center gap-2 opacity-70">
                                                <span>Contexto: {formatTokens(model.contextWindow)}</span>
                                                <span className="opacity-30">·</span>
                                                <span>Salida: {formatTokens(model.maxOutputTokens)}</span>
                                            </div>

                                            {/* Line 3: Pricing (input / output) */}
                                            {(model.pricingInput || model.pricingOutput) && (
                                                <div className="typo-caption truncate mt-0.5 flex items-center gap-2 opacity-50">
                                                    <span>In</span>
                                                    <span className="tabular-nums">{formatPricePerMillion(model.pricingInput)}</span>
                                                    <span className="opacity-40">·</span>
                                                    <span>Out</span>
                                                    <span className="tabular-nums">{formatPricePerMillion(model.pricingOutput)}</span>
                                                </div>
                                            )}
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

                    {/* ── Footer ── */}
                    <div className="px-6 py-3 border-t border-border/30 shrink-0 typo-caption opacity-60 text-center bg-muted/5">
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
