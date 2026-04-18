import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearch, useNavigate } from "@tanstack/react-router";
import { useAtom, useSetAtom, useAtomValue } from "jotai";
import { selectedAppIdAtom, appsListAtom } from "@/atoms/appAtoms";
import { selectedChatIdAtom, isStreamingByIdAtom } from "@/atoms/chatAtoms";
import { ChatPanel } from "@/components/ChatPanel";
import { ipc } from "@/ipc/types";
import { useStreamChat } from "@/hooks/useStreamChat";
import { ChevronRight, ChevronDown, MessagesSquare, Loader2 } from "lucide-react";
import { ServerControlButton } from "@/components/ServerControlButton";
import { GitChangesButton } from "@/components/GitChangesButton";
import { LanguageBadge } from "@/components/LanguageBadge";
import { AgentBranchSelector } from "@/components/AgentBranchSelector";
import { useChats } from "@/hooks/useChats";
import { useSessionCost } from "@/hooks/useSessionCost";
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
        {/* Left: breadcrumb App / Chat dropdowns */}
        <div className="flex items-center gap-1.5 min-w-0">
          {/* App dropdown selector */}
          <AppBreadcrumbDropdown
            apps={appsList}
            selectedAppId={appId}
            onSelect={(id) => {
              navigate({ to: "/workspace", search: { appId: id } });
            }}
            label={selectedApp?.name || "App"}
          />
          {selectedChat?.title && (
            <>
              <ChevronRight size={13} className="shrink-0 text-muted-foreground/50" />
              {/* Chat dropdown selector */}
              <ChatBreadcrumbDropdown
                chats={chats}
                selectedChatId={chatId}
                appId={appId}
                onSelect={(cId) => {
                  navigate({ to: "/workspace", search: { appId: appId!, chatId: cId } });
                }}
                label={selectedChat.title}
                isStreaming={isCurrentChatStreaming}
                isStreamingById={isStreamingById}
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
                      className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium
                        bg-muted text-muted-foreground
                        border border-border
                        select-none cursor-default transition-all duration-200"
                    >
                      <span className="tabular-nums tracking-tight">
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

/* ── Breadcrumb dropdown styles (shared) ── */
const breadcrumbDropdownStyles = `
  .bc-trigger {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    cursor: pointer;
    background: none;
    border: none;
    padding: 2px 6px;
    border-radius: 6px;
    transition: background 0.12s ease;
    max-width: 220px;
  }
  .bc-trigger:hover {
    background: var(--sidebar-accent);
  }
  .bc-trigger-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bc-dropdown {
    position: fixed;
    min-width: 220px;
    max-width: 320px;
    max-height: 340px;
    overflow-y: auto;
    background: var(--popover);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 8px 24px -4px rgba(0,0,0,0.18), 0 2px 8px -2px rgba(0,0,0,0.1);
    padding: 4px;
    z-index: 200;
    animation: bc-dropdown-in 0.12s ease-out;
  }
  @keyframes bc-dropdown-in {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .bc-dropdown-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 7px 10px;
    border-radius: 7px;
    border: none;
    background: transparent;
    color: var(--popover-foreground);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.12s ease;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bc-dropdown-item:hover {
    background: var(--sidebar-accent);
  }
  .bc-dropdown-item--active {
    color: var(--primary);
    font-weight: 600;
  }
`;

/** Breadcrumb dropdown for selecting apps */
function AppBreadcrumbDropdown({
  apps,
  selectedAppId,
  onSelect,
  label,
}: {
  apps: { id: number; name: string }[];
  selectedAppId: number | null;
  onSelect: (id: number) => void;
  label: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const openDropdown = () => {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, left: rect.left });
    setIsOpen(true);
  };

  return (
    <>
      <style>{breadcrumbDropdownStyles}</style>
      <button
        ref={btnRef}
        type="button"
        className="bc-trigger"
        onClick={() => (isOpen ? setIsOpen(false) : openDropdown())}
      >
        <span className="bc-trigger-label text-sm font-semibold text-foreground">{label}</span>
        <ChevronDown size={12} className="shrink-0 text-muted-foreground/50" />
      </button>

      {isOpen && pos && createPortal(
        <>
          <div className="fixed inset-0 z-[199]" onClick={() => setIsOpen(false)} />
          <div className="bc-dropdown" style={{ top: pos.top, left: pos.left }}>
            {apps.filter(a => (a as any).localPathExists !== false).map((app) => (
              <button
                key={app.id}
                type="button"
                className={`bc-dropdown-item ${app.id === selectedAppId ? "bc-dropdown-item--active" : ""}`}
                onClick={() => {
                  onSelect(app.id);
                  setIsOpen(false);
                }}
              >
                {app.name}
              </button>
            ))}
          </div>
        </>,
        document.body,
      )}
    </>
  );
}

/** Breadcrumb dropdown for selecting chats within an app */
function ChatBreadcrumbDropdown({
  chats,
  selectedChatId,
  appId,
  onSelect,
  label,
  isStreaming,
  isStreamingById,
}: {
  chats: { id: number; title: string | null }[];
  selectedChatId: number | null;
  appId: number | null;
  onSelect: (chatId: number) => void;
  label: string;
  isStreaming?: boolean;
  isStreamingById?: Map<number, boolean>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const openDropdown = () => {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, left: rect.left });
    setIsOpen(true);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="bc-trigger"
        onClick={() => (isOpen ? setIsOpen(false) : openDropdown())}
      >
        {isStreaming && (
          <Loader2 size={12} className="animate-spin text-primary shrink-0" />
        )}
        <span className="bc-trigger-label text-sm text-muted-foreground">{label}</span>
        <ChevronDown size={12} className="shrink-0 text-muted-foreground/50" />
      </button>

      {isOpen && pos && createPortal(
        <>
          <div className="fixed inset-0 z-[199]" onClick={() => setIsOpen(false)} />
          <div className="bc-dropdown" style={{ top: pos.top, left: pos.left }}>
            {chats.map((chat) => {
              const chatStreaming = isStreamingById?.get(chat.id) ?? false;
              return (
                <button
                  key={chat.id}
                  type="button"
                  className={`bc-dropdown-item ${chat.id === selectedChatId ? "bc-dropdown-item--active" : ""}`}
                  onClick={() => {
                    onSelect(chat.id);
                    setIsOpen(false);
                  }}
                >
                  {chatStreaming && (
                    <Loader2 size={12} className="animate-spin text-primary shrink-0" />
                  )}
                  {chat.title || "Sin título"}
                </button>
              );
            })}
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
