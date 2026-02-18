import React, { useState } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Plus, RotateCcw } from "lucide-react";
import { useSettings } from "@/hooks/useSettings";
import { useLanguageModelsByProviders } from "@/hooks/useLanguageModelsByProviders";
import { DEFAULT_ENABLED_MODELS } from "@/ipc/shared/language_model_constants";
import { AddModelDialog } from "./AddModelDialog";
import { cn } from "@/lib/utils";

export function EnabledModelsSettings({
    isHighlighted,
}: {
    isHighlighted?: boolean;
}) {
    const { settings, updateSettings } = useSettings();
    const { data: modelsByProviders } = useLanguageModelsByProviders();
    const [dialogOpen, setDialogOpen] = useState(false);

    const enabledModelIds =
        settings?.enabledOpenRouterModels ?? DEFAULT_ENABLED_MODELS;

    const allModels = modelsByProviders?.["openrouter"] ?? [];

    // Get enabled models with their display info
    const enabledModels = enabledModelIds
        .map((id) => {
            const found = allModels.find((m) => m.apiName === id);
            return found ?? { apiName: id, displayName: id, description: "" };
        })
        .sort((a, b) => a.displayName.localeCompare(b.displayName));

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

    const handleResetToDefaults = () => {
        updateSettings({
            enabledOpenRouterModels: [...DEFAULT_ENABLED_MODELS],
        });
    };

    const isDefault =
        !settings?.enabledOpenRouterModels ||
        (enabledModelIds.length === DEFAULT_ENABLED_MODELS.length &&
            DEFAULT_ENABLED_MODELS.every((id) => enabledModelIds.includes(id)));

    const dollarLabel = (d?: number) => {
        if (d === undefined || d === 0) return "Gratis";
        return "$".repeat(d);
    };

    return (
        <div
            id="enabled-models"
            className={cn(
                "space-y-6 rounded-2xl p-6 transition-all duration-500",
                isHighlighted
                    ? "bg-primary/10 ring-2 ring-primary/30"
                    : "bg-card border border-border",
            )}
        >
            <div className="flex items-center justify-between">
                <div>
                    <Label className="text-2xl font-bold text-gray-900 dark:text-white">
                        Modelos habilitados
                    </Label>
                    <p className="text-sm text-muted-foreground mt-1">
                        Controla qué modelos aparecen en el selector del chat. Puedes
                        activar o desactivar modelos y añadir nuevos desde OpenRouter.
                    </p>
                </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => setDialogOpen(true)}
                >
                    <Plus className="w-4 h-4" />
                    Añadir modelo
                </Button>
                {!isDefault && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="gap-2 text-muted-foreground"
                        onClick={handleResetToDefaults}
                    >
                        <RotateCcw className="w-4 h-4" />
                        Restaurar por defecto
                    </Button>
                )}
            </div>

            {/* Enabled models list */}
            <div className="space-y-1">
                {enabledModels.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                        No hay modelos habilitados. Añade al menos uno para usar el chat.
                    </div>
                ) : (
                    enabledModels.map((model) => (
                        <div
                            key={model.apiName}
                            className="flex items-center justify-between gap-3 p-3 rounded-xl hover:bg-muted/30 transition-colors"
                        >
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-foreground">
                                        {model.displayName}
                                    </span>
                                    {"dollarSigns" in model &&
                                        (model as any).dollarSigns !== undefined && (
                                            <span className="text-xs text-muted-foreground/70">
                                                {dollarLabel((model as any).dollarSigns)}
                                            </span>
                                        )}
                                </div>
                                <div className="text-xs text-muted-foreground/50 mt-0.5">
                                    {model.apiName}
                                </div>
                            </div>
                            <Switch
                                checked={true}
                                onCheckedChange={(checked) =>
                                    handleToggle(model.apiName, checked)
                                }
                            />
                        </div>
                    ))
                )}
            </div>

            <div className="text-xs text-muted-foreground">
                {enabledModels.length} modelo{enabledModels.length !== 1 ? "s" : ""}{" "}
                habilitado{enabledModels.length !== 1 ? "s" : ""}
            </div>

            <AddModelDialog open={dialogOpen} onOpenChange={setDialogOpen} />
        </div>
    );
}
