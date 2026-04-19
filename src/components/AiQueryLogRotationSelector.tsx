import React from "react";
import { useSettings } from "@/hooks/useSettings";
import { UnifiedSelector, type SelectorOption } from "@/components/ui/UnifiedSelector";

const options: SelectorOption[] = [
    { value: "50", label: "50 Entradas" },
    { value: "100", label: "100 Entradas" },
    { value: "200", label: "200 Entradas" },
    { value: "500", label: "500 Entradas" },
    { value: "1000", label: "1000 Entradas" },
];

export function AiQueryLogRotationSelector() {
    const { settings, updateSettings } = useSettings();

    const value = settings?.aiQueryLogRotationThreshold || "200";

    const handleValueChange = (newValue: string) => {
        updateSettings({ aiQueryLogRotationThreshold: newValue as any });
    };

    return (
        <UnifiedSelector
            value={value}
            onChange={handleValueChange}
            options={options}
            triggerVariant="default"
            triggerSize="md"
            popoverWidth="w-[180px]"
            itemLayout="compact"
        />
    );
}
