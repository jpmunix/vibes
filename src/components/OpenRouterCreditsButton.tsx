import { useQuery } from "@tanstack/react-query";
import { DollarSign, RefreshCw } from "@/components/ui/icons";
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
            className="no-app-region-drag topnav-util-btn gap-1 !w-auto px-2"
            onClick={() => refetch()}
            disabled={isFetching}
            style={{ display: 'flex', alignItems: 'center' }}
          >
            {isFetching ? (
              <RefreshCw size={15} className="animate-spin" />
            ) : (
              <DollarSign size={15} />
            )}
            <span className="typo-badge leading-none opacity-70">
              {isLoading ? "..." : formattedBalance}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="p-4 rounded-xl shadow-lg border-border bg-popover text-popover-foreground" arrowClassName="fill-popover">
          <div className="space-y-1">
            <p className="typo-menu-header mb-3">
              {data.label || "OpenRouter"}
            </p>
            <div className="flex justify-between gap-4 typo-body">
              <span className="text-muted-foreground">Gasto Total:</span>
              <span className="typo-mono text-foreground">${data.totalUsage.toFixed(2)}</span>
            </div>
            <div className="flex justify-between gap-4 typo-body">
              <span className="text-muted-foreground">Créditos Restantes:</span>
              <span className="typo-mono text-foreground">${data.availableCredits.toFixed(2)}</span>
            </div>
            <div className="flex justify-between gap-4 typo-body border-t border-border mt-3 pt-3">
              <span className="text-muted-foreground">Total Recargado:</span>
              <span className="typo-mono text-foreground">${data.totalCredits.toFixed(2)}</span>
            </div>
            <p className="typo-micro mt-3 text-right opacity-50">
              Click para actualizar
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
