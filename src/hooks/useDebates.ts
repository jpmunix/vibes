import { ipc } from "@/ipc/types";
import { queryKeys } from "@/lib/queryKeys";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Debate } from "@/ipc/types/debate";

export function useDebates() {
    const queryClient = useQueryClient();

    const { data, isLoading } = useQuery({
        queryKey: ["debates", "list"],
        queryFn: async () => {
            return ipc.debate.getDebates();
        },
    });

    const invalidateDebates = () => {
        queryClient.invalidateQueries({ queryKey: ["debates"] });
    };

    return {
        debates: data ?? [],
        loading: isLoading,
        invalidateDebates,
    };
}
