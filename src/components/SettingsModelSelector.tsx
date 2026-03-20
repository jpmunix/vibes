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
import { useState, useMemo } from "react";
import { type LanguageModel } from "@/ipc/types";
import { ModelItemContent } from "@/components/ModelItemContent";
import { ModelInfoDialog } from "@/components/ModelInfoDialog";
import { useSettings } from "@/hooks/useSettings";
import { DEFAULT_ENABLED_MODELS } from "@/ipc/shared/language_model_constants";

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
    /** "default" = outline button, "pill" = primary pill like other selectors */
    variant?: "default" | "pill";
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
    variant = "default",
}: SettingsModelSelectorProps) {
    const [open, setOpen] = useState(false);
    const [infoModel, setInfoModel] = useState<LanguageModel | null>(null);
    const { settings } = useSettings();

    // Filter models to only show user-enabled ones (consistent with main ModelPicker)
    const filteredModels = useMemo(() => {
        const enabledModels = settings?.enabledOpenRouterModels ?? DEFAULT_ENABLED_MODELS;
        return models.filter((model) => enabledModels.includes(model.apiName));
    }, [models, settings?.enabledOpenRouterModels]);

    // Get display name for the selected model
    const getModelDisplayName = () => {
        // Check special options first
        const specialOption = specialOptions.find(
            (opt) => opt.value === selectedModel,
        );
        if (specialOption) {
            return specialOption.label;
        }

        // Look up in models (search all models, not just filtered, so current selection always shows)
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

    const triggerClassName = variant === "pill"
        ? `border-0 bg-primary dark:bg-primary text-primary-foreground dark:text-primary-foreground shadow-sm rounded-lg px-4 py-1.5 h-auto text-sm font-bold hover:brightness-110 dark:hover:bg-primary transition-all duration-200 w-auto gap-2 cursor-pointer flex items-center ${className}`
        : `flex items-center justify-between w-fit font-medium rounded-md shadow-none gap-0.5 border bg-background hover:bg-muted/50 focus:bg-muted/50 transition-colors ${size === "md"
            ? "h-9 max-w-[300px] px-3 py-1 text-sm"
            : "!h-6 max-w-[240px] px-1.5 py-0 text-xs-sm"
        } ${className}`;

    return (
        <>
            <DropdownMenu open={open} onOpenChange={setOpen}>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                            <button className={triggerClassName}>
                                <span className="truncate flex-1 text-left">
                                    {modelDisplayName}
                                </span>
                                {variant === "pill" && (
                                    <svg className="h-4 w-4 opacity-70 shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                                )}
                            </button>
                        </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent>{modelDisplayName}</TooltipContent>
                </Tooltip>
                <DropdownMenuContent
                    className="w-72 max-h-[280px] overflow-y-auto"
                    align="end"
                    onCloseAutoFocus={(e) => e.preventDefault()}
                >
                    {loading ? (
                        <div className="text-xs text-center py-2 text-muted-foreground">
                            Cargando modelos...
                        </div>
                    ) : filteredModels.length === 0 && specialOptions.length === 0 ? (
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
                            {specialOptions.length > 0 && filteredModels.length > 0 && (
                                <div className="h-px bg-border my-1 mx-1" />
                            )}

                            {/* Regular models */}
                            {filteredModels.map((model) => (
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
