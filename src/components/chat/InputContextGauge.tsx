import { useMemo } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Minimize2 } from "@/components/ui/icons";
import { useI18n } from "@/lib/i18n";
import {
  useSessionTokens,
  computeGauge,
  computeDonutDashOffset,
  DONUT_CIRCUMFERENCE,
  DONUT_RADIUS,
  formatTokenCount,
  type GaugeLevel,
} from "@/hooks/useSessionTokens";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { chatMessagesByIdAtom } from "@/atoms/chatAtoms";
import { useChats } from "@/hooks/useChats";
import { useCountTokens } from "@/hooks/useCountTokens";
import { useAtomValue, useSetAtom } from "jotai";
import { useNavigate } from "@tanstack/react-router";
import { ipc } from "@/ipc/types";

/**
 * Gauge de contexto compacto para DENTRO de la caja del input (#207).
 *
 * Vive al lado del selector de pensamiento (InferenceTunerPicker) en
 * ChatInputControls → se ve en TODOS los sitios que usan la caja chateable
 * (workspace, chat panel, etc.). Mucho más discreto que el ContextGauge de
 * ChatPanel: rueda de 14px + tooltip; botón de resumir solo al compactar.
 */
const LEVEL_COLOR: Record<GaugeLevel, string> = {
  ok: "stroke-emerald-500",
  warn: "stroke-amber-500",
  critical: "stroke-red-500",
};

export function InputContextGauge({ chatId }: { chatId?: number }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const appId = useAtomValue(selectedAppIdAtom);
  const { invalidateChats } = useChats(appId);
  const setMessagesById = useSetAtom(chatMessagesByIdAtom);
  const { result: tokenCountResult } = useCountTokens(
    chatId ? chatId : null,
    "",
  );
  // #223: contextWindow real del modelo activo (null = desconocido — el
  // catálogo models.dev no lo resolvió). NUNCA un default falso.
  const contextWindow: number | null = tokenCountResult?.contextWindow ?? null;
  const { totalTokens, totalInput, totalOutput, totalCached, estimated } =
    useSessionTokens(chatId);

  const gauge = useMemo(
    () => computeGauge({ totalTokens, contextWindow: contextWindow ?? 0 }),
    [totalTokens, contextWindow],
  );
  const dashOffset = useMemo(
    () => computeDonutDashOffset(gauge.pctUsed),
    [gauge.pctUsed],
  );

  // Sin tokens (ni reales ni estimados) no hay nada que mostrar.
  if (totalTokens <= 0) return null;

  const color = LEVEL_COLOR[gauge.level];

  const handleCompact = async () => {
    if (!appId || !chatId) return;
    const { toast } = await import("@/lib/toast");
    const tid = toast.loading(t("workspace.summarizing"));
    try {
      const newChatId = await ipc.chat.summarizeToNewChat({ appId, chatId });
      await invalidateChats();
      setMessagesById((prev) => {
        const next = new Map(prev);
        next.set(chatId, []);
        return next;
      });
      navigate({ to: "/chat", search: { id: newChatId } });
      toast.success(t("workspace.summarizeSuccess"), { id: tid });
    } catch (err) {
      const { toast: t2 } = await import("@/lib/toast");
      t2.error(`Error: ${(err as Error).toString()}`, { id: tid });
    }
  };

  return (
    <div className="inline-flex items-center gap-1" data-testid="context-gauge">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5
              bg-muted/50 hover:bg-accent transition-colors cursor-pointer
              border border-border/40"
            aria-label={t("chat.contextGaugeLabel")}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 32 32"
              className="shrink-0 -rotate-90"
              aria-hidden="true"
            >
              <circle
                cx="16"
                cy="16"
                r={DONUT_RADIUS}
                fill="none"
                strokeWidth="3"
                className="stroke-muted-foreground/25"
              />
              <circle
                cx="16"
                cy="16"
                r={DONUT_RADIUS}
                fill="none"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={DONUT_CIRCUMFERENCE}
                strokeDashoffset={dashOffset}
                className={`${color} transition-[stroke-dashoffset] duration-300`}
              />
            </svg>
            <span
              className={`text-[11px] tabular-nums font-medium ${
                gauge.level === "critical"
                  ? "text-red-500"
                  : gauge.level === "warn"
                    ? "text-amber-500"
                    : "text-muted-foreground"
              }`}
            >
              {contextWindow === null ? "?" : `${gauge.pctUsed}%`}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="w-56 p-3">
          <div className="flex flex-col gap-1.5 text-xs">
            <div className="font-medium mb-0.5">{t("chat.contextGaugeTitle")}</div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">{t("chat.contextUsed")}</span>
              <span className="font-medium tabular-nums">
                {estimated ? "~" : ""}
                {formatTokenCount(totalTokens)}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">{t("chat.contextLimit")}</span>
              <span className="font-medium tabular-nums">
                {contextWindow === null
                  ? t("chat.contextLimitUnknown")
                  : formatTokenCount(contextWindow)}
              </span>
            </div>
            {contextWindow !== null && (
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">{t("chat.contextRemaining")}</span>
                <span className="font-medium tabular-nums">
                  {estimated ? "~" : ""}
                  {formatTokenCount(Math.max(0, contextWindow - totalTokens))}
                </span>
              </div>
            )}
            {!estimated && (
              <>
                <div className="h-px bg-border/60 my-0.5" />
                <div className="flex justify-between gap-3 text-muted-foreground">
                  <span>{t("chat.contextInput")}</span>
                  <span className="tabular-nums">{formatTokenCount(totalInput)}</span>
                </div>
                <div className="flex justify-between gap-3 text-muted-foreground">
                  <span>{t("chat.contextOutput")}</span>
                  <span className="tabular-nums">{formatTokenCount(totalOutput)}</span>
                </div>
                {totalCached > 0 && (
                  <div className="flex justify-between gap-3 text-muted-foreground">
                    <span>{t("chat.contextCached")}</span>
                    <span className="tabular-nums">{formatTokenCount(totalCached)}</span>
                  </div>
                )}
              </>
            )}
          </div>
        </TooltipContent>
      </Tooltip>

      {gauge.showCompact && chatId && appId && (
        <Button
          variant="outline"
          size="sm"
          className="h-6 px-2 text-[11px] gap-1 border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
          onClick={handleCompact}
        >
          <Minimize2 size={11} />
          {t("chatActions.summarizeToNewChat")}
        </Button>
      )}
    </div>
  );
}
