import React, { useRef, useEffect } from "react";
import type { Message } from "@/ipc/types";
import ChatMessage from "./ChatMessage";
import { Loader2 } from "@/components/ui/icons";

interface ChatPreviewThreadProps {
  messages: Message[];
  loading: boolean;
  targetMessageId?: number | null;
  emptyText?: string;
}

export function ChatPreviewThread({
  messages,
  loading,
  targetMessageId,
  emptyText = "Este chat no tiene mensajes.",
}: ChatPreviewThreadProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Always reset scroll to the top when loading completes or message set changes
  useEffect(() => {
    if (!loading && containerRef.current) {
      containerRef.current.scrollTop = 0;
    }
  }, [loading, messages]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-2.5 py-12 text-muted-foreground/60 h-full bg-background">
        <Loader2 size={16} className="animate-spin" />
        <span className="text-sm font-medium">Cargando conversación...</span>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="text-muted-foreground text-sm text-center py-12 bg-background h-full flex items-center justify-center">
        {emptyText}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto px-5 py-4 font-chat bg-background h-full"
    >
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
    </div>
  );
}
