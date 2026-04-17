import { useEffect, useRef } from "react";
import { useSearch, useNavigate } from "@tanstack/react-router";
import { useAtom, useSetAtom, useAtomValue } from "jotai";
import { selectedAppIdAtom, appsListAtom } from "@/atoms/appAtoms";
import { selectedChatIdAtom } from "@/atoms/chatAtoms";
import { ChatPanel } from "@/components/ChatPanel";
import { ipc } from "@/ipc/types";
import { useStreamChat } from "@/hooks/useStreamChat";
import { ChevronRight, MessagesSquare } from "lucide-react";
import { ServerControlButton } from "@/components/ServerControlButton";
import { GitChangesButton } from "@/components/GitChangesButton";
import { LanguageBadge } from "@/components/LanguageBadge";
import { AgentBranchSelector } from "@/components/AgentBranchSelector";
import { useChats } from "@/hooks/useChats";
import { useSessionCost } from "@/hooks/useSessionCost";
import { Coins } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * /workspace route — renders ChatPanel inline (no preview, no dev server).
 * Text-focused chat mode without starting any preview or server infrastructure.
 */
export default function WorkspacePage() {
  const search = useSearch({ from: "/workspace" });
  const navigate = useNavigate();
  const appId = search.appId ? Number(search.appId) : null;
  const chatId = search.chatId ? Number(search.chatId) : null;

  const setSelectedAppId = useSetAtom(selectedAppIdAtom);
  const [selectedChatId, setSelectedChatId] = useAtom(selectedChatIdAtom);
  const [appsList] = useAtom(appsListAtom);
  const restoredRef = useRef(false);

  // Find the app name for the header
  const selectedApp = appId ? appsList.find((app) => app.id === appId) : null;

  // Fetch chats to get the current chat title for the breadcrumb
  const { chats } = useChats(appId ?? undefined);
  const selectedChat = chats.find((c) => c.id === chatId);

  // Session cost
  const { totalCostUsd, hasPricing } = useSessionCost(chatId);

  // Restore last selection from DB when landing without params
  useEffect(() => {
    if (restoredRef.current) return;
    if (appId || chatId) return; // Already have params, no need to restore

    restoredRef.current = true;

    ipc.misc.getPreference({ key: "sidebar.lastSelection" }).then((raw) => {
      if (raw) {
        try {
          const sel = JSON.parse(raw) as { appId: number; chatId: number };
          if (sel.appId && sel.chatId) {
            navigate({
              to: "/workspace",
              search: { appId: sel.appId, chatId: sel.chatId },
              replace: true,
            });
          }
        } catch { /* ignore */ }
      }
    }).catch(() => { /* ignore */ });
  }, [appId, chatId, navigate]);

  // Set atoms when search params change
  useEffect(() => {
    if (appId) {
      setSelectedAppId(appId);
    }
  }, [appId, setSelectedAppId]);

  useEffect(() => {
    if (chatId) {
      setSelectedChatId(chatId);
      // Mark this chat as read
      ipc.chat.markChatRead(chatId).catch(() => {});
    }
  }, [chatId, setSelectedChatId]);

  // Setup streaming for this chat
  useStreamChat({ hasChatId: !!chatId });

  // If no app/chat selected, show empty state
  if (!appId || !chatId) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full text-muted-foreground gap-3">
        <MessagesSquare className="h-10 w-10 opacity-20" />
        <h2 className="text-base font-medium text-foreground/60">
          Selecciona un chat
        </h2>
        <p className="text-xs text-muted-foreground/50 max-w-xs text-center">
          Elige un chat de la barra lateral para empezar.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full">
      {/* Minimal header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/40 bg-background/80 backdrop-blur-sm shrink-0">
        {/* Left: breadcrumb App / Chat */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm font-semibold text-foreground truncate shrink-0">
            {selectedApp?.name || "App"}
          </span>
          {selectedChat?.title && (
            <>
              <ChevronRight size={13} className="shrink-0 text-muted-foreground/50" />
              <span className="text-sm text-muted-foreground truncate">
                {selectedChat.title}
              </span>
            </>
          )}
          <LanguageBadge language={selectedApp?.primaryLanguage} />
        </div>

        {/* Right: Branch | Server | Git | Cost */}
        <TooltipProvider>
          <div className="flex items-center gap-2">
            {appId && <AgentBranchSelector appId={appId} />}
            {(!selectedApp?.primaryLanguage || ['javascript', 'typescript', 'unknown'].includes(selectedApp.primaryLanguage.toLowerCase())) && (
              <ServerControlButton appId={appId} />
            )}
            <GitChangesButton appId={appId} />

            {/* Session cost — separated with a delicate divider */}
            {hasPricing && (
              <>
                <div className="w-px h-4 bg-border/60 shrink-0" />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold
                        bg-amber-500/10 text-amber-600 dark:text-yellow-400
                        border border-amber-400/20 dark:border-yellow-500/20
                        select-none cursor-default transition-all duration-300"
                    >
                      <Coins size={11} className="shrink-0 opacity-80" />
                      <span className="tabular-nums tracking-tight">
                        {formatWorkspaceCost(totalCostUsd)}
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Gasto total de esta sesión</TooltipContent>
                </Tooltip>
              </>
            )}
          </div>
        </TooltipProvider>
      </div>

      {/* Chat panel — no preview, no server */}
      <div className="flex-1 min-h-0">
        <ChatPanel
          chatId={selectedChatId ?? undefined}
          autoStart={false}
          isPreviewOpen={false}
          onTogglePreview={() => {}}
          workspaceMode
        />
      </div>
    </div>
  );
}

/** Same formatting logic as ChatHeader's formatSessionCost. */
function formatWorkspaceCost(usd: number): string {
  if (usd === 0) return "$0,00";
  if (usd < 0.00005) return "<$0,0001";
  let raw: string;
  if (usd < 1) {
    raw = usd.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  } else {
    raw = usd.toFixed(2);
  }
  return "$" + raw.replace(".", ",");
}
