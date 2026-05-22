import React, { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useAtom } from "jotai";
import { messagePreviewAtom } from "@/atoms/chatAtoms";
import { ipc } from "@/ipc/types";
import type { Message } from "@/ipc/types";
import ChatMessage from "./ChatMessage";
import { X, Loader2 } from "@/components/ui/icons";

/**
 * MessagePreviewModal — renders the full chat stream with rich styling,
 * utilizing the actual ChatMessage component. Highlights and scrolls to the
 * clicked message.
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

  // Scroll to the target message once loaded
  useEffect(() => {
    if (!loading && targetMessageId && messages.length > 0) {
      // Small timeout to let rendering finish and positions settle
      const timer = setTimeout(() => {
        const el = document.getElementById(`msg-preview-${targetMessageId}`);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [loading, targetMessageId, messages]);

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
        <div className="flex-1 overflow-y-auto px-5 py-4 font-chat bg-background">
          {loading ? (
            <div className="flex items-center justify-center gap-2.5 py-12 text-muted-foreground/60">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-sm">Cargando conversación...</span>
            </div>
          ) : messages.length === 0 ? (
            <div className="text-muted-foreground text-sm text-center mt-10">
              Este chat no tiene mensajes.
            </div>
          ) : (
            <div className="max-w-4xl mx-auto py-4 space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  id={`msg-preview-${msg.id}`}
                  className={`transition-all duration-300 rounded-2xl p-1 ${
                    msg.id === targetMessageId
                      ? "ring-2 ring-primary/45 bg-primary/5 shadow-xs"
                      : ""
                  }`}
                >
                  <ChatMessage
                    message={msg}
                    isLastMessage={false}
                    forceFullMode={true}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}
