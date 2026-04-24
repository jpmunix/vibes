import { useEffect, useRef, useState } from "react";
import { useSearch, useNavigate } from "@tanstack/react-router";
import { useAtom, useSetAtom, useAtomValue } from "jotai";
import { selectedAppIdAtom, appsListAtom } from "@/atoms/appAtoms";
import { selectedChatIdAtom, isStreamingByIdAtom } from "@/atoms/chatAtoms";
import { ChatPanel } from "@/components/ChatPanel";
import { ipc } from "@/ipc/types";
import { useStreamChat } from "@/hooks/useStreamChat";
import { ChevronRight, Loader2, MessagesSquare } from "@/components/ui/icons";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { ServerControlButton } from "@/components/ServerControlButton";
import { GitChangesButton } from "@/components/GitChangesButton";
import { LanguageBadge } from "@/components/LanguageBadge";
import { AgentBranchSelector } from "@/components/AgentBranchSelector";
import { useChats } from "@/hooks/useChats";
import { useSessionCost } from "@/hooks/useSessionCost";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { UnifiedSelector } from "@/components/ui/UnifiedSelector";

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

  // Streaming state for all chats
  const isStreamingById = useAtomValue(isStreamingByIdAtom);
  const isCurrentChatStreaming = chatId ? (isStreamingById.get(chatId) ?? false) : false;

  // Session cost
  const { totalCostUsd, hasPricing } = useSessionCost(chatId);

  // Restore last selection from DB when landing without params
  useEffect(() => {
    if (restoredRef.current) return;
    if (appId || chatId) return; // Already have params, no need to restore

    restoredRef.current = true;

    ipc.misc.getPreference({ key: "sidebar.lastSelection" }).then(async (raw) => {
      if (raw) {
        try {
          const sel = JSON.parse(raw) as { appId: number; chatId: number };
          if (sel.appId && sel.chatId) {
            // Validate the stored appId still exists before navigating.
            // A stale appId (from a deleted app) would trigger cascading
            // "App not found" errors from all polling hooks.
            try {
              await ipc.app.getApp(sel.appId);
            } catch {
              // App no longer exists — clear the stale preference
              ipc.misc.setPreference({ key: "sidebar.lastSelection", value: "" }).catch(() => {});
              return;
            }
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
        {/* Left: breadcrumb App / Chat dropdowns */}
        <div className="flex items-center gap-1.5 min-w-0">
          {/* App dropdown selector */}
          <UnifiedSelector
            value={String(appId)}
            onChange={(id) => navigate({ to: "/workspace", search: { appId: Number(id) } })}
            options={appsList.filter((a: any) => a.localPathExists !== false).map((app) => ({
              value: String(app.id),
              label: app.name,
              description: app.createdAt
                ? formatDistanceToNow(new Date(app.createdAt), { addSuffix: true, locale: es })
                : undefined,
            }))}
            triggerVariant="inline"
            triggerSize="sm"
            popoverWidth="w-[260px]"
            popoverMaxHeight="max-h-[340px]"
            showCheckmark
            itemLayout="default"
          />
          {selectedChat?.title && (
            <>
              <ChevronRight size={13} className="shrink-0 text-muted-foreground/50" />
              {/* Chat dropdown selector */}
              <UnifiedSelector
                value={String(chatId)}
                onChange={(cId) => navigate({ to: "/workspace", search: { appId: appId!, chatId: Number(cId) } })}
                options={chats.map((chat) => {
                  const chatStreaming = isStreamingById.get(chat.id) ?? false;
                  return {
                    value: String(chat.id),
                    label: chat.title || "Sin título",
                    description: chat.createdAt
                      ? formatDistanceToNow(new Date(chat.createdAt), { addSuffix: true, locale: es })
                      : undefined,
                    leftIcon: chatStreaming ? <Loader2 size={14} className="animate-spin text-primary" /> : undefined,
                  };
                })}
                triggerVariant="inline"
                triggerSize="sm"
                triggerClassName="text-[14px] !font-normal"
                disableBoldSelection
                popoverWidth="w-[280px]"
                popoverMaxHeight="max-h-[340px]"
                showCheckmark
                itemLayout="default"
                triggerLeftIcon={
                  isCurrentChatStreaming
                    ? <Loader2 size={12} className="animate-spin text-primary" />
                    : undefined
                }
              />
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
                      className="inline-flex items-center px-2 py-0.5 rounded-md typo-mono-xs
                        bg-muted
                        border border-border
                        select-none cursor-default transition-all duration-200"
                    >
                      <span className="tracking-tight">
                        {"$" + totalCostUsd.toFixed(2).replace(".", ",")}
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-center">
                    <div>Gasto en esta sesión</div>
                    <div className="font-semibold">{formatWorkspaceCost(totalCostUsd)}</div>
                  </TooltipContent>
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

