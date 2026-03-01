import React from "react";
import { useSettings } from "@/hooks/useSettings";
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

const defaultValue = "high";

interface OptionInfo {
    value: string;
    label: string;
    description: string;
}

const options: OptionInfo[] = [
    {
        value: "none",
        label: "Ninguno",
        description:
            "Desactiva el razonamiento por completo. Respuestas directas sin análisis previo.",
    },
    {
        value: "minimal",
        label: "Mínimo",
        description:
            "Razonamiento superficial (~10% de tokens). Para preguntas simples y directas.",
    },
    {
        value: "low",
        label: "Bajo",
        description:
            "Razonamiento ligero (~20% de tokens). Para tareas rutinarias con poco análisis.",
    },
    {
        value: "medium",
        label: "Medio",
        description:
            "Razonamiento equilibrado (~50% de tokens). Buen balance para la mayoría de tareas.",
    },
    {
        value: defaultValue,
        label: "Alto",
        description:
            "Razonamiento extenso (~80% de tokens). Para problemas complejos que requieren análisis profundo.",
    },
    {
        value: "xhigh",
        label: "Muy alto",
        description:
            "Razonamiento máximo (~95% de tokens). Para tareas críticas que necesitan el mayor análisis posible.",
    },
];

export const ReasoningEffortSelector: React.FC<ReasoningEffortSelectorProps> = ({ variant = "default" }) => {
    const { settings, updateSettings } = useSettings();

    const handleValueChange = (value: string) => {
        updateSettings({
            reasoningEffort: value as
                | "none"
                | "minimal"
                | "low"
                | "medium"
                | "high"
                | "xhigh",
        });
    };

    const currentValue = settings?.reasoningEffort || defaultValue;

    const currentOption =
        options.find((opt) => opt.value === currentValue) || options[3];

    if (variant === "compact") {
        return (
            <Select value={currentValue} onValueChange={handleValueChange}>
                <SelectTrigger
                    className="flex items-center justify-between !h-6 w-fit min-w-[120px] px-2 py-0 text-xs-sm font-medium rounded-md shadow-none gap-0.5 border border-input bg-transparent hover:bg-muted/50 focus:bg-muted/50 transition-colors cursor-pointer"
                    id="reasoning-effort-compact"
                >
                    <div className="flex items-center gap-1 whitespace-nowrap">
                        <span className="text-muted-foreground font-normal">Razonamiento</span>
                        <span className="font-medium">{currentOption.label.toLowerCase()}</span>
                        <div className="hidden"><SelectValue /></div>
                    </div>
                </SelectTrigger>
                <SelectContent
                    className="w-48 overflow-y-auto"
                    align="start"
                    side="top"
                >
                    {options.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                            <span className="text-sm font-medium">{option.label}</span>
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        );
    }

    if (variant === "settings") {
        return (
            <Select value={currentValue} onValueChange={handleValueChange}>
                <SelectTrigger className="border-0 bg-primary dark:bg-primary text-primary-foreground dark:text-primary-foreground shadow-sm rounded-lg px-4 py-1.5 h-auto text-sm font-bold hover:brightness-110 dark:hover:bg-primary transition-all duration-200 w-auto gap-2 cursor-pointer [&_svg]:!text-current [&_svg]:!opacity-100">
                    <SelectValue>{currentOption.label}</SelectValue>
                </SelectTrigger>
                <SelectContent className="w-64 max-h-[300px] overflow-y-auto">
                    {options.map((option) => (
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
                <Select value={currentValue} onValueChange={handleValueChange}>
                    <SelectTrigger className="w-[180px]" id="reasoning-effort">
                        <SelectValue placeholder="Selecciona esfuerzo" />
                    </SelectTrigger>
                    <SelectContent>
                        {options.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                                {option.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
                {currentOption.description}
            </div>
        </div>
    );
};
