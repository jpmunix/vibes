import React from "react";
import { useSettings } from "@/hooks/useSettings";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MAX_CHAT_TURNS_IN_CONTEXT } from "@/constants/settings_constants";

interface OptionInfo {
  value: string;
  label: string;
  description: string;
}

const defaultValue = "default";

const options: OptionInfo[] = [
  {
    value: "2",
    label: "Económico (2)",
    description:
      "Contexto mínimo para reducir el uso de tokens y mejorar los tiempos de respuesta.",
  },
  {
    value: defaultValue,
    label: `Por defecto (${MAX_CHAT_TURNS_IN_CONTEXT})  `,
    description:
      "Tamaño de contexto equilibrado para la mayoría de las conversaciones.",
  },
  {
    value: "5",
    label: "Plus (5)",
    description:
      "Tamaño de contexto ligeramente mayor para conversaciones detalladas.",
  },
  {
    value: "10",
    label: "Alto (10)",
    description:
      "Contexto extendido para conversaciones complejas que requieren más historial.",
  },
  {
    value: "100",
    label: "Máximo (100)",
    description: "Contexto máximo (no recomendado por coste y velocidad).",
  },
];

export const MaxChatTurnsSelector: React.FC = () => {
  const { settings, updateSettings } = useSettings();

  const handleValueChange = (value: string) => {
    if (value === "default") {
      updateSettings({ maxChatTurnsInContext: undefined });
    } else {
      const numValue = parseInt(value, 10);
      updateSettings({ maxChatTurnsInContext: numValue });
    }
  };

  // Determine the current value
  const currentValue =
    settings?.maxChatTurnsInContext?.toString() || defaultValue;

  // Find the current option to display its description
  const currentOption =
    options.find((opt) => opt.value === currentValue) || options[1];

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-4">
        <label
          htmlFor="max-chat-turns"
          className="text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Número máximo de turnos de chat en el contexto
        </label>
        <Select value={currentValue} onValueChange={handleValueChange}>
          <SelectTrigger className="w-[180px]" id="max-chat-turns">
            <SelectValue placeholder="Selecciona turnos" />
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
