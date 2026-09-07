import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { WindowsControls } from "@/components/WindowsControls";
import { Terminal, FolderOpen, Copy, Check } from "@/components/ui/icons";
import { ipc } from "@/ipc/types";
import type { ContextDebugEntry } from "@/ipc/types";
import { useI18n } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

import "@/styles/globals.css";

/**
 * Context debug window (temporal) — JSON raw del contexto que el LLM recibe
 * en cada iteración, tal cual llega del core.
 *
 * - Acumula TODAS las iteraciones, SIN límite (temporal, para auditar).
 * - Sin truncar: el usuario quiere analizarlo entero.
 * - El system prompt NO se repite por iteración: vive en UNA fila propia
 *   encima de los mensajes (la del último recibido; el histórico completo
 *   sigue estando en el JSONL de disco).
 * - Cada fila = payload (messages que viajan al LLM) + respuesta (los
 *   mensajes que el modelo añadió, visibles en el contexto de la iteración
 *   siguiente del mismo sessionId).
 * - Zebra: una fila sí, una no, para distinguirlas de un vistazo.
 */

type EntryState = ContextDebugEntry & { receivedAt: number };

/** Botón de copiar (icono → check por 1.5s al copiar). */
function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const onClick = useCallback(async (e: React.MouseEvent) => {
    // El botón vive anidado en <summary>/<details> y en un div role=button.
    // El clic debe copiar pero NO togglear el colapso padre.
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard no disponible (raro en Electron) → no hacer nada.
    }
  }, [text]);
  return (
    <button
      onClick={onClick}
      className={`shrink-0 p-1.5 rounded hover:bg-muted-foreground/20 transition-colors ${copied ? "text-green-500" : "text-muted-foreground/50 hover:text-muted-foreground"} ${className ?? ""}`}
      title="Copiar"
    >
      {copied ? <Check size={15} /> : <Copy size={15} />}
    </button>
  );
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/**
 * Respuesta de la iteración i = los mensajes NUEVOS que aparecen en el
 * contexto de la iteración siguiente (mismo sessionId): lo que el modelo
 * dijo/hizo (assistant con texto o tool_calls) + los tool_results que el
 * runtime colgó después. Si no hay iteración siguiente (última del turno o
 * turno en curso), no hay respuesta aún → undefined.
 */
function computeAnswerDelta(
  entries: EntryState[],
  i: number,
): unknown[] | undefined {
  const cur = entries[i];
  const next = entries[i + 1];
  if (!cur || !next || next.sessionId !== cur.sessionId) return undefined;
  const curLen = cur.messages?.length ?? 0;
  const nextMsgs = next.messages;
  if (!nextMsgs || nextMsgs.length <= curLen) return undefined;
  return nextMsgs.slice(curLen);
}

/** Fila única del system prompt (la última recibida), colapsable. */
function SystemPromptRow({ prompt }: { prompt: string }) {
  const { t } = useI18n();
  return (
    <details className="border border-border rounded-md overflow-hidden bg-muted/30">
      <summary className="px-3 py-2 text-[12px] uppercase tracking-wide text-muted-foreground cursor-pointer hover:bg-muted/50 select-none flex items-center gap-2">
        <span className="flex-1">
          {t("contextDebug.systemPrompt")}{" "}
          <span className="normal-case font-mono">
            ({prompt.length.toLocaleString()} chars)
          </span>
        </span>
        <CopyButton text={prompt} />
      </summary>
      <pre className="px-3 py-2 text-[14px] leading-relaxed whitespace-pre-wrap break-words font-mono max-h-[300px] overflow-auto border-t border-border/50">
        {prompt}
      </pre>
    </details>
  );
}

function IterationBlock({
  entry,
  index,
  total,
  defaultOpen,
  zebra,
  answer,
}: {
  entry: EntryState;
  index: number;
  total: number;
  defaultOpen: boolean;
  zebra: boolean;
  answer?: unknown[];
}) {
  const [open, setOpen] = useState(defaultOpen);
  const { t } = useI18n();
  // Sin truncar. Solo el JSON de messages (el payload que viaja al LLM); el
  // system prompt NO se repite aquí (vive en su fila propia arriba).
  const json = useMemo(
    () =>
      entry.messages !== undefined
        ? JSON.stringify(entry.messages, null, 2)
        : "",
    [entry],
  );
  const answerJson = useMemo(
    () => (answer ? JSON.stringify(answer, null, 2) : ""),
    [answer],
  );

  const nMsgs = entry.messages?.length ?? 0;

  return (
    <div
      className={`border border-border rounded-md overflow-hidden ${zebra ? "bg-muted" : "bg-background"}`}
    >
      {/* Header row */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors cursor-pointer select-none"
      >
        <span className="text-[12px] text-muted-foreground tabular-nums shrink-0">
          #{index + 1}/{total}
        </span>
        <span className="text-[13px] font-medium shrink-0">
          {entry.iteration !== undefined
            ? `${t("contextDebug.iter")} ${entry.iteration}`
            : ""}
        </span>
        {entry.model && (
          <span className="text-[12px] font-mono text-muted-foreground truncate shrink-0 max-w-[140px]">
            {entry.model}
          </span>
        )}
        <span className="text-[12px] text-muted-foreground tabular-nums shrink-0">
          ~{formatTokens(entry.tokens)} {t("contextDebug.tokens")}
        </span>
        <span className="text-[12px] text-muted-foreground shrink-0">
          {nMsgs} {t("contextDebug.msgs")}
        </span>
        <span className="ml-auto flex items-center gap-1 shrink-0">
          {json && <CopyButton text={json} />}
          <span className="text-muted-foreground/50 text-[12px]">
            {open ? "▾" : "▸"}
          </span>
        </span>
      </div>

      {/* Body (collapsible) */}
      {open && (
        <div className="border-t border-border/60">
          {/* Payload — messages JSON sin truncar */}
          {entry.messages !== undefined && (
            <details className="group border-b border-border/50" open>
              <summary className="px-3 py-1.5 text-[12px] uppercase tracking-wide text-muted-foreground cursor-pointer hover:bg-muted/40 select-none flex items-center gap-2">
                <span className="flex-1">
                  {t("contextDebug.messages")}{" "}
                  <span className="normal-case font-mono">
                    ({nMsgs} msgs · {json.length.toLocaleString()} chars)
                  </span>
                </span>
                <CopyButton text={json} />
              </summary>
              <pre className="px-3 py-2 text-[14px] leading-relaxed whitespace-pre-wrap break-words font-mono max-h-[400px] overflow-auto">
                {json}
              </pre>
            </details>
          )}
          {/* Respuesta — lo que el modelo añadió (aparece en el contexto de la
              iteración siguiente). Sin siguiente iteración → aún no hay. */}
          {answerJson && (
            <details className="group" open>
              <summary className="px-3 py-1.5 text-[12px] uppercase tracking-wide text-muted-foreground cursor-pointer hover:bg-muted/40 select-none flex items-center gap-2">
                <span className="flex-1">
                  {t("contextDebug.answer")}{" "}
                  <span className="normal-case font-mono">
                    ({answer?.length} msgs)
                  </span>
                </span>
                <CopyButton text={answerJson} />
              </summary>
              <pre className="px-3 py-2 text-[14px] leading-relaxed whitespace-pre-wrap break-words font-mono max-h-[400px] overflow-auto border-t border-border/50">
                {answerJson}
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

  // System prompt de la fila única: el ÚLTIMO recibido (el de la iteración en
  // curso). El histórico completo de todos sigue en el JSONL de disco.
  const lastSystemPrompt = useMemo(() => {
    for (let i = entries.length - 1; i >= 0; i--) {
      if (entries[i].systemPrompt !== undefined) {
        return entries[i].systemPrompt;
      }
    }
    return undefined;
  }, [entries]);

  return (
    <div className="flex flex-col h-screen bg-(--background) text-(--foreground)">
      {/* Title bar (draggable) */}
      <div className="app-region-drag flex items-center justify-between px-3 h-9 bg-(--sidebar) border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Terminal
            size={18}
            className={isActive ? "text-green-500" : "text-primary"}
          />
          <span className="text-[14px] font-medium">{t("contextDebug.windowTitle")}</span>
          {isActive && (
            <span className="text-[12px] text-green-500 font-medium">
              ● {t("contextDebug.live")}
            </span>
          )}
          {n > 0 && (
            <span className="text-[12px] text-muted-foreground tabular-nums">
              {n} {t("contextDebug.entries")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 no-app-region-drag">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-[13px]"
            onClick={openFile}
          >
            <FolderOpen size={16} className="mr-1" />
            {t("contextDebug.openFile")}
          </Button>
          {n > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-[13px]"
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
        <span className="text-[12px] text-muted-foreground">
          {t("contextDebug.help")}
        </span>
        <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground cursor-pointer select-none">
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
            <Terminal size={24} />
            <p className="text-[13px] text-center">{t("contextDebug.empty")}</p>
          </div>
        )}
        {n > 0 && lastSystemPrompt !== undefined && (
          <SystemPromptRow prompt={lastSystemPrompt} />
        )}
        {entries.map((entry, i) => (
          <IterationBlock
            key={`${entry.chatId}-${entry.sessionId}-${entry.iteration}-${i}`}
            entry={entry}
            index={i}
            total={n}
            defaultOpen={i === n - 1}
            zebra={i % 2 === 1}
            answer={computeAnswerDelta(entries, i)}
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
