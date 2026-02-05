import React from "react";
import { useSettings } from "@/hooks/useSettings";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ChatLanguage } from "@/lib/schemas";

interface OptionInfo {
  value: ChatLanguage;
  label: string;
  description: string;
}

const defaultValue: ChatLanguage = "es";

const options: OptionInfo[] = [
  {
    value: "es",
    label: "Español",
    description:
      "El asistente responderá siempre en español en todas las conversaciones.",
  },
  {
    value: "en",
    label: "English",
    description:
      "The assistant will always respond in English in all conversations.",
  },
];

export const ChatLanguageSelector: React.FC = () => {
  const { settings, updateSettings } = useSettings();

  const handleValueChange = (value: string) => {
    updateSettings({ chatLanguage: value as ChatLanguage });
  };

  // Determine the current value
  const currentValue = settings?.chatLanguage || defaultValue;

  // Find the current option to display its description
  const currentOption =
    options.find((opt) => opt.value === currentValue) || options[0];

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-4">
        <label
          htmlFor="chat-language"
          className="text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Idioma del chat
        </label>
        <Select value={currentValue} onValueChange={handleValueChange}>
          <SelectTrigger className="w-[180px]" id="chat-language">
            <SelectValue placeholder="Selecciona idioma" />
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
