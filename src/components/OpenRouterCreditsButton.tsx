import { useQuery } from "@tanstack/react-query";
import { DollarSign, RefreshCw } from "@/components/ui/icons";
import { ipc } from "@/ipc/types";
import { queryKeys } from "@/lib/queryKeys";
import { useAtomValue } from "jotai";
import { preferencesHydratedAtom } from "@/atoms/preferenceAtoms";

export function OpenRouterCreditsButton() {
  const hydrated = useAtomValue(preferencesHydratedAtom);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: queryKeys.system.openRouterCredits,
    queryFn: async () => {
      return ipc.system.getOpenRouterCredits();
    },
    refetchInterval: 600000, // Refetch every 10 minutes
    retry: false,
    // Don't fetch until preferences (including OpenRouter API key) are hydrated.
    // Without this, the query fires with empty providerSettings and fails silently,
    // causing the balance to never appear until the user manually refreshes settings.
    enabled: hydrated,
  });

  if (error || !data) {
    return null; // Don't show if there's no API key or error
  }

  const formattedBalance = data.availableCredits.toFixed(2).replace(".", ",");

  return (
    <>
      <div className="h-px bg-border/50 my-1 mx-1" />
      <div className="px-2 py-1.5">
        <div className="rounded-lg bg-accent/30 border border-border/50 p-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              <DollarSign size={13} className="text-primary" />
              <span>Saldo OpenRouter</span>
            </div>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                refetch();
              }}
              disabled={isFetching}
              className="text-muted-foreground hover:text-foreground disabled:opacity-50 p-0.5 rounded transition-colors cursor-pointer"
              title="Actualizar saldo"
            >
              <RefreshCw size={12} className={isFetching ? "animate-spin" : ""} />
            </button>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-lg font-bold typo-mono text-foreground leading-none">
              {isLoading ? "..." : `$${formattedBalance}`}
            </span>
            <span className="text-[10px] text-muted-foreground typo-mono">
              Gasto: ${data.totalUsage.toFixed(2)}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
