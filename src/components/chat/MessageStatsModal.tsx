import React, { useEffect, useMemo, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useAtom } from "jotai";
import { messagePreviewAtom } from "@/atoms/chatAtoms";
import { ipc } from "@/ipc/types";
import type { Message } from "@/ipc/types";
import { useI18n } from "@/lib/i18n";
import { X } from "@/components/ui/icons";
import {
  buildMessageStats,
  computeMessageCost,
} from "./messageStats";

/**
 * MessageStatsModal — estadísticas completas de un mensaje assistant al hacer
 * click en el nombre del modelo (#221).
 *
 * Reemplaza a MessagePreviewModal: en lugar de la conversación completa,
 * muestra datos por mensaje (hora de inicio, duración, modelo, tokens,
 * coste, status, commit, approval) + los totales de sesión (contexto del chat).
 */
export function MessageStatsModal() {
  const { t } = useI18n();
  const [preview, setPreview] = useAtom(messagePreviewAtom);
  const [loading, setLoading] = useState(false);
  const [chatTitle, setChatTitle] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);

  // Load chat when preview state changes
  useEffect(() => {
    if (!preview) {
      setMessages([]);
      setChatTitle("");
      return;
    }
    let cancelled = false;
    setLoading(true);
    ipc.chat
      .getChat(preview.chatId)
      .then((chat) => {
        if (cancelled) return;
        setChatTitle(chat.title || "Sin título");
        setMessages(chat.messages || []);
      })
      .catch((e) => {
        console.error("Error loading chat for message stats:", e);
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

  // Compute stats for the previewed message
  const targetMessage = useMemo(() => {
    if (!preview) return null;
    return (
      messages.find((m) => m.id === preview.messageId) ?? null
    );
  }, [preview, messages]);

  const stats = useMemo(() => {
    if (!targetMessage) return null;
    return buildMessageStats(targetMessage, messages);
  }, [targetMessage, messages]);

  const messageCost = useMemo(() => {
    if (!stats) return null;
    return computeMessageCost(stats.message);
  }, [stats]);

  if (!preview || !stats) return null;

  const formatDuration = (ms: number | null) => {
    if (ms === null) return "—";
    const s = ms / 1000;
    if (s < 60) return `${s.toFixed(1)}s`;
    const m = Math.floor(s / 60);
    const rs = Math.round(s % 60);
    return `${m}m ${rs}s`;
  };

  const formatStartTime = (ms: number | null) => {
    if (ms === null) return "—";
    return new Date(ms).toLocaleTimeString();
  };

  const formatTokens = (n: number) => n.toLocaleString();

  const formatCost = (c: number | null) => {
    if (c === null) return "—";
    return `$${c.toFixed(4)}`;
  };

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[998] bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={handleClose}
      />
      <div
        className="fixed z-[999] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-[560px] h-[85vh] max-h-[600px] bg-background border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-sidebar shrink-0">
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-sm font-semibold truncate">
              {t("messageStats.title")}
            </span>
            <span className="text-xs text-muted-foreground/60">
              {chatTitle || t("messageStats.subtitle")}
            </span>
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
        <div className="flex-1 min-h-0 overflow-y-auto">
          {loading ? (
            <div className="p-6 text-sm text-muted-foreground">
              {t("messageStats.loading")}
            </div>
          ) : (
            <div className="p-5 space-y-5">
              {/* ── Datos del mensaje ── */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                  {t("messageStats.messageSection")}
                </h3>
                <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-y-2.5 gap-x-4 text-sm">
                  {[
                    { label: t("messageStats.startedAt"), value: formatStartTime(stats.startedAtMs) },
                    { label: t("messageStats.duration"), value: formatDuration(stats.durationMs) },
                    { label: t("messageStats.model"), value: stats.model ?? "—" },
                    { label: t("messageStats.status"), value: stats.status ?? "—" },
                    { label: t("messageStats.cost"), value: formatCost(messageCost) },
                  ].map((row, i) => (
                    <React.Fragment key={i}>
                      <dt className="text-muted-foreground">{row.label}</dt>
                      <dd className="font-medium text-right">{row.value}</dd>
                    </React.Fragment>
                  ))}
                  {stats.commitHash && (
                    <>
                      <dt className="text-muted-foreground">{t("messageStats.commit")}</dt>
                      <dd className="font-medium text-right font-mono text-xs">{stats.commitHash}</dd>
                    </>
                  )}
                  {stats.approvalState && (
                    <>
                      <dt className="text-muted-foreground">{t("messageStats.approval")}</dt>
                      <dd className="font-medium text-right">{stats.approvalState}</dd>
                    </>
                  )}
                </dl>

                {/* Web searches */}
                {stats.message.webSearches > 0 && (
                  <div className="mt-3 text-xs text-muted-foreground">
                    {t("messageStats.webSearches")}: {stats.message.webSearches}
                  </div>
                )}
              </section>

              {/* ── Tokens del mensaje ── */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                  {t("messageStats.tokensSection")}
                </h3>
                <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-y-2.5 gap-x-4 text-sm">
                  {[
                    { label: t("messageStats.inputTokens"), value: formatTokens(stats.message.input) },
                    { label: t("messageStats.outputTokens"), value: formatTokens(stats.message.output) },
                    { label: t("messageStats.cachedTokens"), value: formatTokens(stats.message.cached) },
                    { label: t("messageStats.totalTokens"), value: formatTokens(stats.message.total) },
                  ].map((row, i) => (
                    <React.Fragment key={i}>
                      <dt className="text-muted-foreground">{row.label}</dt>
                      <dd className="font-medium text-right">{row.value}</dd>
                    </React.Fragment>
                  ))}
                </dl>
                {stats.message.estimated && (
                  <div className="mt-2 text-xs text-amber-600">{t("messageStats.estimated")}</div>
                )}
              </section>

              {/* ── Sesión (totales del chat) ── */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                  {t("messageStats.sessionSection")}
                </h3>
                <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-y-2.5 gap-x-4 text-sm">
                  {[
                    { label: t("messageStats.sessionInput"), value: formatTokens(stats.session.totalInput) },
                    { label: t("messageStats.sessionOutput"), value: formatTokens(stats.session.totalOutput) },
                    { label: t("messageStats.sessionCached"), value: formatTokens(stats.session.totalCached) },
                    { label: t("messageStats.sessionTotal"), value: formatTokens(stats.session.totalTokens) },
                    { label: t("messageStats.sessionCost"), value: formatCost(stats.sessionCostUsd ?? null) },
                  ].map((row, i) => (
                    <React.Fragment key={i}>
                      <dt className="text-muted-foreground">{row.label}</dt>
                      <dd className="font-medium text-right">{row.value}</dd>
                    </React.Fragment>
                  ))}
                </dl>
              </section>
            </div>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}
