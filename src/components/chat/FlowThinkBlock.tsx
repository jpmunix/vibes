import React, { useRef, useLayoutEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronDown, ChevronUp } from "@/components/ui/icons";

/** Height threshold for collapsing flow-mode think blocks (~4 lines at text-xs) */
const FLOW_THINK_COLLAPSE_HEIGHT = 120;

const REMARK_PLUGINS = [remarkGfm];

interface FlowThinkBlockProps {
  content: string;
  markdownComponents: Record<string, React.ComponentType<any>>;
  /** When true the block stays expanded (used during streaming) */
  isStreaming?: boolean;
}

/**
 * Self-contained collapsible block for think/thought tags in Flow mode.
 * Uses a hard toggle (no animations) to prevent scroll jumps and keep the 
 * user's viewport perfectly anchored.
 */
export const FlowThinkBlock: React.FC<FlowThinkBlockProps> = ({
  content,
  markdownComponents,
  isStreaming,
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [isLong, setIsLong] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Measure the real content height including collapsed margins
  useLayoutEffect(() => {
    if (!contentRef.current) return;
    const h = contentRef.current.scrollHeight;
    setIsLong(h > FLOW_THINK_COLLAPSE_HEIGHT);
  }, [content]);

  // Streaming keeps the block expanded; collapse when streaming ends.
  const isCollapsed = isLong && !expanded && !isStreaming;

  return (
    <div style={{ position: "relative", margin: "12px 0" }}>
      <div
        ref={contentRef}
        style={{
          maxHeight: isCollapsed ? `${FLOW_THINK_COLLAPSE_HEIGHT}px` : undefined,
          overflow: isCollapsed ? "hidden" : undefined,
          WebkitMaskImage: isCollapsed
            ? "linear-gradient(to bottom, black calc(100% - 24px), transparent 100%)"
            : undefined,
          maskImage: isCollapsed
            ? "linear-gradient(to bottom, black calc(100% - 24px), transparent 100%)"
            : undefined,
          borderLeft: "3px solid var(--accent-think-border)",
          padding: "6px 12px",
          color: "var(--accent-think-text)",
        }}
        className="text-xs leading-relaxed prose prose-xs dark:prose-invert max-w-none [&_*]:!text-[inherit]"
      >
        <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={markdownComponents}>
          {content}
        </ReactMarkdown>
      </div>
      {isLong && !isStreaming && (
        <button
          onClick={() => {
            // In a flex-col-reverse scroll container, expanding an element above the
            // anchor pushes the viewport up. We compensate by adjusting scrollTop
            // on the scroll container after React re-renders.
            const scrollContainer = contentRef.current?.closest('[data-testid="messages-list"]') as HTMLElement | null;
            const prevScrollTop = scrollContainer?.scrollTop ?? 0;
            const prevScrollHeight = scrollContainer?.scrollHeight ?? 0;

            setExpanded((prev) => {
              // Use a rAF to adjust scroll after React commits the DOM change
              requestAnimationFrame(() => {
                if (!scrollContainer) return;
                const delta = scrollContainer.scrollHeight - prevScrollHeight;
                // In column-reverse, scrollTop is 0 at bottom and negative upward.
                // When content grows, we need to offset by the delta to stay in place.
                scrollContainer.scrollTop = prevScrollTop - delta;
              });
              return !prev;
            });
          }}
          className="flex items-center gap-1 mt-1 text-xs cursor-pointer transition-colors"
          style={{ color: "var(--accent-think-text)", opacity: 0.7 }}
          onMouseEnter={(e) => { (e.currentTarget.style.opacity as any) = "1"; }}
          onMouseLeave={(e) => { (e.currentTarget.style.opacity as any) = "0.7"; }}
        >
          {expanded ? (
            <><ChevronUp size={12} /><span>Menos</span></>
          ) : (
            <><ChevronDown size={12} /><span>Más</span></>
          )}
        </button>
      )}
    </div>
  );
};
