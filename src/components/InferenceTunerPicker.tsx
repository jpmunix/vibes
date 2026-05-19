import React, { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    ChevronDown,
    Zap,
    Brain,
    RotateCcw,
    Cog,
} from "@/components/ui/icons";
import * as Lucide from "lucide-react";
import { useSettings } from "@/hooks/useSettings";

const Scale = Lucide.Scale;

// ─── Types ───────────────────────────────────────────────────────────────────

interface ReasoningOption {
    value: "low" | "medium" | "high";
    label: string;
    description: string;
    icon: React.ComponentType<any>;
}

interface HyperParam {
    key: "inferenceTemperature" | "inferenceTopP" | "inferenceRepetitionPenalty";
    label: string;
    description: string;
    min: number;
    max: number;
    step: number;
    defaultValue: number;
    /** Format for display */
    format: (v: number) => string;
}

// ─── Data ────────────────────────────────────────────────────────────────────

const REASONING_OPTIONS: ReasoningOption[] = [
    {
        value: "low",
        label: "Bajo",
        description: "Respuestas rápidas para tareas simples",
        icon: Zap,
    },
    {
        value: "medium",
        label: "Medio",
        description: "Equilibrio velocidad / profundidad",
        icon: Scale,
    },
    {
        value: "high",
        label: "Alto",
        description: "Análisis profundo y debugging",
        icon: Brain,
    },
];

const HYPER_PARAMS: HyperParam[] = [
    {
        key: "inferenceTemperature",
        label: "Temperatura",
        description: "Creatividad de las respuestas",
        min: 0,
        max: 2,
        step: 0.05,
        defaultValue: 0.2,
        format: (v) => v.toFixed(2),
    },
    {
        key: "inferenceTopP",
        label: "Top-P",
        description: "Diversidad del vocabulario considerado",
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.95,
        format: (v) => v.toFixed(2),
    },
    {
        key: "inferenceRepetitionPenalty",
        label: "Rep. Penalty",
        description: "Penalización por repetición",
        min: 0.5,
        max: 2,
        step: 0.05,
        defaultValue: 1.05,
        format: (v) => v.toFixed(2),
    },
];

// ─── Trigger label helpers ───────────────────────────────────────────────────

const REASONING_ICONS: Record<string, React.ComponentType<any>> = {
    low: Zap,
    medium: Scale,
    high: Brain,
};

function hasCustomHyperParams(settings: any): boolean {
    const temp = settings?.inferenceTemperature ?? 0.2;
    const topP = settings?.inferenceTopP ?? 0.95;
    const rep = settings?.inferenceRepetitionPenalty ?? 1.05;
    return temp !== 0.2 || topP !== 0.95 || rep !== 1.05;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function InferenceTunerPicker() {
    const { settings, updateSettings } = useSettings();
    const [open, setOpen] = useState(false);

    const currentReasoning = settings?.reasoningEffort || "medium";
    const hasCustom = hasCustomHyperParams(settings);

    const handleReasoningChange = useCallback(
        (value: "low" | "medium" | "high") => {
            updateSettings({ reasoningEffort: value });
        },
        [updateSettings],
    );

    const handleHyperParamChange = useCallback(
        (key: HyperParam["key"], value: number) => {
            updateSettings({ [key]: value } as any);
        },
        [updateSettings],
    );

    const handleResetHyperParams = useCallback(() => {
        updateSettings({
            inferenceTemperature: 0.2,
            inferenceTopP: 0.95,
            inferenceRepetitionPenalty: 1.05,
        } as any);
    }, [updateSettings]);

    // Trigger content: one icon + label — switches to "Ajustes" when hyperparams are custom
    const TriggerIcon = hasCustom ? Cog : (REASONING_ICONS[currentReasoning] || Scale);
    const triggerText = hasCustom
        ? "Ajustes"
        : (REASONING_OPTIONS.find((o) => o.value === currentReasoning)?.label || "Medio");
    const triggerLabel = (
        <span className="flex items-center gap-1">
            <TriggerIcon size={13} className="shrink-0 opacity-80" />
            <span className="typo-select font-medium">{triggerText}</span>
        </span>
    );

    return (
        <Popover
            open={open}
            onOpenChange={setOpen}
        >
            <PopoverTrigger asChild>
                <button
                    className={cn(
                        "flex items-center justify-between cursor-pointer",
                        "h-auto w-fit px-2.5 py-1 typo-select gap-1",
                        "border border-input bg-muted/80 text-foreground rounded-lg shadow-none hover:bg-muted transition-colors duration-200",
                    )}
                    data-testid="inference-tuner-picker"
                >
                    {triggerLabel}
                    <span className="shrink-0 flex items-center ml-0.5">
                        <ChevronDown size={12} className="shrink-0 opacity-60" />
                    </span>
                </button>
            </PopoverTrigger>

            <PopoverContent
                align="start"
                side="top"
                className="min-w-[440px] w-max max-w-[90vw] p-0 overflow-hidden"
                onCloseAutoFocus={(e) => e.preventDefault()}
            >
                <div className="flex" style={{ minHeight: "240px" }}>
                    {/* ── Left panel: Reasoning effort ──────────────────────── */}
                    <div className="flex-1 min-w-0 flex flex-col border-r border-border/40">
                        <div className="px-3 py-2 h-10 flex items-center border-b border-border/40">
                            <span className="typo-menu-header uppercase tracking-wider opacity-70">
                                Razonamiento
                            </span>
                        </div>
                        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
                            {REASONING_OPTIONS.map((option) => {
                                const isActive = currentReasoning === option.value;
                                return (
                                    <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => handleReasoningChange(option.value)}
                                        className={cn(
                                            "w-full flex items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-all duration-150",
                                            "cursor-pointer",
                                            isActive
                                                ? "bg-primary/10 ring-1 ring-primary/30"
                                                : "hover:bg-muted/60",
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
                                                <option.icon size={13} className="shrink-0 opacity-70" />
                                                <span className="typo-select font-medium">
                                                    {option.label}
                                                </span>
                                            </div>
                                            <span className="typo-micro text-muted-foreground leading-tight">
                                                {option.description}
                                            </span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* ── Right panel: Hyperparameters ──────────────────────── */}
                    <div className="w-[220px] shrink-0 flex flex-col">
                        <div className="px-3 py-2 h-10 flex items-center justify-between border-b border-border/40">
                            <span className="typo-menu-header uppercase tracking-wider opacity-70">
                                Hiperparámetros
                            </span>
                            <button
                                    type="button"
                                    onClick={handleResetHyperParams}
                                    disabled={!hasCustom}
                                    className={cn(
                                        "p-0.5 rounded transition-colors cursor-pointer",
                                        hasCustom
                                            ? "text-primary hover:bg-primary/10"
                                            : "text-muted-foreground/30 cursor-default",
                                    )}
                                    title="Restaurar valores por defecto"
                                >
                                    <RotateCcw size={12} />
                                </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-3 space-y-4">
                            {HYPER_PARAMS.map((param) => {
                                const rawValue = (settings as any)?.[param.key];
                                const value = rawValue !== undefined ? rawValue : param.defaultValue;
                                const isDefault = rawValue === undefined || rawValue === param.defaultValue;

                                return (
                                    <div key={param.key} className="space-y-1.5">
                                        <div className="flex items-center justify-between">
                                            <span className={cn(
                                                "typo-select font-medium",
                                                !isDefault && "text-primary",
                                            )}>
                                                {param.label}
                                            </span>
                                            <span className={cn(
                                                "typo-micro tabular-nums font-mono",
                                                !isDefault
                                                    ? "text-primary font-semibold"
                                                    : "text-muted-foreground",
                                            )}>
                                                {param.format(value)}
                                            </span>
                                        </div>
                                        <input
                                            type="range"
                                            min={param.min}
                                            max={param.max}
                                            step={param.step}
                                            value={value}
                                            onChange={(e) =>
                                                handleHyperParamChange(
                                                    param.key,
                                                    parseFloat(e.target.value),
                                                )
                                            }
                                            className="w-full h-1.5 rounded-full appearance-none cursor-pointer
                                                bg-border accent-primary
                                                [&::-webkit-slider-thumb]:appearance-none
                                                [&::-webkit-slider-thumb]:w-3.5
                                                [&::-webkit-slider-thumb]:h-3.5
                                                [&::-webkit-slider-thumb]:rounded-full
                                                [&::-webkit-slider-thumb]:bg-primary
                                                [&::-webkit-slider-thumb]:shadow-sm
                                                [&::-webkit-slider-thumb]:transition-transform
                                                [&::-webkit-slider-thumb]:hover:scale-125
                                                [&::-moz-range-thumb]:w-3.5
                                                [&::-moz-range-thumb]:h-3.5
                                                [&::-moz-range-thumb]:rounded-full
                                                [&::-moz-range-thumb]:bg-primary
                                                [&::-moz-range-thumb]:border-0"
                                        />
                                        <span className="typo-micro text-muted-foreground/60 leading-tight block">
                                            {param.description}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
