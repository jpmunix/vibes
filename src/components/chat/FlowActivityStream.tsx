import React, {
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronDown, ChevronUp, Clock } from "@/components/ui/icons";
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
    const { t, tPlural } = useI18n();
    const panelRef = useRef<HTMLDivElement>(null);
    const [autoScroll, setAutoScroll] = useState(true);
    const [expandedByUser, setExpandedByUser] = useState<boolean | null>(null);

    // Auto-scroll the panel to the bottom while items stream in.
    useLayoutEffect(() => {
      if (!autoScroll || !panelRef.current) return;
      panelRef.current.scrollTop = panelRef.current.scrollHeight;
    }, [items, autoScroll]);

    if (items.length === 0) return null;

    const toolItems = items.filter(
      (i): i is FlowActivityToolItem => i.kind === "tool",
    );
    const thoughtItems = items.filter(
      (i): i is FlowActivityThoughtItem => i.kind === "thought",
    );
    const finishedTools = toolItems.filter((i) => i.state !== "pending");

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
      expandedByUser !== null ? !expandedByUser : !isStreaming;

    // Summary label: real duration when known, friendly fallback otherwise.
    const durationLabel = hasAnyDuration
      ? t("chat.activityStreamWorked", {
          duration: formatActivityDuration(totalMs),
        })
      : t("chat.activityStreamWorkedVague");
    const parts: string[] = [durationLabel];
    if (finishedTools.length > 0) {
      parts.push(tPlural("chat.activityStreamCount", finishedTools.length));
    }
    if (thoughtItems.length > 0) {
      parts.push(t("chat.activityStreamThought"));
    }
    const summary = parts.join(" · ");

    return (
      <div className="my-2">
        <button
          type="button"
          onClick={() => {
            setExpandedByUser(collapsed);
            setAutoScroll(true);
          }}
          className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground/60 hover:text-foreground transition-colors select-none cursor-pointer"
          title={
            collapsed
              ? t("chat.activityStreamExpand")
              : t("chat.activityStreamCollapse")
          }
          data-testid="flow-activity-summary"
        >
          <Clock size={11} className="opacity-70" />
          <span>{summary}</span>
          {collapsed ? <ChevronDown size={11} /> : <ChevronUp size={11} />}
        </button>

        {!collapsed && (
          <div
            ref={panelRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 12;
              setAutoScroll(atBottom);
            }}
            className="mt-1.5 max-h-40 overflow-y-auto rounded-md border border-border/40 bg-muted/20 pl-2 pr-1 py-1"
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
