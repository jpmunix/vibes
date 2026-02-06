import React from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCountTokens } from "@/hooks/useCountTokens";
import {
  MessageSquare,
  Code,
  Bot,
  AlignLeft,
  ExternalLink,
} from "lucide-react";
import { chatInputValueAtom } from "@/atoms/chatAtoms";
import { useAtom } from "jotai";
import { Button } from "../ui/button";
import { useEffect, useState } from "react";
import { tokenStatsClient } from "@/ipc/types";
import type { TokenStatEntry } from "@/ipc/types/token_stats";

interface TokenBarProps {
  chatId?: number;
}

export function TokenBar({ chatId }: TokenBarProps) {
  const [inputValue] = useAtom(chatInputValueAtom);
  const { result, error } = useCountTokens(chatId ?? null, inputValue);
  const [showLog, setShowLog] = React.useState(false);
   const [lastStat, setLastStat] = useState<TokenStatEntry | null>(null);

   useEffect(() => {
     if (!showLog || !chatId) return;
     (async () => {
       try {
         const entries = await tokenStatsClient.getTokenStats();
         const latest = entries.find((e) => e.chatId === chatId) ?? null;
         setLastStat(latest);
       } catch {
         // ignore
       }
     })();
   }, [showLog, chatId]);

  if (!chatId || !result) {
    return null;
  }

  const {
    estimatedTotalTokens: totalTokens,
    messageHistoryTokens,
    codebaseTokens,
    mentionedAppsTokens,
    systemPromptTokens,
    inputTokens,
    contextWindow,
  } = result;

  const percentUsed = Math.min((totalTokens / contextWindow) * 100, 100);

  // Calculate widths for each token type
  const messageHistoryPercent = (messageHistoryTokens / contextWindow) * 100;
  const codebasePercent = (codebaseTokens / contextWindow) * 100;
  const mentionedAppsPercent = (mentionedAppsTokens / contextWindow) * 100;
  const systemPromptPercent = (systemPromptTokens / contextWindow) * 100;
  const inputPercent = (inputTokens / contextWindow) * 100;

  return (
    <div className="px-4 pb-2 text-xs space-y-2" data-testid="token-bar">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="w-full">
              <div className="flex justify-between mb-1 text-xs text-muted-foreground">
                <span>Tokens: {totalTokens.toLocaleString()}</span>
                <span>
                  {Math.round(percentUsed)}% of{" "}
                  {(contextWindow / 1000).toFixed(0)}K
                </span>
              </div>
              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden flex">
                {/* Message history tokens */}
                <div
                  className="h-full bg-blue-400"
                  style={{ width: `${messageHistoryPercent}%` }}
                />
                {/* Codebase tokens */}
                <div
                  className="h-full bg-green-400"
                  style={{ width: `${codebasePercent}%` }}
                />
                {/* Mentioned apps tokens */}
                <div
                  className="h-full bg-orange-400"
                  style={{ width: `${mentionedAppsPercent}%` }}
                />
                {/* System prompt tokens */}
                <div
                  className="h-full bg-purple-400"
                  style={{ width: `${systemPromptPercent}%` }}
                />
                {/* Input tokens */}
                <div
                  className="h-full bg-yellow-400"
                  style={{ width: `${inputPercent}%` }}
                />
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="w-64 p-2">
            <div className="space-y-1">
              <div className="font-medium">Token Usage Breakdown</div>
              <div className="grid grid-cols-[20px_1fr_auto] gap-x-2 items-center">
                <MessageSquare size={12} className="text-blue-500" />
                <span>Message History</span>
                <span>{messageHistoryTokens.toLocaleString()}</span>

                <Code size={12} className="text-green-500" />
                <span>Codebase</span>
                <span>{codebaseTokens.toLocaleString()}</span>

                <ExternalLink size={12} className="text-orange-500" />
                <span>Mentioned Apps</span>
                <span>{mentionedAppsTokens.toLocaleString()}</span>

                <Bot size={12} className="text-purple-500" />
                <span>System Prompt</span>
                <span>{systemPromptTokens.toLocaleString()}</span>

                <AlignLeft size={12} className="text-yellow-500" />
                <span>Current Input</span>
                <span>{inputTokens.toLocaleString()}</span>
              </div>
              <div className="pt-1 border-t border-border">
                <div className="flex justify-between font-medium">
                  <span>Total</span>
                  <span>{totalTokens.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {error && (
        <div className="text-red-500 text-xs mt-1">Failed to count tokens</div>
      )}
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="xs"
          className="h-7 px-2 text-[11px]"
          onClick={() => setShowLog((v) => !v)}
        >
          {showLog ? "Ocultar log" : "Ver log"}
        </Button>
        {result.actualMaxTokens && (
          <span className="text-[11px] text-muted-foreground">
            Máx. usados: {result.actualMaxTokens.toLocaleString()}
          </span>
        )}
      </div>
      {showLog && (
        <div className="rounded border p-2 bg-muted/40 space-y-1 text-[11px]">
          <div className="font-semibold text-xs">Log de tokens</div>
          <div>Historial: {messageHistoryTokens.toLocaleString()}</div>
          <div>Código base: {codebaseTokens.toLocaleString()}</div>
          <div>Apps mencionadas: {mentionedAppsTokens.toLocaleString()}</div>
          <div>System: {systemPromptTokens.toLocaleString()}</div>
          <div>Input actual: {inputTokens.toLocaleString()}</div>
          {result.actualMaxTokens && (
            <div className="pt-1 border-t">
              Real (modelo): {result.actualMaxTokens.toLocaleString()}
            </div>
          )}
          {lastStat && (
            <div className="pt-1 border-t space-y-1">
              <div className="font-semibold text-[11px]">Pasos recientes</div>
              <ul className="list-disc ml-4 space-y-0.5">
                <li>{`Modelo: ${lastStat.model ?? "desconocido"}`}</li>
                {lastStat.filesSent?.length ? (
                  <li>
                    {`Archivos enviados (${lastStat.filesSent.length}): ${lastStat.filesSent.slice(0, 5).join(", ")}${lastStat.filesSent.length > 5 ? "…" : ""}`}
                  </li>
                ) : (
                  <li>Archivos: usando contexto por defecto</li>
                )}
                {lastStat.toolsUsed?.length ? (
                  <li>{`Herramientas: ${lastStat.toolsUsed.join(", ")}`}</li>
                ) : (
                  <li>Herramientas: ninguna</li>
                )}
                <li>Solicitud enviada y respuesta recibida</li>
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
