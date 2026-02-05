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
    value: "low",
    label: "Bajo",
    description:
      "Tokens de razonamiento mínimos para respuestas más rápidas y costes más bajos.",
  },
  {
    value: defaultValue,
    label: "Medio (por defecto)",
    description:
      "Razonamiento equilibrado para la mayoría de las conversaciones.",
  },
  {
    value: "high",
    label: "Alto",
    description:
      "Razonamiento extendido para problemas complejos que requieren un análisis profundo.",
  },
];

export const ThinkingBudgetSelector: React.FC = () => {
  const { settings, updateSettings } = useSettings();

  const handleValueChange = (value: string) => {
    updateSettings({ thinkingBudget: value as "low" | "medium" | "high" });
  };

  // Determine the current value
  const currentValue = settings?.thinkingBudget || defaultValue;

  // Find the current option to display its description
  const currentOption =
    options.find((opt) => opt.value === currentValue) || options[1];

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-4">
        <label
          htmlFor="thinking-budget"
          className="text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Presupuesto de razonamiento
        </label>
        <Select value={currentValue} onValueChange={handleValueChange}>
          <SelectTrigger className="w-[180px]" id="thinking-budget">
            <SelectValue placeholder="Selecciona presupuesto" />
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
