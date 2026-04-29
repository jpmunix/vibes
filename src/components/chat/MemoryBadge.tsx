import React, { useState } from "react";
import { Database } from "@/components/ui/icons";
import type { SelectedMemoryMeta } from "@/atoms/chatAtoms";

const TYPE_COLORS: Record<string, string> = {
  fact: "text-blue-400",
  preference: "text-violet-400",
  decision: "text-amber-400",
  issue: "text-rose-400",
  episode: "text-emerald-400",
};

const TYPE_LABELS: Record<string, string> = {
  fact: "Fact",
  preference: "Pref",
  decision: "Decision",
  issue: "Issue",
  episode: "Episode",
};

interface MemoryBadgeProps {
  memories: SelectedMemoryMeta[];
}

/**
 * Compact badge that shows how many memories were injected,
 * expandable on click to reveal the full list.
 */
export const MemoryBadge = React.memo(({ memories }: MemoryBadgeProps) => {
  const [expanded, setExpanded] = useState(false);

  if (!memories || memories.length === 0) return null;

  return (
    <div className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setExpanded(!expanded);
        }}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md
          text-xs text-muted-foreground hover:text-foreground
          hover:bg-accent/50 transition-colors cursor-pointer"
        aria-label={`${memories.length} memorias inyectadas`}
      >
        <Database size={12} className="text-violet-400" />
        <span className="typo-micro">{memories.length}</span>
      </button>

      {expanded && (
        <div
          className="absolute bottom-full left-0 mb-1 z-50
            w-72 max-h-48 overflow-y-auto
            rounded-lg border border-border bg-popover shadow-lg
            p-2 space-y-1"
        >
          <div className="flex items-center gap-1.5 mb-1.5 pb-1 border-b border-border">
            <Database size={13} className="text-violet-400" />
            <span className="typo-micro font-medium">
              Memorias inyectadas ({memories.length})
            </span>
          </div>
          {memories.map((m) => (
            <div
              key={m.id}
              className="flex items-start gap-1.5 text-xs leading-tight"
            >
              <span
                className={`flex-shrink-0 typo-micro font-medium ${TYPE_COLORS[m.type] || "text-muted-foreground"}`}
              >
                {TYPE_LABELS[m.type] || m.type}
              </span>
              <span className="text-muted-foreground truncate flex-1 min-w-0">
                {m.content}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

MemoryBadge.displayName = "MemoryBadge";
