import React from "react";
import { useSettings } from "@/hooks/useSettings";
import { UnifiedSelector, type SelectorOption } from "@/components/ui/UnifiedSelector";


const defaultValue = "low";

const options: SelectorOption[] = [
    {
        value: "low",
        label: "Conciso",
        description: "Respuestas breves y directas. Ideal para tareas productivas.",
    },
    {
        value: "medium",
        label: "Equilibrado",
        description: "Explicaciones moderadas cuando son relevantes.",
    },
    {
        value: "high",
        label: "Detallado",
        description: "Explicaciones completas y contexto adicional en cada respuesta.",
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

    if (variant === "settings") {
        return (
            <UnifiedSelector
                value={currentValue}
                onChange={handleValueChange}
                options={options}
                triggerVariant="pill"
                triggerSize="md"
                popoverWidth="w-[280px]"
            />
        );
    }

    return null;
};
