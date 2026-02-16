import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { type LanguageModel } from "@/ipc/types";
import { ModelItemContent } from "@/components/ModelItemContent";
import { ModelInfoDialog } from "@/components/ModelInfoDialog";

interface SettingsModelSelectorProps {
    selectedModel: string | undefined;
    onModelSelect: (modelName: string) => void;
    models: LanguageModel[];
    loading?: boolean;
    placeholder?: string;
    specialOptions?: Array<{
        value: string;
        label: string;
        description?: string;
    }>;
    className?: string;
    /** "sm" = compact (home), "md" = larger (settings) */
    size?: "sm" | "md";
}

export function SettingsModelSelector({
    selectedModel,
    onModelSelect,
    models,
    loading = false,
    placeholder = "Selecciona un modelo",
    specialOptions = [],
    className = "",
    size = "sm",
}: SettingsModelSelectorProps) {
    const [open, setOpen] = useState(false);
    const [infoModel, setInfoModel] = useState<LanguageModel | null>(null);

    // Get display name for the selected model
    const getModelDisplayName = () => {
        // Check special options first
        const specialOption = specialOptions.find(
            (opt) => opt.value === selectedModel,
        );
        if (specialOption) {
            return specialOption.label;
        }

        // Look up in models
        const foundModel = models.find(
            (model) => model.apiName === selectedModel,
        );
        if (foundModel) {
            return foundModel.displayName;
        }

        // Fallback
        return selectedModel || placeholder;
    };

    const modelDisplayName = getModelDisplayName();

    return (
        <>
            <DropdownMenu open={open} onOpenChange={setOpen}>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                            <button
                                className={`flex items-center justify-between w-fit font-medium rounded-md shadow-none gap-0.5 border bg-background hover:bg-muted/50 focus:bg-muted/50 transition-colors ${size === "md"
                                        ? "h-9 max-w-[300px] px-3 py-1 text-sm"
                                        : "!h-6 max-w-[240px] px-1.5 py-0 text-xs-sm"
                                    } ${className}`}
                            >
                                <span className="truncate flex-1 text-left">
                                    {modelDisplayName}
                                </span>
                            </button>
                        </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent>{modelDisplayName}</TooltipContent>
                </Tooltip>
                <DropdownMenuContent
                    className="w-72 max-h-[280px] overflow-y-auto"
                    align="start"
                    side="top"
                    onCloseAutoFocus={(e) => e.preventDefault()}
                >
                    {loading ? (
                        <div className="text-xs text-center py-2 text-muted-foreground">
                            Cargando modelos...
                        </div>
                    ) : models.length === 0 && specialOptions.length === 0 ? (
                        <div className="text-xs text-center py-2 text-muted-foreground">
                            No hay modelos disponibles
                        </div>
                    ) : (
                        <>
                            {/* Special options first */}
                            {specialOptions.map((option) => (
                                <DropdownMenuItem
                                    key={option.value}
                                    className={`py-1.5 px-3 cursor-pointer ${selectedModel === option.value ? "bg-secondary" : ""
                                        }`}
                                    onClick={() => {
                                        onModelSelect(option.value);
                                        setOpen(false);
                                    }}
                                >
                                    <div className="flex flex-col gap-0">
                                        <span className="font-semibold text-[13px]">
                                            {option.label}
                                        </span>
                                        {option.description && (
                                            <span className="text-[10px] text-muted-foreground/60">
                                                {option.description}
                                            </span>
                                        )}
                                    </div>
                                </DropdownMenuItem>
                            ))}

                            {/* Divider if both exist */}
                            {specialOptions.length > 0 && models.length > 0 && (
                                <div className="h-px bg-border my-1 mx-1" />
                            )}

                            {/* Regular models */}
                            {models.map((model) => (
                                <DropdownMenuItem
                                    key={model.apiName}
                                    className={`py-1.5 px-3 cursor-pointer ${selectedModel === model.apiName ? "bg-secondary" : ""
                                        }`}
                                    onClick={() => {
                                        onModelSelect(model.apiName);
                                        setOpen(false);
                                    }}
                                >
                                    <ModelItemContent
                                        model={model}
                                        onInfoClick={setInfoModel}
                                    />
                                </DropdownMenuItem>
                            ))}
                        </>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>

            {infoModel && (
                <ModelInfoDialog
                    open={!!infoModel}
                    onOpenChange={(o) => !o && setInfoModel(null)}
                    model={infoModel}
                    isAutoRouter={false}
                />
            )}
        </>
    );
}
