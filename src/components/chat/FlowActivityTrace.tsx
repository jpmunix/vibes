import React, { useState } from "react";
import { resolveToolMeta, getToolDetail, type ToolBadgeState } from "./CompactToolBadge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface FlowActivityTraceProps {
  tag: string;
  attributes: Record<string, string>;
  state: ToolBadgeState;
  originalContent: React.ReactNode;
}

/**
 * Highly condensed status line of tool executions for Flow Mode.
 * Displays a clean inline text trace (e.g. "↳ 👁 index.css") in monospace,
 * small size, and muted color. Clicking the detail opens the detail inspection modal.
 */
export const FlowActivityTrace: React.FC<FlowActivityTraceProps> = React.memo(({
  tag,
  attributes,
  state,
  originalContent,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const meta = resolveToolMeta(tag, attributes);
  const detail = getToolDetail(tag, attributes);
  const Icon = meta.icon;

  // Pending items are handled by the main loader at the bottom during streaming
  if (state === "pending") {
    return null;
  }

  const actionText = state === "aborted" ? "no terminado" : (meta.label || tag);

  return (
    <>
      <div className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground/50 my-1 ml-4 select-none">
        <span className="opacity-40">↳</span>
        <Icon size={11} className={`${meta.color} opacity-60`} />
        <span>{actionText}</span>
        {detail && (
          <button
            onClick={() => setIsOpen(true)}
            className="hover:underline hover:text-foreground cursor-pointer text-muted-foreground/75 truncate max-w-xs font-semibold"
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
              <DialogTitle className={`flex items-center gap-2 ${meta.color}`}>
                <Icon size={20} />
                {meta.label}
                {detail && <span className="typo-caption ml-1">{detail}</span>}
              </DialogTitle>
            </DialogHeader>
            <div className="mt-2 overflow-hidden min-w-0">{originalContent}</div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
});
