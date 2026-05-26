import React, { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useAtom } from "jotai";
import { messagePreviewAtom } from "@/atoms/chatAtoms";
import { ipc } from "@/ipc/types";
import type { Message } from "@/ipc/types";
import { ChatPreviewThread } from "./ChatPreviewThread";
import { X } from "@/components/ui/icons";

/**
 * MessagePreviewModal — renders the full chat stream with rich styling,
 * utilizing the shared ChatPreviewThread component.
 */
export function MessagePreviewModal() {
  const [preview, setPreview] = useAtom(messagePreviewAtom);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatTitle, setChatTitle] = useState<string>("");
  const [targetMessageId, setTargetMessageId] = useState<number | null>(null);

  // Load chat when preview state changes
  useEffect(() => {
    if (!preview) {
      setMessages([]);
      setChatTitle("");
      setTargetMessageId(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setTargetMessageId(preview.messageId);

    ipc.chat
      .getChat(preview.chatId)
      .then((chat) => {
        if (cancelled) return;
        setChatTitle(chat.title || "Sin título");
        setMessages(chat.messages || []);
      })
      .catch((e) => {
        console.error("Error loading chat for message preview:", e);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [preview]);

  const handleClose = useCallback(() => {
    setPreview(null);
  }, [setPreview]);

  // Close on Escape
  useEffect(() => {
    if (!preview) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [preview, handleClose]);

  if (!preview) return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[998] bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={handleClose}
      />
      <div
        className="fixed z-[999] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-[1200px] h-[85vh] bg-background border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-sidebar shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-sm font-semibold truncate">
                {chatTitle || "Vista previa"}
              </span>
              <span className="text-xs text-muted-foreground/60">
                Detalle del mensaje en el flujo de conversación
              </span>
            </div>
          </div>
          <button
            type="button"
            className="p-1.5 rounded-lg hover:bg-sidebar-accent text-muted-foreground/70 hover:text-foreground transition-colors cursor-pointer"
            onClick={handleClose}
          >
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0">
          <ChatPreviewThread
            messages={messages}
            loading={loading}
            targetMessageId={targetMessageId}
            emptyText="Este chat no tiene mensajes."
          />
        </div>
      </div>
    </>,
    document.body,
  );
}
