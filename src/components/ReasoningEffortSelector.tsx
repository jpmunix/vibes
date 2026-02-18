import React from "react";
import { useSettings } from "@/hooks/useSettings";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

interface OptionInfo {
    value: string;
    label: string;
    description: string;
}

const defaultValue = "medium";

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
        value: defaultValue,
        label: "Medio (por defecto)",
        description:
            "Razonamiento equilibrado (~50% de tokens). Buen balance para la mayoría de tareas.",
    },
    {
        value: "high",
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

export const ReasoningEffortSelector: React.FC = () => {
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
