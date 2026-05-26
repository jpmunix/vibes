import React, { useState } from "react";
import { Database } from "@/components/ui/icons";
import type { SelectedMemoryMeta } from "@/atoms/chatAtoms";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

const TYPE_LABELS: Record<string, string> = {
  fact: "Fact",
  preference: "Pref",
  decision: "Decision",
  issue: "Issue",
  episode: "Episode",
};

const TYPE_COLORS: Record<string, string> = {
  fact: "text-blue-400",
  preference: "text-violet-400",
  decision: "text-amber-400",
  issue: "text-rose-400",
  episode: "text-emerald-400",
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
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setOpen(true);
            }}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md
              text-xs text-muted-foreground hover:text-foreground
              hover:bg-accent/50 transition-colors cursor-pointer"
            aria-label={`${memories.length} directrices inyectadas`}
          >
            <Database size={12} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">
          {memories.length} {memories.length === 1 ? "directriz" : "directrices"}
        </TooltipContent>
      </Tooltip>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[820px] max-h-[70vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Database size={15} className="text-muted-foreground" />
              Directrices inyectadas ({memories.length})
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 pr-1">
            <table className="w-full">
              <tbody>
                {memories.map((m) => (
                  <tr
                    key={m.id}
                    className="border-b border-border/30 last:border-0 hover:bg-muted/20 transition-colors"
                  >
                    <td className="py-2.5 px-3 align-top whitespace-nowrap w-[1%]">
                      <span className={`typo-caption font-bold ${TYPE_COLORS[m.type] || "text-muted-foreground"}`}>
                        {TYPE_LABELS[m.type] || m.type}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 align-top">
                      <span className="typo-caption text-muted-foreground">
                        {m.content}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
});

MemoryBadge.displayName = "MemoryBadge";
