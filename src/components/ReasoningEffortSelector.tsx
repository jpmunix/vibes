import React from "react";
import { useSettings } from "@/hooks/useSettings";
import { useI18n } from "@/lib/i18n";
import {
  UnifiedSelector,
  type SelectorOption,
} from "@/components/ui/UnifiedSelector";

interface ReasoningEffortSelectorProps {
  variant?: "settings" | "compact" | "default";
}

const defaultReasoningValue = "medium";


export const ReasoningEffortSelector: React.FC<
  ReasoningEffortSelectorProps
> = ({ variant = "default" }) => {
  const { settings, updateSettings } = useSettings();
  const { t } = useI18n();

  const reasoningOptions: SelectorOption[] = [
    { value: "low", label: t("agentPills.low"), description: t("agentPills.lowDesc") },
    { value: "medium", label: t("agentPills.medium"), description: t("agentPills.mediumDesc") },
    { value: "high", label: t("agentPills.high"), description: t("agentPills.highDesc") },
  ];

  const currentReasoning = settings?.reasoningEffort || defaultReasoningValue;

  const handleReasoningChange = (value: string) => {
    updateSettings({ reasoningEffort: value as "low" | "medium" | "high" });
  };

  if (variant === "compact") {
    return (
      <UnifiedSelector
        value={currentReasoning}
        onChange={handleReasoningChange}
        options={reasoningOptions}
        triggerVariant="default"
        triggerSize="sm"
        popoverWidth="w-[220px]"
        itemLayout="compact"
        showCheckmark
        side="top"
        header={
          <span className="typo-caption uppercase tracking-wider font-bold opacity-80">
            Razonamiento
          </span>
        }
        data-testid="reasoning-effort-compact"
      />
    );
  }

  if (variant === "settings") {
    return (
      <UnifiedSelector
        value={currentReasoning}
        onChange={handleReasoningChange}
        options={reasoningOptions}
        triggerVariant="pill"
        triggerSize="md"
        popoverWidth="w-[280px]"
      />
    );
  }

  // default variant — same as compact but bottom
  return (
    <UnifiedSelector
      value={currentReasoning}
      onChange={handleReasoningChange}
      options={reasoningOptions}
      triggerVariant="default"
      triggerSize="md"
      popoverWidth="w-[240px]"
      data-testid="reasoning-effort"
    />
  );
};
