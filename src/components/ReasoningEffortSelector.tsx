import React, { useState, useEffect } from "react";
import { useSettings } from "@/hooks/useSettings";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

interface ReasoningEffortSelectorProps {
    variant?: "settings" | "compact" | "default";
}

const defaultReasoningValue = "medium";

interface OptionInfo {
    value: string;
    label: string;
    description: string;
}

const reasoningOptions: OptionInfo[] = [
    {
        value: "low",
        label: "Bajo",
        description: "Razonamiento ligero. Para tareas simples y directas.",
    },
    {
        value: "medium",
        label: "Medio",
        description: "Equilibrio entre velocidad y profundidad. Recomendado para la mayoría de tareas.",
    },
    {
        value: "high",
        label: "Alto",
        description: "Análisis profundo. Para problemas complejos, debugging y refactorizaciones.",
    },
];

export const ReasoningEffortSelector: React.FC<ReasoningEffortSelectorProps> = ({ variant = "default" }) => {
    const { settings, updateSettings } = useSettings();

    const currentReasoning = settings?.reasoningEffort || defaultReasoningValue;

    const currentReasoningOption =
        reasoningOptions.find((opt) => opt.value === currentReasoning) || reasoningOptions[1];

    const handleReasoningChange = (value: string) => {
        updateSettings({ reasoningEffort: value as "low" | "medium" | "high" });
    };

    if (variant === "compact") {
        return (
            <Popover>
                <PopoverTrigger asChild>
                    <button
                        className="flex items-center justify-between !h-6 w-fit px-2 py-0 text-xs-sm font-medium rounded-md shadow-none gap-1 border border-input bg-transparent hover:bg-muted/50 focus:bg-muted/50 transition-colors cursor-pointer"
                        id="reasoning-effort-compact"
                    >
                        <span className="font-medium">{currentReasoningOption.label}</span>
                        <svg width="10" height="10" viewBox="0 0 10 10" className="ml-0.5 text-muted-foreground opacity-60">
                            <path d="M2.5 3.5L5 6.5L7.5 3.5" stroke="currentColor" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </button>
                </PopoverTrigger>
                <PopoverContent
                    className="w-[180px] p-2"
                    align="start"
                    side="top"
                    sideOffset={8}
                >
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-2 pb-1.5">
                        Razonamiento
                    </div>
                    {reasoningOptions.map((option) => (
                        <button
                            key={option.value}
                            onClick={() => handleReasoningChange(option.value)}
                            className={`w-full text-left px-2 py-1.5 rounded-md text-sm transition-colors cursor-pointer ${
                                currentReasoning === option.value
                                    ? "bg-primary/10 text-primary font-medium"
                                    : "hover:bg-muted/50 text-foreground"
                            }`}
                        >
                            {option.label}
                        </button>
                    ))}
                </PopoverContent>
            </Popover>
        );
    }

    if (variant === "settings") {
        return (
            <Select value={currentReasoning} onValueChange={handleReasoningChange}>
                <SelectTrigger className="border-0 bg-primary dark:bg-primary text-primary-foreground dark:text-primary-foreground shadow-sm rounded-lg px-4 py-1.5 h-auto text-sm font-bold hover:brightness-110 dark:hover:bg-primary transition-all duration-200 w-auto gap-2 cursor-pointer [&_svg]:!text-current [&_svg]:!opacity-100">
                    <SelectValue>{currentReasoningOption.label}</SelectValue>
                </SelectTrigger>
                <SelectContent className="w-64 max-h-[300px] overflow-y-auto">
                    {reasoningOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                            <div className="flex flex-col gap-0.5">
                                <span className="text-sm font-medium">{option.label}</span>
                                <span className="text-[10px] text-muted-foreground whitespace-normal leading-tight">
                                    {option.description}
                                </span>
                            </div>
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        );
    }

    return (
        <div className="space-y-1">
            <div className="flex items-center gap-4">
                <Select value={currentReasoning} onValueChange={handleReasoningChange}>
                    <SelectTrigger className="w-[180px]" id="reasoning-effort">
                        <SelectValue placeholder="Selecciona esfuerzo" />
                    </SelectTrigger>
                    <SelectContent>
                        {reasoningOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                                {option.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
                {currentReasoningOption.description}
            </div>
        </div>
    );
};
