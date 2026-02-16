import {
  MiniSelectTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSettings } from "@/hooks/useSettings";
import { useFreeAgentQuota } from "@/hooks/useFreeAgentQuota";
import type { ChatMode } from "@/lib/schemas";
import { isDyadProEnabled } from "@/lib/schemas";
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

  const selectedMode = settings?.selectedChatMode || "build";
  const isProEnabled = settings ? isDyadProEnabled(settings) : false;
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
      case "build":
        return "Build";
      case "plan":
        return "Planificación";
      case "ask":
        return "Preguntar";
      case "agent":
        return "Build (MCP)";
      case "local-agent":
        // Show "Basic Agent" for non-Pro users, "Agent" for Pro users
        return isProEnabled ? "Agente inteligente" : "Agente inteligente";
      default:
        return "Build";
    }
  };
  const isMac = detectIsMac();

  return (
    <Select value={selectedMode} onValueChange={handleModeChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <MiniSelectTrigger
            data-testid="chat-mode-selector"
            className={cn(
              "!h-6 w-fit px-1.5 py-0 text-xs-sm font-medium shadow-none gap-0.5 transition-colors",
              selectedMode === "build" || selectedMode === "local-agent"
                ? "bg-background hover:bg-muted/50 focus:bg-muted/50"
                : selectedMode === "plan"
                  ? "bg-primary/10 hover:bg-primary/20 focus:bg-primary/20 text-primary border-primary/20"
                  : "bg-primary/10 hover:bg-primary/20 focus:bg-primary/20 text-primary border-primary/20 dark:bg-primary/20 dark:hover:bg-primary/30 dark:focus:bg-primary/30",
            )}
            size="sm"
          >
            <SelectValue>{getModeDisplayName(selectedMode)}</SelectValue>
          </MiniSelectTrigger>
        </TooltipTrigger>
        <TooltipContent>
          <div className="flex flex-col">
            <span>Abrir el menú de modos</span>
            <span className="text-xs text-gray-200 dark:text-gray-500">
              {isMac ? "⌘ + ." : "Ctrl + ."} para cambiar
            </span>
          </div>
        </TooltipContent>
      </Tooltip>
      <SelectContent align="start" onCloseAutoFocus={(e) => e.preventDefault()}>
        {
          <SelectItem value="plan">
            <div className="flex flex-col items-start">
              <span className="font-medium">Planificación</span>
              <span className="text-xs text-muted-foreground">
                Transforma tu idea en un plan de acción editable
              </span>
            </div>
          </SelectItem>
        }
        {
          <SelectItem value="local-agent">
            <div className="flex flex-col items-start">
              <div className="flex items-center gap-1.5">
                <span className="font-medium">Agente inteligente</span>
              </div>
              <span className="text-xs text-muted-foreground">
                El mejor modo de trabajo para el día a día
              </span>
            </div>
          </SelectItem>
        }
        {/*{!isProEnabled && (
          <SelectItem value="local-agent" disabled={isQuotaExceeded}>
            <div className="flex flex-col items-start">
              <div className="flex items-center gap-1.5">
                <span className="font-medium">Basic Agent</span>
                <span className="text-xs text-muted-foreground">
                  ({isQuotaExceeded ? "0" : messagesRemaining}/5 remaining for
                  today)
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                {isQuotaExceeded
                  ? "Daily limit reached"
                  : "Try our AI agent for free"}
              </span>
            </div>
          </SelectItem>
        )}*/}
        <SelectItem value="build">
          <div className="flex flex-col items-start">
            <span className="font-medium">Build</span>
            <span className="text-xs text-muted-foreground">
              Genera y edita con una gestion de contexto algo peor
            </span>
          </div>
        </SelectItem>
        <SelectItem value="ask">
          <div className="flex flex-col items-start">
            <span className="font-medium">Preguntar</span>
            <span className="text-xs text-muted-foreground">
              Pregunta sobre cosas de la app pero sin editar
            </span>
          </div>
        </SelectItem>
        {/*<SelectItem value="agent">*/}
        {/*  <div className="flex flex-col items-start">*/}
        {/*    <div className="flex items-center gap-1.5">*/}
        {/*      <span className="font-medium">Build with MCP</span>*/}
        {/*    </div>*/}
        {/*    <span className="text-xs text-muted-foreground">*/}
        {/*      Like Build, but can use tools (MCP) to generate code*/}
        {/*    </span>*/}
        {/*  </div>*/}
        {/*</SelectItem>*/}
      </SelectContent>
    </Select>
  );
}
