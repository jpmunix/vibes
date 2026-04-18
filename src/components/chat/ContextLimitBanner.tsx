import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const CONTEXT_LIMIT_THRESHOLD = 40_000;

interface ContextLimitBannerProps {
  totalTokens?: number | null;
  contextWindow?: number;
}

function formatTokenCount(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`.replace(".0k", "k");
  }
  return count.toString();
}

export function ContextLimitBanner({
  totalTokens,
  contextWindow,
}: ContextLimitBannerProps) {

  // Don't show banner if we don't have the necessary data
  if (!totalTokens || !contextWindow) {
    return null;
  }

  // Check if we're within 40k tokens of the context limit
  const tokensRemaining = contextWindow - totalTokens;
  if (tokensRemaining > CONTEXT_LIMIT_THRESHOLD) {
    return null;
  }

  return (
    <div
      className="mx-auto max-w-3xl my-3 p-2 rounded-lg border border-amber-500/30 bg-amber-500/10 flex flex-col gap-2"
      data-testid="context-limit-banner"
    >
      <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 p-0 hover:bg-transparent text-amber-600 dark:text-amber-400 cursor-help"
            >
              <AlertTriangle className="h-4 w-4 shrink-0" />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="w-auto p-2 text-xs" side="top">
            <div className="grid gap-1">
              <div className="flex justify-between gap-4">
                <span>Usado:</span>
                <span className="font-medium">
                  {formatTokenCount(totalTokens)}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span>Límite:</span>
                <span className="font-medium">
                  {formatTokenCount(contextWindow)}
                </span>
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
        <p className="text-sm font-medium">
          Estás cerca del límite de contexto para este chat.
        </p>
      </div>
    </div>
  );
}
