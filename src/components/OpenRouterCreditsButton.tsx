import { useQuery } from "@tanstack/react-query";
import { DollarSign, RefreshCw } from "lucide-react";
import { ipc } from "@/ipc/types";
import { queryKeys } from "@/lib/queryKeys";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function OpenRouterCreditsButton() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: queryKeys.system.openRouterCredits,
    queryFn: async () => {
      return ipc.system.getOpenRouterCredits();
    },
    refetchInterval: 600000, // Refetch every 10 minutes
    retry: false,
  });

  if (error || !data) {
    return null; // Don't show if there's no API key or error
  }

  const formattedUsage = data.totalUsage.toFixed(2).replace(".", ",");
  const formattedBalance = data.availableCredits.toFixed(2).replace(".", ",");

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="no-app-region-drag cursor-pointer relative flex items-center gap-1 px-2 py-2 rounded-2xl flex-col hover:bg-sidebar-accent transition-colors w-14 h-14 mb-2 text-foreground"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            {isFetching ? (
              <RefreshCw size={20} className="animate-spin" />
            ) : (
              <DollarSign size={20} className="opacity-100" />
            )}
            <span className="text-xs font-bold leading-none mt-0.5">
              {isLoading ? "..." : formattedBalance}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="p-4 rounded-xl shadow-lg border-border bg-popover text-popover-foreground" arrowClassName="fill-popover">
          <div className="space-y-1">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
              {data.label || "OpenRouter"}
            </p>
            <div className="flex justify-between gap-4 text-sm">
              <span className="text-muted-foreground">Gasto Total:</span>
              <span className="font-mono font-bold text-rose-500 dark:text-rose-400">${data.totalUsage.toFixed(2)}</span>
            </div>
            <div className="flex justify-between gap-4 text-sm">
              <span className="text-muted-foreground">Créditos Restantes:</span>
              <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">${data.availableCredits.toFixed(2)}</span>
            </div>
            <div className="flex justify-between gap-4 text-sm border-t border-border mt-2 pt-2">
              <span className="text-muted-foreground">Total Recargado:</span>
              <span className="font-mono">${data.totalCredits.toFixed(2)}</span>
            </div>
            <p className="text-[10px] text-muted-foreground/70 mt-2 text-right italic">
              Click para actualizar
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
