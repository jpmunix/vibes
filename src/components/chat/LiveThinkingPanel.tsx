import React, { useRef, useEffect } from "react";
import { Brain } from "lucide-react";
import { VanillaMarkdownParser } from "./VibesMarkdownParser";

interface LiveThinkingPanelProps {
  content: string;
  /** Whether the think tag is still open (streaming) */
  isActive?: boolean;
}

/**
 * Shows thinking content live during streaming.
 * Stays expanded as the last visible think until a new one appears,
 * then collapses into the normal compact brain badge when streaming ends.
 */
export const LiveThinkingPanel: React.FC<LiveThinkingPanelProps> = React.memo(({ content, isActive }) => {
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
    <div className="mt-1 mb-1.5 rounded-md border border-purple-500/15 bg-purple-500/[0.03] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-1.5 px-2 py-1 border-b border-purple-500/10">
        <Brain size={11} className={`text-purple-500 ${isActive ? "animate-pulse" : ""}`} />
        <span className="text-[10px] font-medium text-purple-400/80">
          {isActive ? "Pensando..." : "Pensamiento"}
        </span>
      </div>
      {/* Content */}
      <div
        ref={scrollRef}
        className="px-2 py-1.5 max-h-[100px] overflow-y-auto text-[11px] leading-relaxed text-muted-foreground/60 [&_p]:my-0.5 [&_ul]:my-0.5 [&_ol]:my-0.5 [&_li]:my-0 [&_code]:text-[10px] [&_pre]:my-1 [&_h1]:text-xs [&_h2]:text-xs [&_h3]:text-[11px]"
      >
        <VanillaMarkdownParser content={content} />
      </div>
    </div>
  );
});

LiveThinkingPanel.displayName = "LiveThinkingPanel";
