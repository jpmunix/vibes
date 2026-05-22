import React, { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useAtom } from "jotai";
import { messagePreviewAtom } from "@/atoms/chatAtoms";
import { ipc } from "@/ipc/types";
import { VibesMarkdownParser } from "./VibesMarkdownParser";
import { X, Loader2, ArrowLeft } from "@/components/ui/icons";

/**
 * MessagePreviewModal — renders a single message (or all messages from the same chat)
 * in a large in-app modal instead of opening a separate Electron window.
 *
 * Reads `messagePreviewAtom` to determine what to show. When null, nothing renders.
 */
export function MessagePreviewModal() {
  const [preview, setPreview] = useAtom(messagePreviewAtom);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<
    Array<{ id: number; role: string; content: string }>
  >([]);
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
        setMessages(
          (chat.messages || []).map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
          })),
        );
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
      requestAnimationFrame(() => {
        const el = document.getElementById(
          `msg-preview-${targetMessageId}`,
        );
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      });
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
        className="fixed inset-0 z-[998] bg-black/40 backdrop-blur-sm"
        onClick={handleClose}
      />
      <div
        className="fixed z-[999] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-[1200px] h-[85vh] bg-popover border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-sidebar-accent/30 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-sm font-semibold truncate">
                {chatTitle || "Vista previa"}
              </span>
              <span className="text-xs text-muted-foreground/60">
                Vista previa del chat completo
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
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2.5 py-12 text-muted-foreground/60">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-sm">Cargando chat...</span>
            </div>
          ) : messages.length === 0 ? (
            <div className="text-muted-foreground text-sm text-center mt-10">
              Este chat no tiene mensajes.
            </div>
          ) : (
            <div className="space-y-6 max-w-4xl mx-auto">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  id={`msg-preview-${msg.id}`}
                  className={`flex flex-col gap-1 transition-all duration-500 ${
                    msg.id === targetMessageId
                      ? "ring-2 ring-primary/30 rounded-xl"
                      : ""
                  }`}
                >
                  <span
                    className={`text-[11px] font-semibold uppercase tracking-wider ${
                      msg.role === "user"
                        ? "text-primary/70"
                        : "text-muted-foreground/50"
                    }`}
                  >
                    {msg.role === "user" ? "Tú" : "Asistente"}
                  </span>
                  <div
                    className={`rounded-xl px-4 py-3 text-sm ${
                      msg.role === "user"
                        ? "bg-primary/5 border border-primary/10"
                        : "bg-sidebar-accent/30 border border-border/30"
                    }`}
                  >
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <VibesMarkdownParser
                        content={msg.content}
                        forceFullMode
                      />
                    </div>
                  </div>
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
