import {
  MiniSelectTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { useSettings } from "@/hooks/useSettings";
import { useFreeAgentQuota } from "@/hooks/useFreeAgentQuota";
import type { ChatMode } from "@/lib/schemas";
import { cn } from "@/lib/utils";
import { detectIsMac } from "@/hooks/useChatModeToggle";
import { useRouterState } from "@tanstack/react-router";




export function ChatModeSelector() {
  const { settings, updateSettings } = useSettings();
  const routerState = useRouterState();

  // Migrate deprecated modes to their replacements
  const rawMode = settings?.selectedChatMode || "local-agent";
  const selectedMode: ChatMode =
    rawMode === "build" || rawMode === "agent" || rawMode === "crush-agent" || rawMode === "legacy-agent"
      ? "local-agent"
      : (rawMode as ChatMode);
  const { } = useFreeAgentQuota();

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
      case "local-agent":
      default:
        return "Agente";
    }
  };
  const isMac = detectIsMac();

  return (
    <Select value={selectedMode} onValueChange={handleModeChange}>
      <MiniSelectTrigger
        data-testid="chat-mode-selector"
        className={cn(
          "!h-6 w-fit px-1.5 py-0 text-xs-sm font-medium shadow-none gap-0.5 transition-colors cursor-pointer",
          selectedMode === "local-agent"
            ? "bg-background hover:bg-muted/50 focus:bg-muted/50"
            : "bg-primary/10 hover:bg-primary/20 focus:bg-primary/20 text-primary border-primary/20",
        )}
        size="sm"
      >
        <SelectValue>{getModeDisplayName(selectedMode)}</SelectValue>
      </MiniSelectTrigger>
      <SelectContent align="start" onCloseAutoFocus={(e) => e.preventDefault()}>
        <SelectItem value="local-agent">
          <div className="flex flex-col items-start">
            <span className="font-medium">Agente</span>
            <span className="text-xs text-muted-foreground">
              Desarrolla, edita y depura con herramientas avanzadas
            </span>
          </div>
        </SelectItem>
        <SelectItem value="plan">
          <div className="flex flex-col items-start">
            <span className="font-medium">Planificar</span>
            <span className="text-xs text-muted-foreground">
              Diseña un plan de acción antes de implementar
            </span>
          </div>
        </SelectItem>
        <SelectItem value="ask">
          <div className="flex flex-col items-start">
            <span className="font-medium">Preguntar</span>
            <span className="text-xs text-muted-foreground">
              Consulta sobre tu código sin realizar cambios
            </span>
          </div>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
