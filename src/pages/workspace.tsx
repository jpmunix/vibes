import { useEffect, useRef } from "react";
import { useSearch, useNavigate } from "@tanstack/react-router";
import { useAtom, useSetAtom } from "jotai";
import { selectedAppIdAtom, appsListAtom } from "@/atoms/appAtoms";
import { selectedChatIdAtom } from "@/atoms/chatAtoms";
import { ChatPanel } from "@/components/ChatPanel";
import { ipc } from "@/ipc/types";
import { useStreamChat } from "@/hooks/useStreamChat";
import { MessagesSquare } from "lucide-react";
import { ServerControlButton } from "@/components/ServerControlButton";

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
        <div className="flex items-center gap-2">
          <MessagesSquare className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium truncate max-w-[300px]">
            {selectedApp?.name || "App"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Server control button */}
          <ServerControlButton appId={appId} />
        </div>
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

