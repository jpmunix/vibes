import React from "react";
import { useSettings } from "@/hooks/useSettings";
import { UnifiedSelector, type SelectorOption } from "@/components/ui/UnifiedSelector";
import { MAX_CHAT_TURNS_IN_CONTEXT } from "@/constants/settings_constants";

const defaultValue = "default";

const options: SelectorOption[] = [
  {
    value: "2",
    label: "Económico (2)",
    description: "Contexto mínimo para reducir el uso de tokens y mejorar los tiempos de respuesta.",
  },
  {
    value: defaultValue,
    label: `Por defecto (${MAX_CHAT_TURNS_IN_CONTEXT})`,
    description: "Tamaño de contexto equilibrado para la mayoría de las conversaciones.",
  },
  {
    value: "5",
    label: "Plus (5)",
    description: "Tamaño de contexto ligeramente mayor para conversaciones detalladas.",
  },
  {
    value: "10",
    label: "Alto (10)",
    description: "Contexto extendido para conversaciones complejas que requieren más historial.",
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

  const currentValue =
    settings?.maxChatTurnsInContext?.toString() || defaultValue;

  const currentOption =
    options.find((opt) => opt.value === currentValue) || options[1];

  return (
    <div className="space-y-1">
      <UnifiedSelector
        value={currentValue}
        onChange={handleValueChange}
        options={options}
        triggerVariant="default"
        triggerSize="md"
        popoverWidth="w-[240px]"
        data-testid="max-chat-turns"
      />
      <div className="text-sm text-muted-foreground">
        {currentOption.description}
      </div>
    </div>
  );
};
