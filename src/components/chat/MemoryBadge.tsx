import React, { useState } from "react";
import { Database } from "@/components/ui/icons";
import type { SelectedMemoryMeta } from "@/atoms/chatAtoms";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
 * Compact badge that shows how many memories were injected.
 * Opens a modal dialog on click to show the full list.
 */
export const MemoryBadge = React.memo(({ memories }: MemoryBadgeProps) => {
  const [open, setOpen] = useState(false);

  if (!memories || memories.length === 0) return null;

  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md
          text-xs text-muted-foreground hover:text-foreground
          hover:bg-accent/50 transition-colors cursor-pointer"
        aria-label={`${memories.length} memorias inyectadas`}
      >
        <Database size={12} />
        <span className="typo-micro">{memories.length}</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[70vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Database size={15} className="text-muted-foreground" />
              Memorias inyectadas ({memories.length})
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 space-y-2 pr-1">
            {memories.map((m) => (
              <div
                key={m.id}
                className="flex items-start gap-2 py-1.5 px-2 rounded-lg hover:bg-muted/30 transition-colors"
              >
                <span className="flex-shrink-0 typo-caption font-bold text-muted-foreground mt-px">
                  {TYPE_LABELS[m.type] || m.type}
                </span>
                <span className="typo-caption text-muted-foreground flex-1 min-w-0">
                  {m.content}
                </span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
});

MemoryBadge.displayName = "MemoryBadge";
