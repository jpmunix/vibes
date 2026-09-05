import React, {
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronDown, ChevronUp } from "@/components/ui/icons";
import {
  resolveToolMeta,
  getToolDetail,
  type ToolBadgeState,
} from "./CompactToolBadge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/lib/i18n";

export interface FlowActivityToolItem {
  kind: "tool";
  tag: string;
  attributes: Record<string, string>;
  state: ToolBadgeState;
  originalContent: React.ReactNode;
}

export interface FlowActivityThoughtItem {
  kind: "thought";
  /** Markdown del pensamiento (uno o varios bloques <vibes-think> fusionados). */
  content: string;
  markdownComponents: Record<string, React.ComponentType<any>>;
  /** Atributos del primer bloque <vibes-think> del grupo (duration-ms). */
  attributes: Record<string, string>;
}

export type FlowActivityItem = FlowActivityToolItem | FlowActivityThoughtItem;

/** Compact a number of milliseconds into a human-friendly "26s"/"1m 12s" form. */
export function formatActivityDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

/**
 * Parsea el atributo duration-ms (string del worker) → ms, o undefined si el
 * tag no lo trae (mensajes históricos grabados antes del atributo).
 */
export function parseDurationMs(
  attributes: Record<string, string> | undefined,
): number | undefined {
  const raw = attributes?.["duration-ms"];
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

interface FlowActivityStreamProps {
  items: FlowActivityItem[];
  /** True while the agent is still streaming — keeps the panel expanded. */
  isStreaming: boolean;
}

/**
 * Flow-mode activity panel (unified: thoughts + tool calls).
 *
 * The summary duration is the SUM of the real `duration-ms` attributes carried
 * by the items — never `Date.now()` math, so toggling expand/collapse can never
 * change the number. Items without the attribute (historical messages) make the
 * total incomplete: the summary then falls back to the localized vague
 * wording ("trabajó por unos segundos") instead of inventing a number.
 */
export const FlowActivityStream: React.FC<FlowActivityStreamProps> = React.memo(
  ({ items, isStreaming }) => {
    const { t } = useI18n();
    const panelRef = useRef<HTMLDivElement>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const [autoScroll, setAutoScroll] = useState(true);
    const [expandedByUser, setExpandedByUser] = useState<boolean | null>(null);
    // Capturamos la transición true→false: si en ese momento el usuario aún
    // no había tocado el botón (expandedByUser === null), colapsamos el
    // módulo al cerrarse el stream. Sin esto, el módulo se queda expandido
    // "porque sí" cuando termina el turno (munix: "no se colapsa").
    const [collapsedByStream, setCollapsedByStream] = useState(false);
    const previousStreamingRef = useRef(isStreaming);
    useLayoutEffect(() => {
      if (previousStreamingRef.current && !isStreaming) {
        setCollapsedByStream(true);
      }
      previousStreamingRef.current = isStreaming;
    }, [isStreaming]);

    // When the user expands a collapsed panel, the module grows ~200px and
    // the chat scroll position (typically pinned to the bottom) can leave the
    // summary button hidden behind the next bubble. Bring the module itself
    // into view with `block: "nearest"` — doesn't yank the chat if it's
    // already visible, only nudges when it's actually off-screen.
    const [justExpanded, setJustExpanded] = useState(false);
    useLayoutEffect(() => {
      if (!justExpanded) return;
      const btn = rootRef.current;
      if (!btn) return;
      const scroller = btn.closest(
        '[data-testid="messages-list"]',
      ) as HTMLElement | null;
      if (!scroller) return;

      // getBoundingClientRect measures the ACTUAL rendered position in screen
      // coords, which is immune to both the sticky user bubble and the
      // flex-col-reverse inversion. We only nudge the list when the summary
      // button is genuinely outside the scroller viewport — in content that
      // doesn't overflow (a short chat) this is a no-op, so no weird jump.
      const sRect = scroller.getBoundingClientRect();
      const bRect = btn.getBoundingClientRect();
      const margin = 8;
      let delta = 0;
      if (bRect.top < sRect.top) {
        // Button is above the visible area (towards older content): scroll up.
        delta = bRect.top - sRect.top - margin;
      } else if (bRect.bottom > sRect.bottom) {
        // Button is below (towards newer content): scroll to bottom.
        delta = bRect.bottom - sRect.bottom + margin;
      }
      if (delta !== 0) {
        scroller.scrollTo({
          top: scroller.scrollTop + delta,
          behavior: "smooth",
        });
      }
      setJustExpanded(false);
    }, [justExpanded]);

    // Auto-scroll the panel to the bottom while items stream in.
    useLayoutEffect(() => {
      if (!autoScroll || !panelRef.current) return;
      panelRef.current.scrollTop = panelRef.current.scrollHeight;
    }, [items, autoScroll]);

    if (items.length === 0) return null;

    // Sum of the real durations. Items without duration-ms → contribute 0
    // but flag that the total is incomplete.
    let totalMs = 0;
    let hasAnyDuration = false;
    for (const item of items) {
      const d = parseDurationMs(item.attributes);
      if (d !== undefined) {
        totalMs += d;
        hasAnyDuration = true;
      }
    }

    const collapsed =
      collapsedByStream ||
      (expandedByUser === null ? !isStreaming : !expandedByUser);

    // Summary label: duration only — no tool counts, no "pensamiento" suffix
    // (munix: los literales sobran tanto con tiempo real como sin él).
    const summary = hasAnyDuration
      ? t("chat.activityStreamWorked", {
          duration: formatActivityDuration(totalMs),
        })
      : t("chat.activityStreamWorkedVague");

    return (
      <div ref={rootRef} className="my-2">
        <button
          type="button"
          onClick={() => {
            // First time the user touches it: pin the explicit choice so the
            // stream transition doesn't override them.
            if (expandedByUser === null) {
              setExpandedByUser(true);
              setCollapsedByStream(false);
              return;
            }
            const willExpand = collapsed;
            setExpandedByUser(collapsed);
            setAutoScroll(true);
            if (willExpand) setJustExpanded(true);
          }}
          className="flex items-center gap-1.5 text-sm text-muted-foreground/70 hover:text-foreground transition-colors select-none cursor-pointer"
          title={
            collapsed
              ? t("chat.activityStreamExpand")
              : t("chat.activityStreamCollapse")
          }
          data-testid="flow-activity-summary"
        >
          <span>{summary}</span>
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>

        {!collapsed && (
          <div
            ref={panelRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 12;
              setAutoScroll(atBottom);
            }}
            className="mt-1.5 max-h-60 overflow-y-auto rounded-md border border-border/40 bg-muted/20 pl-2 pr-1 py-1"
            data-testid="flow-activity-stream"
          >
            {items.map((item, idx) =>
              item.kind === "thought" ? (
                <FlowThoughtRow key={`thought-${idx}`} item={item} />
              ) : (
                <FlowActivityRow key={`tool-${item.tag}-${idx}`} item={item} />
              ),
            )}
          </div>
        )}
      </div>
    );
  },
);

const REMARK_PLUGINS = [remarkGfm];

/** Fila de pensamiento dentro del panel de actividad. */
const FlowThoughtRow: React.FC<{ item: FlowActivityThoughtItem }> = React.memo(
  ({ item }) => {
    return (
      <div
        className="my-1 border-l-[3px] border-[var(--accent-think-border)] px-3 py-1.5 text-xs leading-relaxed prose prose-xs dark:prose-invert max-w-none [&_*]:!text-[var(--accent-think-text)]"
        style={{ color: "var(--accent-think-text)" }}
      >
        <ReactMarkdown
          remarkPlugins={REMARK_PLUGINS}
          components={item.markdownComponents}
        >
          {item.content}
        </ReactMarkdown>
      </div>
    );
  },
);

const FlowActivityRow: React.FC<{ item: FlowActivityToolItem }> = React.memo(
  ({ item }) => {
    const { t } = useI18n();
    const [isOpen, setIsOpen] = useState(false);
    const meta = resolveToolMeta(item.tag, item.attributes);
    const detail = getToolDetail(item.tag, item.attributes);
    const Icon = meta.icon;

    if (item.state === "pending") {
      return null;
    }

    const actionText =
      item.state === "aborted"
        ? t("chat.activityStreamAborted")
        : meta.label || item.tag;

    return (
      <>
        <div className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground/70 my-0.5 select-none">
          <span className="opacity-40">↳</span>
          <Icon size={11} className={`${meta.color} opacity-70`} />
          <span>{actionText}</span>
          {detail && (
            <button
              onClick={() => setIsOpen(true)}
              className="hover:underline hover:text-foreground cursor-pointer truncate max-w-xs font-semibold"
              type="button"
            >
              {detail}
            </button>
          )}
        </div>

        {isOpen && (
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogContent className="sm:max-w-6xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle
                  className={`flex items-center gap-2 ${meta.color}`}
                >
                  <Icon size={20} />
                  {meta.label}
                  {detail && (
                    <span className="typo-caption ml-1">{detail}</span>
                  )}
                </DialogTitle>
              </DialogHeader>
              <div className="mt-2 overflow-hidden min-w-0">
                {item.originalContent}
              </div>
            </DialogContent>
          </Dialog>
        )}
      </>
    );
  },
);
