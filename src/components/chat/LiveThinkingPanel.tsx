import React, { useRef, useEffect } from "react";
import { Brain } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface LiveThinkingPanelProps {
  content: string;
  /** Whether the think tag is still open (streaming) */
  isActive?: boolean;
}

// Minimal, unstyled components for the thinking panel so it doesn't use the huge CodeHighlight
const THINKING_COMPONENTS = {
  a: ({ node, ...props }: any) => (
    <a
      {...props}
      onClick={(e) => {
        e.preventDefault();
        window.open(props.href, "_blank");
      }}
      className="text-purple-400 hover:text-purple-300 underline"
    />
  ),
  code: ({ node, inline, className, children, ...props }: any) => {
    return (
      <code className={`${className} bg-purple-500/10 px-1 py-0.5 rounded text-[10px] whitespace-pre-wrap font-mono`} {...props}>
        {children}
      </code>
    );
  },
  pre: ({ node, children, ...props }: any) => {
    return (
      <pre className="bg-background/40 border border-purple-500/10 rounded overflow-x-auto p-2 text-[10px] my-1" {...props}>
        {children}
      </pre>
    );
  },
  p: ({ children }: any) => <p className="my-1">{children}</p>,
  ul: ({ children }: any) => <ul className="my-1 list-disc pl-4">{children}</ul>,
  ol: ({ children }: any) => <ol className="my-1 list-decimal pl-4">{children}</ol>,
  li: ({ children }: any) => <li className="my-0.5">{children}</li>,
  h1: ({ children }: any) => <h1 className="text-xs font-bold my-1.5">{children}</h1>,
  h2: ({ children }: any) => <h2 className="text-xs font-bold my-1.5">{children}</h2>,
  h3: ({ children }: any) => <h3 className="text-[11px] font-bold my-1">{children}</h3>,
};

const REMARK_PLUGINS = [remarkGfm];

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
        <Brain size={11} className={`text-purple-500 ${isActive ? "animate-pulse" : ""}`} />
        <span className="text-[10px] font-medium text-purple-400/80">
          {isActive ? "Pensando..." : "Pensamiento"}
        </span>
      </div>
      {/* Content */}
      <div
        ref={scrollRef}
        className="live-think-scroll px-3 py-2 max-h-[150px] overflow-y-auto text-[11px] leading-[1.6] text-muted-foreground/70"
      >
        <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={THINKING_COMPONENTS}>
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
});

LiveThinkingPanel.displayName = "LiveThinkingPanel";
