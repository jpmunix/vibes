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
import { toast } from "sonner";
import { LocalAgentNewChatToast } from "./LocalAgentNewChatToast";
import { useAtomValue } from "jotai";
import { chatMessagesByIdAtom } from "@/atoms/chatAtoms";



export function ChatModeSelector() {
  const { settings, updateSettings } = useSettings();
  const routerState = useRouterState();
  const isChatRoute = routerState.location.pathname === "/chat";
  const messagesById = useAtomValue(chatMessagesByIdAtom);
  const chatId = routerState.location.search.id as number | undefined;
  const currentChatMessages = chatId ? (messagesById.get(chatId) ?? []) : [];

  // Map "build" to "local-agent" for users who had build as their selected mode
  const rawMode = settings?.selectedChatMode || "local-agent";
  const selectedMode = rawMode === "build" ? "local-agent" : rawMode;
  const { } = useFreeAgentQuota();

  const handleModeChange = (value: string) => {
    const newMode = value as ChatMode;
    updateSettings({ selectedChatMode: newMode });

    // We want to show a toast when user is switching to the new agent mode
    // because they might weird results mixing Build and Agent mode in the same chat.
    //
    // Only show toast if:
    // - User is switching to the new agent mode
    // - User is on the chat (not home page) with existing messages
    // - User has not explicitly disabled the toast
    if (
      newMode === "local-agent" &&
      isChatRoute &&
      currentChatMessages.length > 0 &&
      !settings?.hideLocalAgentNewChatToast
    ) {
      toast.custom(
        (t) => (
          <LocalAgentNewChatToast
            toastId={t}
            onNeverShowAgain={() => {
              updateSettings({ hideLocalAgentNewChatToast: true });
            }}
          />
        ),
        // Make the toast shorter in test mode for faster tests.
        { duration: settings?.isTestMode ? 50 : 8000 },
      );
    }
  };

  const getModeDisplayName = (mode: ChatMode) => {
    switch (mode) {
      case "plan":
        return "Planificar";
      case "ask":
        return "Preguntar";
      case "crush-agent":
        return "Crush";
      case "build":
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
            : selectedMode === "crush-agent"
              ? "bg-teal-500/10 hover:bg-teal-500/20 focus:bg-teal-500/20 text-teal-600 border-teal-500/20 dark:bg-teal-500/20 dark:hover:bg-teal-500/30 dark:text-teal-400"
              : selectedMode === "plan"
                ? "bg-primary/10 hover:bg-primary/20 focus:bg-primary/20 text-primary border-primary/20"
                : "bg-primary/10 hover:bg-primary/20 focus:bg-primary/20 text-primary border-primary/20 dark:bg-primary/20 dark:hover:bg-primary/30 dark:focus:bg-primary/30",
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
              Desarrolla, edita y depura con acceso a herramientas
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
        <SelectItem value="crush-agent">
          <div className="flex flex-col items-start">
            <span className="font-medium text-teal-600 dark:text-teal-400">Crush Agent</span>
            <span className="text-xs text-muted-foreground">
              Motor IA externo con herramientas avanzadas (Crush)
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
