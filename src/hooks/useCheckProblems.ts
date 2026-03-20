import { useQuery } from "@tanstack/react-query";
import { ipc, type ProblemReport } from "@/ipc/types";
import { queryKeys } from "@/lib/queryKeys";

export function useCheckProblems(appId: number | null) {
    const {
        data: problemReport,
        isLoading: isChecking,
        error,
        refetch: checkProblems,
    } = useQuery<ProblemReport, Error>({
        queryKey: queryKeys.problems.byApp({ appId }),
        queryFn: async (): Promise<ProblemReport> => {
            if (!appId) {
                throw new Error("App ID is required");
            }
            return ipc.misc.checkProblems({ appId });
        },
        enabled: !!appId,
        // DO NOT SHOW ERROR TOAST.
    });

    return {
        problemReport,
        isChecking,
        error,
        checkProblems,
    };
}
