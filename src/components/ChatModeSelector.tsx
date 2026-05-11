import { UnifiedSelector } from "@/components/ui/UnifiedSelector";
import { useSettings } from "@/hooks/useSettings";

import type { ChatMode } from "@/lib/schemas";
import { DEFAULT_STRATEGIST_MODEL } from "@/lib/schemas";
import { cn } from "@/lib/utils";
import { detectIsMac } from "@/hooks/useChatModeToggle";
import { useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useSetAtom } from "jotai";
import { planModelOverrideAtom } from "@/atoms/chatAtoms";




export function ChatModeSelector() {
  const { settings, updateSettings } = useSettings();
  const routerState = useRouterState();
  const setPlanModelOverride = useSetAtom(planModelOverrideAtom);

  const selectedMode: ChatMode = settings?.selectedChatMode || "agent";

  // Initialize the override atom on mount if already in plan/ask mode
  // (covers the case where the app starts with plan mode from a previous session)
  useEffect(() => {
    if (selectedMode === "plan" || selectedMode === "ask") {
      setPlanModelOverride(settings?.strategistModel || DEFAULT_STRATEGIST_MODEL);
    }
    // Only run when selectedMode changes (settings load or mode switch)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMode]);

  const handleModeChange = (value: string) => {
    const newMode = value as ChatMode;
    updateSettings({ selectedChatMode: newMode });

    // Initialize/clear the transient model override for plan/ask modes
    if (newMode === "plan" || newMode === "ask") {
      // Set override to the strategist model from settings
      setPlanModelOverride(settings?.strategistModel || DEFAULT_STRATEGIST_MODEL);
    } else {
      // Clear override when switching back to agent
      setPlanModelOverride(null);
    }
  };

  const getModeDisplayName = (mode: ChatMode | string) => {
    switch (mode) {
      case "plan":
        return "Planificar";
      case "ask":
        return "Preguntar";
      case "agent":
      default:
        return "Agente";
    }
  };
  const isMac = detectIsMac();

  return (
    <UnifiedSelector
      value={selectedMode}
      onChange={handleModeChange}
      options={[
        {
          value: "agent",
          label: "Agente",
          description: "Desarrolla, edita y depura con herramientas avanzadas",
        },
        {
          value: "plan",
          label: "Planificar",
          description: "Diseña un plan de acción antes de implementar",
        },
        {
          value: "ask",
          label: "Preguntar",
          description: "Consulta sobre tu código sin realizar cambios",
        },
      ]}
      triggerVariant="pill"
      triggerSize="sm"
      triggerClassName={cn(
        selectedMode === "agent"
          ? "bg-muted/80 text-foreground hover:bg-muted"
          : "!bg-primary/20 !text-primary !border-primary/20 hover:!bg-primary/30"
      )}
      customTriggerLabel={<span className="font-semibold">{getModeDisplayName(selectedMode)}</span>}
      popoverWidth="w-[280px]"
      data-testid="chat-mode-selector"
      side="top"
    />
  );
}

