import React, { useState, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Command,
    CommandInput,
    CommandList,
    CommandGroup,
    CommandItem,
} from "@/components/ui/command";
import {
    Check,
    ChevronDown,
    Zap,
    Circle,
} from "@/components/ui/icons";
import * as Lucide from "lucide-react";
import type { LanguageModel } from "@/ipc/types";
import { MODEL_VARIANTS, isFreeModel, type ModelVariant } from "@/ipc/shared/model_variants";

// Lucide Crosshair is not in our icons.tsx, import directly
const Crosshair = Lucide.Crosshair;

// ─── Icon map ────────────────────────────────────────────────────────────────
const VARIANT_ICONS: Record<ModelVariant["iconName"], React.ComponentType<any>> = {
    circle: Circle,
    zap: Zap,
    crosshair: Crosshair,
};

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ModelVariantPickerProps {
    /** All model entries (already sorted) */
    models: Array<{ provider: string; model: LanguageModel }>;
    /** Currently selected model value as "provider:apiName" */
    selectedValue: string;
    /** Currently selected variant suffix (e.g. ":nitro" or "") */
    selectedVariant: string;
    /** Called when user selects a model */
    onModelSelect: (value: string) => void;
    /** Called when user changes the variant */
    onVariantChange: (variant: string) => void;
    /** Custom trigger content */
    triggerContent: React.ReactNode;
    /** Render function for each model item */
    renderModelItem: (model: { provider: string; model: LanguageModel }, isSelected: boolean) => React.ReactNode;
    /** Search state */
    searchPlaceholder?: string;
    onSearchChange?: (search: string) => void;
    emptyMessage?: string;
    /** Optional map of modelApiName → user-defined alias (for search keywords) */
    modelAliases?: Record<string, string>;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ModelVariantPicker({
    models,
    selectedValue,
    selectedVariant,
    onModelSelect,
    onVariantChange,
    triggerContent,
    renderModelItem,
    searchPlaceholder = "Buscar modelos...",
    onSearchChange,
    emptyMessage = "Sin resultados",
    modelAliases = {},
}: ModelVariantPickerProps) {
    const [open, setOpen] = useState(false);
    // Controlled search value — must be managed here so we can reset it on close/select
    const [localSearch, setLocalSearch] = useState("");
    // The model that is currently hovered/focused in the left panel
    const [focusedValue, setFocusedValue] = useState<string | null>(null);

    // Resolve the focused model object for the variant panel
    const focusedEntry = useMemo(() => {
        const target = focusedValue ?? selectedValue;
        return models.find(
            (m) => `${m.provider}|||${m.model.apiName}` === target,
        );
    }, [focusedValue, selectedValue, models]);

    const focusedModel = focusedEntry?.model;
    const focusedIsFree = focusedModel ? isFreeModel(focusedModel) : false;

    const handleModelSelect = useCallback(
        (value: string) => {
            onModelSelect(value);
            setLocalSearch("");
            onSearchChange?.("");
            setOpen(false);
        },
        [onModelSelect, onSearchChange],
    );

    const handleVariantSelect = useCallback(
        (suffix: string) => {
            onVariantChange(suffix);
        },
        [onVariantChange],
    );

    return (
        <Popover
            open={open}
            onOpenChange={(v) => {
                setOpen(v);
                if (!v) {
                    setFocusedValue(null);
                    setLocalSearch("");
                    onSearchChange?.("");
                }
            }}
        >
            <PopoverTrigger asChild>
                <button
                    className={cn(
                        "flex items-center justify-between cursor-pointer",
                        "h-auto w-fit px-2.5 py-1 typo-select gap-1",
                        "border-0 bg-primary text-primary-foreground shadow-sm rounded-lg hover:brightness-110 transition-all duration-200",
                        "!bg-primary/20 !text-primary !border-primary/20 hover:!bg-primary/30",
                    )}
                >
                    {triggerContent}
                    <span className="shrink-0 flex items-center ml-0.5">
                        <ChevronDown size={12} className="shrink-0 opacity-60" />
                    </span>
                </button>
            </PopoverTrigger>

            <PopoverContent
                align="start"
                side="top"
                className="min-w-[520px] w-max max-w-[90vw] p-0 overflow-hidden"
                onCloseAutoFocus={(e) => e.preventDefault()}
            >
                <div className="flex" style={{ height: "min(360px, 60vh)" }}>
                    {/* ── Left panel: Model list ──────────────────────────── */}
                    <div className="flex-1 min-w-0 flex flex-col border-r border-border/40">
                        <Command
                            shouldFilter={false}
                        >
                            <CommandInput
                                placeholder={searchPlaceholder}
                                value={localSearch}
                                onValueChange={(v) => {
                                    setLocalSearch(v);
                                    onSearchChange?.(v);
                                }}
                            />
                            <CommandList className="max-h-none flex-1 overflow-y-auto">
                                {models.length === 0 && (
                                    <div className="py-4 text-center typo-caption">
                                        {emptyMessage}
                                    </div>
                                )}
                                <CommandGroup>
                                    {models.map(({ provider, model }) => {
                                        const value = `${provider}|||${model.apiName}`;
                                        const isSelected = selectedValue === value;
                                        return (
                                            <CommandItem
                                                key={value}
                                                value={value}
                                                onSelect={() => handleModelSelect(value)}
                                                className={cn(
                                                    "cursor-pointer typo-dropdown",
                                                    isSelected && "bg-primary/8 !font-bold",
                                                )}
                                                onMouseEnter={() => setFocusedValue(value)}
                                            >
                                                <span className="w-4 shrink-0 flex items-center justify-center">
                                                    {isSelected && <Check size={14} className="text-primary" />}
                                                </span>
                                                {renderModelItem({ provider, model }, isSelected)}
                                            </CommandItem>
                                        );
                                    })}
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </div>

                    {/* ── Right panel: Variant selector ────────────────────── */}
                    <div className="w-[190px] shrink-0 flex flex-col bg-muted/20">
                        <div className="px-3 py-2 border-b border-border/40">
                            <span className="typo-menu-header uppercase tracking-wider opacity-70">
                                Variante
                            </span>
                        </div>
                        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
                            {MODEL_VARIANTS.map((variant) => {
                                const IconComp = VARIANT_ICONS[variant.iconName];
                                const isAvailable = focusedModel
                                    ? variant.isAvailable(focusedModel)
                                    : true;
                                const isActive = selectedVariant === variant.suffix;
                                const disabled = !isAvailable || focusedIsFree;

                                return (
                                    <button
                                        key={variant.suffix || "__standard"}
                                        type="button"
                                        disabled={disabled && variant.suffix !== ""}
                                        onClick={() => {
                                            if (!disabled || variant.suffix === "") {
                                                handleVariantSelect(variant.suffix);
                                            }
                                        }}
                                        className={cn(
                                            "w-full flex items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-all duration-150",
                                            "cursor-pointer",
                                            isActive
                                                ? "bg-primary/10 ring-1 ring-primary/30"
                                                : "hover:bg-muted/60",
                                            disabled && variant.suffix !== ""
                                                ? "opacity-35 cursor-not-allowed"
                                                : "",
                                        )}
                                    >
                                        {/* Radio indicator */}
                                        <span className="mt-0.5 shrink-0">
                                            <span
                                                className={cn(
                                                    "block w-3.5 h-3.5 rounded-full border-2 transition-colors",
                                                    isActive
                                                        ? "border-primary bg-primary"
                                                        : "border-muted-foreground/40 bg-transparent",
                                                )}
                                            >
                                                {isActive && (
                                                    <span className="block w-full h-full rounded-full bg-primary-foreground scale-[0.4]" />
                                                )}
                                            </span>
                                        </span>
                                        {/* Content */}
                                        <div className="flex flex-col gap-0 min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                {variant.suffix && IconComp && (
                                                    <IconComp size={12} className="shrink-0 opacity-70" />
                                                )}
                                                <span className="typo-select font-medium">
                                                    {variant.label}
                                                </span>
                                            </div>
                                            <span className="typo-micro text-muted-foreground leading-tight">
                                                {variant.description}
                                            </span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                        {/* Footer hint for free models */}
                        {focusedIsFree && (
                            <div className="px-3 py-2 border-t border-border/40 typo-micro text-muted-foreground/60 text-center">
                                Variantes no disponibles para modelos gratuitos
                            </div>
                        )}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
