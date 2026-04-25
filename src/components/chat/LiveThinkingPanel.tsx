import React, { useRef, useEffect } from "react";
import { Brain } from "@/components/ui/icons";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MARKDOWN_COMPONENTS } from "./VibesMarkdownParser";

const REMARK_PLUGINS = [remarkGfm];

/**
 * Shows thinking content live during streaming.
 * Stays expanded as the last visible think until a new one appears,
 * then collapses into the normal compact brain badge when streaming ends.
 *
 * Uses the shared MARKDOWN_COMPONENTS from VibesMarkdownParser for
 * consistent inline code styling, links, etc. The panel's smaller
 * visual scale is achieved via the container's text-xs class, not by
 * redefining every markdown element.
 */
export const LiveThinkingPanel: React.FC<{
  content: string;
  /** Whether the think tag is still open (streaming) */
  isActive?: boolean;
}> = React.memo(({ content, isActive }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom as new content arrives (only while actively streaming)
  useEffect(() => {
    if (isActive && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [content, isActive]);

  if (!content || !content.trim()) {
    return null;
  }

  return (
    <div
      className="mt-1.5 mb-2 rounded-md overflow-hidden"
      style={{
        border: "1px solid var(--accent-think-panel-border)",
        background: "var(--accent-think-panel-bg)",
      }}
    >
      <style>{`
        .live-think-scroll::-webkit-scrollbar {
          width: 3px;
        }
        .live-think-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .live-think-scroll::-webkit-scrollbar-thumb {
          background: var(--accent-think-scrollbar);
          border-radius: 3px;
        }
        .live-think-scroll::-webkit-scrollbar-thumb:hover {
          background: var(--accent-think-scrollbar-hover);
        }
      `}</style>
      {/* Header */}
      <div
        className="flex items-center gap-1.5 px-3 py-1.5"
        style={{ borderBottom: "1px solid var(--accent-think-header-border)" }}
      >
        <Brain size={12} style={{ color: "var(--accent-think-icon)" }} className={isActive ? "animate-pulse" : ""} />
        <span className="text-xs font-medium" style={{ color: "var(--accent-think-label)" }}>
          {isActive ? "Pensando..." : "Pensamiento"}
        </span>
      </div>
      {/* Content — text-xs on the container scales everything down uniformly */}
      <div
        ref={scrollRef}
        className="live-think-scroll px-3 py-2 max-h-[150px] overflow-y-auto text-xs leading-relaxed text-muted-foreground/70 prose prose-xs dark:prose-invert max-w-none"
      >
        <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={MARKDOWN_COMPONENTS}>
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
});

LiveThinkingPanel.displayName = "LiveThinkingPanel";
