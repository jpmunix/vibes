import { useQuery } from "@tanstack/react-query";
import { DollarSign, RefreshCw } from "lucide-react";
import { ipc } from "@/ipc/types";
import { queryKeys } from "@/lib/queryKeys";

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

  const formattedBalance = data.availableCredits.toFixed(2).replace(".", ",");

  return (
    <button
      className="no-app-region-drag cursor-pointer relative flex items-center gap-1 px-2 py-2 rounded-2xl text-xs font-medium flex-col hover:bg-sidebar-accent transition-colors w-14 h-14 mb-2"
      title={`Créditos disponibles en OpenRouter\nTotal: $${data.totalCredits.toFixed(2)}\nUsados: $${data.totalUsage.toFixed(2)}\n\nClick para actualizar`}
      onClick={() => refetch()}
      disabled={isFetching}
    >
      {isFetching ? (
        <RefreshCw size={14} className="animate-spin" />
      ) : (
        <DollarSign size={14} />
      )}
      <span className="text-[11px]">
        {isLoading ? "..." : formattedBalance}
      </span>
    </button>
  );
}
