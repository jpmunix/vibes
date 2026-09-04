import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronDown, ChevronUp, Clock } from "@/components/ui/icons";
import { useI18n } from "@/lib/i18n";
import { formatActivityDuration } from "./FlowActivityStream";

const REMARK_PLUGINS = [remarkGfm];

interface FlowThinkBlockProps {
  content: string;
  markdownComponents: Record<string, React.ComponentType<any>>;
  /** While true the thought remains expanded; it collapses when streaming ends. */
  isStreaming?: boolean;
  /** Epoch ms for the beginning of the current streamed turn. */
  startedAt?: number;
}

/**
 * Thought block for Flow mode. It stays readable while the model is thinking,
 * then folds into the same compact summary pattern as tool activity. The
 * elapsed time is measured with refs/effects so re-renders cannot reset it.
 */
export const FlowThinkBlock: React.FC<FlowThinkBlockProps> = ({
  content,
  markdownComponents,
  isStreaming = false,
  startedAt,
}) => {
  const { t } = useI18n();
  const [expandedByUser, setExpandedByUser] = useState<boolean | null>(null);
  const startedAtRef = useRef(startedAt ?? Date.now());
  const [endedAt, setEndedAt] = useState<number | null>(null);
  const previousStreamingRef = useRef(isStreaming);

  // The parser may provide the turn timestamp after this block first mounts.
  // Keep the ref aligned so the summary measures the whole turn, not mount latency.
  if (startedAt !== undefined && startedAtRef.current !== startedAt) {
    startedAtRef.current = startedAt;
  }

  useEffect(() => {
    if (previousStreamingRef.current && !isStreaming) {
      setEndedAt(Date.now());
    }
    previousStreamingRef.current = isStreaming;
  }, [isStreaming]);

  const expanded =
    expandedByUser !== null ? expandedByUser : isStreaming;
  const duration = formatActivityDuration(
    Math.max(0, (endedAt ?? Date.now()) - startedAtRef.current),
  );

  return (
    <div className="my-2">
      <button
        type="button"
        onClick={() => setExpandedByUser(!expanded)}
        className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground/60 hover:text-foreground transition-colors select-none cursor-pointer"
        title={
          expanded
            ? t("chat.activityStreamCollapse")
            : t("chat.activityStreamExpand")
        }
        data-testid="flow-think-summary"
      >
        <Clock size={11} className="opacity-70" />
        <span>{t("chat.thoughtWorked", { duration })}</span>
        {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
      </button>

      {expanded && (
        <div
          className="mt-1.5 border-l-[3px] border-[var(--accent-think-border)] px-3 py-1.5 text-xs leading-relaxed prose prose-xs dark:prose-invert max-w-none [&_*]:!text-[var(--accent-think-text)]"
          style={{ color: "var(--accent-think-text)" }}
        >
          <ReactMarkdown
            remarkPlugins={REMARK_PLUGINS}
            components={markdownComponents}
          >
            {content}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
};
