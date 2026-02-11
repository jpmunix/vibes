import React from "react";
import { useSettings } from "@/hooks/useSettings";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

export function AiQueryLogRotationSelector() {
    const { settings, updateSettings } = useSettings();

    const value = settings?.aiQueryLogRotationThreshold || "200";

    const handleValueChange = (newValue: string) => {
        updateSettings({ aiQueryLogRotationThreshold: newValue as any });
    };

    return (
        <Select value={value} onValueChange={handleValueChange}>
            <SelectTrigger className="w-[180px] h-10 border-border bg-card dark:bg-gray-800 rounded-xl font-medium focus:ring-primary/20">
                <SelectValue placeholder="Seleccionar límite" />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-border bg-card dark:bg-gray-800">
                <SelectItem value="50" className="rounded-lg">50 Entradas</SelectItem>
                <SelectItem value="100" className="rounded-lg">100 Entradas</SelectItem>
                <SelectItem value="200" className="rounded-lg">200 Entradas</SelectItem>
                <SelectItem value="500" className="rounded-lg">500 Entradas</SelectItem>
                <SelectItem value="1000" className="rounded-lg">1000 Entradas</SelectItem>
            </SelectContent>
        </Select>
    );
}
