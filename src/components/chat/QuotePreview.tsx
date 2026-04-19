import React, { useCallback } from "react";
import { useAtom } from "jotai";
import { quotedMessagesAtom } from "@/atoms/chatAtoms";
import { X, Bot, User } from "@/components/ui/icons";

/**
 * QuotePreview — tarjetas de cita apiladas que aparecen encima del ChatInput.
 * Soporta múltiples citas simultáneas; cada una es descartable individualmente.
 */
export const QuotePreview = React.memo(function QuotePreview() {
  const [quotedMessages, setQuotedMessages] = useAtom(quotedMessagesAtom);

  const handleDismiss = useCallback((id: number) => {
    setQuotedMessages((prev) => prev.filter((q) => q.id !== id));
  }, [setQuotedMessages]);

  if (quotedMessages.length === 0) return null;

  return (
    <div className="mx-3 mt-2.5 mb-2 flex flex-col gap-1.5">
      {quotedMessages.map((q) => {
        const isUser = q.role === "user";
        const excerpt =
          q.content.length > 160
            ? q.content.slice(0, 160) + "…"
            : q.content;

        return (
          <div
            key={q.id}
            className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/[0.06] px-3.5 py-2.5 text-xs animate-in fade-in slide-in-from-bottom-1 duration-150"
          >
            {/* Left accent bar */}
            <div className="mt-0.5 w-[3px] min-h-[32px] self-stretch rounded-full bg-primary/40 shrink-0" />

            {/* Icon */}
            <div className="mt-0.5 shrink-0 text-primary/60">
              {isUser ? <User size={12} /> : <Bot size={12} />}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 space-y-0.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary/50">
                {isUser ? "Mensaje del usuario" : "Respuesta de la IA"}
              </p>
              <p className="text-muted-foreground/80 leading-relaxed break-words line-clamp-3 whitespace-pre-line">
                {excerpt}
              </p>
            </div>

            {/* Dismiss */}
            <button
              type="button"
              onClick={() => handleDismiss(q.id)}
              className="mt-0.5 shrink-0 p-1 rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-accent cursor-pointer transition-colors"
              aria-label="Eliminar cita"
            >
              <X size={11} />
            </button>
          </div>
        );
      })}
    </div>
  );
});
