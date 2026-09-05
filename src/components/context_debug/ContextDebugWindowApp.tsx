import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { WindowsControls } from "@/components/WindowsControls";
import { Terminal, FolderOpen } from "@/components/ui/icons";
import { ipc } from "@/ipc/types";
import type { ContextDebugEntry } from "@/ipc/types";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

import "@/styles/globals.css";

/**
 * Context debug window (temporal) — JSON raw del contexto que el LLM recibe
 * en cada iteración (system prompt completo con tools + historial de messages
 * con tool_calls/tool_results embebidos), tal cual llega del core.
 *
 * - Acumula TODAS las iteraciones, SIN límite (temporal, para auditar).
 * - Sin truncar: el usuario quiere analizarlo entero.
 * - Cada iteración es un bloque colapsable. El último se auto-expande.
 * - La última entrada recibida se auto-marca como activa (icono en verde).
 */

type EntryState = ContextDebugEntry & { receivedAt: number };

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function IterationBlock({
  entry,
  index,
  total,
  defaultOpen,
}: {
  entry: EntryState;
  index: number;
  total: number;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const { t } = useI18n();
  const json = useMemo(() => {
    // Sin truncar. Solo el JSON de systemPrompt + messages (lo que queremos
    // auditar); los metadatos van en el header del bloque.
    const payload: Record<string, unknown> = {};
    if (entry.systemPrompt !== undefined) payload.systemPrompt = entry.systemPrompt;
    if (entry.messages !== undefined) payload.messages = entry.messages;
    return JSON.stringify(payload, null, 2);
  }, [entry]);

  const nMsgs = entry.messages?.length ?? 0;

  return (
    <div className="border border-border rounded-md overflow-hidden bg-(--background)">
      {/* Header row */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/50 transition-colors"
      >
        <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
          #{index + 1}/{total}
        </span>
        <span className="typo-caption font-medium shrink-0">
          {entry.iteration !== undefined
            ? `${t("contextDebug.iter")} ${entry.iteration}`
            : ""}
        </span>
        {entry.model && (
          <span className="text-[10px] font-mono text-muted-foreground truncate shrink-0 max-w-[140px]">
            {entry.model}
          </span>
        )}
        <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
          ~{formatTokens(entry.tokens)} {t("contextDebug.tokens")}
        </span>
        <span className="text-[10px] text-muted-foreground shrink-0">
          {nMsgs} {t("contextDebug.msgs")}
        </span>
        <span className="ml-auto text-muted-foreground/50 text-[10px] shrink-0">
          {open ? "▾" : "▸"}
        </span>
      </button>

      {/* Body (collapsible) */}
      {open && (
        <div className="border-t border-border/60">
          {/* System prompt — texto sin truncar */}
          {entry.systemPrompt !== undefined && (
            <details className="group border-b border-border/50" open>
              <summary className="px-3 py-1 text-[10px] uppercase tracking-wide text-muted-foreground cursor-pointer hover:bg-muted/40">
                {t("contextDebug.systemPrompt")}{" "}
                <span className="normal-case font-mono">
                  ({entry.systemPrompt.length} chars)
                </span>
              </summary>
              <pre className="px-3 py-2 text-[11px] leading-relaxed whitespace-pre-wrap break-words font-mono max-h-[300px] overflow-auto">
                {entry.systemPrompt}
              </pre>
            </details>
          )}
          {/* Messages — JSON sin truncar */}
          {entry.messages !== undefined && (
            <details className="group border-b border-border/50" open>
              <summary className="px-3 py-1 text-[10px] uppercase tracking-wide text-muted-foreground cursor-pointer hover:bg-muted/40">
                {t("contextDebug.messages")}{" "}
                <span className="normal-case font-mono">
                  ({nMsgs} msgs · {json.length.toLocaleString()} chars)
                </span>
              </summary>
              <pre className="px-3 py-2 text-[11px] leading-relaxed whitespace-pre-wrap break-words font-mono max-h-[400px] overflow-auto">
                {json}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function ContextDebugPanel() {
  const { t } = useI18n();
  const [entries, setEntries] = useState<EntryState[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Suscribirse a las entradas que manda el main (context:debug).
  useEffect(() => {
    const unsub = ipc.events.system.onContextDebugEntry((payload) => {
      setEntries((prev) => {
        // Acumular SIN límite. Misma iteración y mismo chat → reemplazar
        // (el loop re-emite el mismo context.built si hay replan), si no,
        // añadir.
        const last = prev[prev.length - 1];
        if (
          last &&
          last.chatId === payload.chatId &&
          last.iteration === payload.iteration
        ) {
          const next = [...prev];
          next[next.length - 1] = { ...payload, receivedAt: Date.now() };
          return next;
        }
        return [...prev, { ...payload, receivedAt: Date.now() }];
      });
    });
    return () => unsub();
  }, []);

  // Restaurar el histórico persistido en disco al abrir la ventana: munix
  // entra y se encuentra con las iteraciones previas (sobrevive a cierres y
  // reinicios). Una sola carga al montar.
  useEffect(() => {
    let alive = true;
    ipc.system.loadContextDebugEntries().then((loaded) => {
      if (!alive || !loaded || loaded.length === 0) return;
      setEntries(
        loaded.map((e) => ({ ...e, receivedAt: Date.now() })),
      );
    });
    return () => {
      alive = false;
    };
  }, []);

  // Auto-scroll al final cuando llega una nueva entrada (si está activado).
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries, autoScroll]);

  // Clear borra el buffer en memoria Y el log de disco (fuente de verdad).
  const clear = useCallback(async () => {
    setEntries([]);
    await ipc.system.clearContextDebugLog();
  }, []);

  // Abre el log de contexto en el editor/visor predeterminado del sistema para
  // el análisis largo (grep, buscar, leer entero sin la limitación de la UI).
  const openFile = useCallback(async () => {
    await ipc.system.openContextDebugLog();
  }, []);

  const n = entries.length;
  const lastEntry = entries[n - 1];
  const isActive = !!lastEntry;

  return (
    <div className="flex flex-col h-screen bg-(--background) text-(--foreground)">
      {/* Title bar (draggable) */}
      <div className="app-region-drag flex items-center justify-between px-3 h-9 bg-(--sidebar) border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Terminal
            size={14}
            className={isActive ? "text-green-500" : "text-primary"}
          />
          <span className="typo-button">{t("contextDebug.windowTitle")}</span>
          {isActive && (
            <span className="text-[10px] text-green-500 font-medium">
              ● {t("contextDebug.live")}
            </span>
          )}
          {n > 0 && (
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {n} {t("contextDebug.entries")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 no-app-region-drag">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={openFile}
          >
            <FolderOpen size={13} className="mr-1" />
            {t("contextDebug.openFile")}
          </Button>
          {n > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={clear}
            >
              {t("contextDebug.clear")}
            </Button>
          )}
          <WindowsControls
            className="no-app-region-drag pr-0 pointer-events-auto"
            buttonClassName="h-9"
          />
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1 border-b border-border/60 shrink-0">
        <span className="text-[10px] text-muted-foreground">
          {t("contextDebug.help")}
        </span>
        <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="accent-(--primary)"
          />
          {t("contextDebug.autoScroll")}
        </label>
      </div>

      {/* Entries (scroll) */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {n === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground/60 gap-1 p-8">
            <Terminal size={20} />
            <p className="text-xs text-center">{t("contextDebug.empty")}</p>
          </div>
        )}
        {entries.map((entry, i) => (
          <IterationBlock
            key={`${entry.chatId}-${entry.sessionId}-${entry.iteration}-${i}`}
            entry={entry}
            index={i}
            total={n}
            defaultOpen={i === n - 1}
          />
        ))}
      </div>
    </div>
  );
}

export function ContextDebugWindowApp() {
  return (
    <ThemeProvider>
      <TooltipProvider>
        <ContextDebugPanel />
      </TooltipProvider>
    </ThemeProvider>
  );
}
