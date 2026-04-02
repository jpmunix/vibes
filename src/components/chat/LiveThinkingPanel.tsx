import React, { useRef, useEffect } from "react";
import { Brain } from "lucide-react";
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
    <div className="mt-1.5 mb-2 rounded-md border border-purple-500/15 bg-purple-500/[0.03] overflow-hidden">
      <style>{`
        .live-think-scroll::-webkit-scrollbar {
          width: 3px;
        }
        .live-think-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .live-think-scroll::-webkit-scrollbar-thumb {
          background: rgba(168, 85, 247, 0.2);
          border-radius: 3px;
        }
        .live-think-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(168, 85, 247, 0.35);
        }
      `}</style>
      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-purple-500/10">
        <Brain size={12} className={`text-purple-500 ${isActive ? "animate-pulse" : ""}`} />
        <span className="text-xs font-medium text-purple-400/80">
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
