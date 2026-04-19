import React from "react";
import { useSettings } from "@/hooks/useSettings";
import { UnifiedSelector, type SelectorOption } from "@/components/ui/UnifiedSelector";
import { ChevronDown } from "@/components/ui/icons";
import type { ChatLanguage } from "@/lib/schemas";

const defaultValue: ChatLanguage = "es";

const options: SelectorOption[] = [
  {
    value: "es",
    label: "Español",
    description: "El agente priorizará este idioma en sus respuestas y explicaciones.",
  },
  {
    value: "en",
    label: "English",
    description: "The assistant will always respond in English in all conversations.",
  },
];

export const ChatLanguageSelector: React.FC = () => {
  const { settings, updateSettings } = useSettings();

  const handleValueChange = (value: string) => {
    updateSettings({ chatLanguage: value as ChatLanguage });
  };

  const currentValue = settings?.chatLanguage || defaultValue;

  const currentOption =
    options.find((opt) => opt.value === currentValue) || options[0];

  return (
    <div className="space-y-1">
      <UnifiedSelector
        value={currentValue}
        onChange={handleValueChange}
        options={options}
        triggerVariant="default"
        triggerSize="md"
        popoverWidth="w-[240px]"
        data-testid="chat-language"
      />
      <div className="text-sm text-muted-foreground">
        {currentOption.description}
      </div>
    </div>
  );
};
