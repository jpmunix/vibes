import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
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

export interface FlowActivityItem {
  tag: string;
  attributes: Record<string, string>;
  state: ToolBadgeState;
  originalContent: React.ReactNode;
}

/** Compact a number of milliseconds into a human-friendly "26s"/"1m 12s" form. */
export function formatActivityDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

interface FlowActivityStreamProps {
  items: FlowActivityItem[];
  /** True while the agent is still streaming — keeps the panel expanded. */
  isStreaming: boolean;
}

/**
 * Flow-mode activity panel.
 *
 * Duration is measured from component mount (first tool call seen) to the
 * moment streaming stops, using a ref + effect so it survives re-renders and
 * is never reset by the synchronous render loop (which caused the 0s bug).
 *
 * Live: shows elapsed time on each re-render via `Date.now() - mountedAt`.
 *       Updates naturally because streaming triggers frequent re-renders.
 * Stopped: freezes at the moment isStreaming transitions false, then collapses
 *          the panel into a summary pill automatically.
 */
export const FlowActivityStream: React.FC<FlowActivityStreamProps> = React.memo(
  ({ items, isStreaming }) => {
    const { t, tPlural } = useI18n();
    const panelRef = useRef<HTMLDivElement>(null);
    const [autoScroll, setAutoScroll] = useState(true);
    const [expandedByUser, setExpandedByUser] = useState<boolean | null>(null);

    // Mount time — the true start of the tool-work window.
    const mountedAtRef = useRef(Date.now());
    // Frozen end time — captured the moment streaming stops.
    const [endedAt, setEndedAt] = useState<number | null>(null);
    const prevStreamingRef = useRef(isStreaming);

    useEffect(() => {
      if (prevStreamingRef.current && !isStreaming) {
        setEndedAt(Date.now());
      }
      prevStreamingRef.current = isStreaming;
    }, [isStreaming]);

    // Auto-scroll the panel to the bottom while items stream in.
    useLayoutEffect(() => {
      if (!autoScroll || !panelRef.current) return;
      panelRef.current.scrollTop = panelRef.current.scrollHeight;
    }, [items, autoScroll]);

    if (items.length === 0) return null;

    const finishedItems = items.filter((i) => i.state !== "pending");
    const collapsed =
      expandedByUser !== null ? !expandedByUser : !isStreaming;

    // Live: Date.now() updates every re-render during streaming.
    // Frozen: endedAt is set once streaming stops.
    const durationMs = Math.max(
      0,
      (endedAt ?? Date.now()) - mountedAtRef.current,
    );
    const duration = formatActivityDuration(durationMs);

    const summary =
      finishedItems.length > 0
        ? tPlural("chat.activityStreamCount", finishedItems.length)
        : t("chat.activityStreamEmpty");

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
          <span>
            {t("chat.activityStreamWorked", { duration })} · {summary}
          </span>
          {collapsed ? <ChevronDown size={11} /> : <ChevronUp size={11} />}
        </button>

        {!collapsed && (
          <div
            ref={panelRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              const atBottom =
                el.scrollHeight - el.scrollTop - el.clientHeight < 12;
              setAutoScroll(atBottom);
            }}
            className="mt-1.5 max-h-40 overflow-y-auto rounded-md border border-border/40 bg-muted/20 pl-2 pr-1 py-1"
            data-testid="flow-activity-stream"
          >
            {items.map((item, idx) => (
              <FlowActivityRow key={`${item.tag}-${idx}`} item={item} />
            ))}
          </div>
        )}
      </div>
    );
  },
);

const FlowActivityRow: React.FC<{ item: FlowActivityItem }> = React.memo(
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
