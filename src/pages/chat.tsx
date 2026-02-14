import { useState, useRef, useEffect } from "react";
import {
  PanelGroup,
  Panel,
  PanelResizeHandle,
  type ImperativePanelHandle,
} from "react-resizable-panels";
import { ChatPanel } from "../components/ChatPanel";
import { PreviewPanel } from "../components/preview_panel/PreviewPanel";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { isPreviewOpenAtom, isPreviewExpandedAtom } from "@/atoms/viewAtoms";
import { useChats } from "@/hooks/useChats";
import { selectedAppIdAtom } from "@/atoms/appAtoms";

export default function ChatPage() {
  let { id: chatId, autoStart: autoStartFromUrl } = useSearch({
    from: "/chat",
  });
  const navigate = useNavigate();
  const [isPreviewOpen, setIsPreviewOpen] = useAtom(isPreviewOpenAtom);
  const isPreviewExpanded = useAtomValue(isPreviewExpandedAtom);
  const [isResizing, setIsResizing] = useState(false);
  const selectedAppId = useAtomValue(selectedAppIdAtom);
  const setSelectedAppId = useSetAtom(selectedAppIdAtom);
  const { chats, loading } = useChats(selectedAppId);

  // Store the chatId that should auto-start
  const [autoStartChatId, setAutoStartChatId] = useState<number | null>(null);

  // Capture autoStart from URL and then remove it
  useEffect(() => {
    if (autoStartFromUrl && chatId) {
      setAutoStartChatId(chatId);
      navigate({ to: "/chat", search: { id: chatId }, replace: true });
    }
  }, [autoStartFromUrl, chatId, navigate]);

  const autoStart = autoStartChatId === chatId;

  useEffect(() => {
    if (!chatId && chats.length && !loading) {
      setSelectedAppId(chats[0].appId);
      navigate({ to: "/chat", search: { id: chats[0].id }, replace: true });
    }
  }, [chatId, chats, loading, navigate, setSelectedAppId]);

  // Preview panel open/close (normal toggle)
  useEffect(() => {
    if (isPreviewOpen) {
      previewRef.current?.expand();
    } else {
      previewRef.current?.collapse();
    }
  }, [isPreviewOpen]);

  const previewRef = useRef<ImperativePanelHandle>(null);
  const chatRef = useRef<ImperativePanelHandle>(null);

  // Expanded mode: collapse/expand the chat panel using the imperative API
  useEffect(() => {
    if (isPreviewExpanded) {
      chatRef.current?.collapse();
    } else {
      chatRef.current?.expand();
    }
  }, [isPreviewExpanded]);

  return (
    <PanelGroup autoSaveId="persistence" direction="horizontal">
      <Panel
        collapsible
        collapsedSize={0}
        ref={chatRef}
        id="chat-panel"
        minSize={30}
      >
        <div className="h-full w-full">
          <ChatPanel
            chatId={chatId}
            autoStart={autoStart}
            isPreviewOpen={isPreviewOpen}
            onTogglePreview={() => {
              setIsPreviewOpen(!isPreviewOpen);
              if (isPreviewOpen) {
                previewRef.current?.collapse();
              } else {
                previewRef.current?.expand();
              }
            }}
          />
        </div>
      </Panel>

      <>
        <PanelResizeHandle
          onDragging={(e) => setIsResizing(e)}
          className={cn(
            "w-1 bg-gray-200 hover:bg-gray-300 dark:bg-gray-800 dark:hover:bg-gray-700 transition-colors cursor-col-resize",
            isPreviewExpanded && "invisible",
          )}
          disabled={isPreviewExpanded}
        />
        <Panel
          collapsible
          ref={previewRef}
          id="preview-panel"
          minSize={20}
          className={cn(
            !isResizing && "transition-all duration-100 ease-in-out",
          )}
        >
          <PreviewPanel />
        </Panel>
      </>
    </PanelGroup>
  );
}
