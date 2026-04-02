import React from "react";
import { useSettings } from "@/hooks/useSettings";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

const defaultValue = "low";

interface OptionInfo {
    value: string;
    label: string;
    description: string;
}

const options: OptionInfo[] = [
    {
        value: "low",
        label: "Conciso",
        description:
            "Respuestas breves y directas. Ideal para tareas productivas.",
    },
    {
        value: "medium",
        label: "Equilibrado",
        description:
            "Explicaciones moderadas cuando son relevantes.",
    },
    {
        value: "high",
        label: "Detallado",
        description:
            "Explicaciones completas y contexto adicional en cada respuesta.",
    },
];

export const TextVerbositySelector: React.FC<{ variant?: "settings" }> = ({ variant = "settings" }) => {
    const { settings, updateSettings } = useSettings();

    const handleValueChange = (value: string) => {
        updateSettings({
            textVerbosity: value as "low" | "medium" | "high",
        });
    };

    const currentValue = settings?.textVerbosity || defaultValue;

    const currentOption =
        options.find((opt) => opt.value === currentValue) || options[0];

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

    return null;
};
