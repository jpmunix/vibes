import React from "react";
import { useSettings } from "@/hooks/useSettings";
import { useI18n } from "@/lib/i18n";
import {
  UnifiedSelector,
  type SelectorOption,
} from "@/components/ui/UnifiedSelector";

const defaultValue = "low";


export const TextVerbositySelector: React.FC<{ variant?: "settings" }> = ({
  variant = "settings",
}) => {
  const { settings, updateSettings } = useSettings();
  const { t } = useI18n();

  const options: SelectorOption[] = [
    { value: "low", label: t("agentPills.concise"), description: t("agentPills.conciseDesc") },
    { value: "medium", label: t("agentPills.balanced"), description: t("agentPills.balancedDesc") },
    { value: "high", label: t("agentPills.detailed"), description: t("agentPills.detailedDesc") },
  ];

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
