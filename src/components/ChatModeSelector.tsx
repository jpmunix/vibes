import { UnifiedSelector } from "@/components/ui/UnifiedSelector";
import { useSettings } from "@/hooks/useSettings";

import type { ChatMode } from "@/lib/schemas";
import { cn } from "@/lib/utils";
import { detectIsMac } from "@/hooks/useChatModeToggle";
import { useRouterState } from "@tanstack/react-router";



export function ChatModeSelector() {
  const { settings, updateSettings } = useSettings();
  const routerState = useRouterState();

  const selectedMode: ChatMode = settings?.selectedChatMode || "agent";

  const handleModeChange = (value: string) => {
    const newMode = value as ChatMode;
    updateSettings({ selectedChatMode: newMode });
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
