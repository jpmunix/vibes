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

interface AddModelDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function AddModelDialog({ open, onOpenChange }: AddModelDialogProps) {
    const [search, setSearch] = useState("");
    const { settings, updateSettings } = useSettings();
    const { data: modelsByProviders, isLoading } =
        useLanguageModelsByProviders();
    const [detailModel, setDetailModel] = useState<LanguageModel | null>(null);

    const enabledModels =
        settings?.enabledOpenRouterModels ?? DEFAULT_ENABLED_MODELS;

    const allModels = useMemo(() => {
        return modelsByProviders?.["openrouter"] ?? [];
    }, [modelsByProviders]);

    const filteredModels = useMemo(() => {
        if (!search.trim()) return allModels;
        const query = search.toLowerCase();
        return allModels.filter(
            (m) =>
                m.displayName.toLowerCase().includes(query) ||
                m.apiName.toLowerCase().includes(query) ||
                (m.description && m.description.toLowerCase().includes(query)),
        );
    }, [allModels, search]);

    const handleToggle = (modelApiName: string, enabled: boolean) => {
        const current = settings?.enabledOpenRouterModels ?? [
            ...DEFAULT_ENABLED_MODELS,
        ];
        let newEnabled: string[];
        if (enabled) {
            newEnabled = [...current, modelApiName];
        } else {
            newEnabled = current.filter((id) => id !== modelApiName);
        }
        updateSettings({ enabledOpenRouterModels: newEnabled });
    };

    const dollarLabel = (d?: number) => {
        if (d === undefined || d === 0) return "Gratis";
        return "$".repeat(d);
    };

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Añadir modelos</DialogTitle>
                    </DialogHeader>

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

                    {/* Model list */}
                    <div className="flex-1 overflow-y-auto space-y-1 min-h-0 pr-1">
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
                    <div className="text-xs text-muted-foreground text-center pt-2 border-t border-border">
                        {allModels.length} modelos disponibles · {enabledModels.length}{" "}
                        habilitados
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
