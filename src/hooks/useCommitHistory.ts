import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { ipc } from "@/ipc/types";

const PAGE_SIZE = 30;

export function useCommitHistory(appId: number | null) {
    const [selectedCommit, setSelectedCommit] = useState<string | null>(null);
    const [page, setPage] = useState(0);
    const [branch, setBranch] = useState<string | undefined>(undefined);

    // Fetch commit history
    const {
        data: historyData,
        isLoading: isLoadingHistory,
        refetch: refreshHistory,
    } = useQuery({
        queryKey: ["commit-history", appId, page, branch],
        queryFn: async () => {
            if (!appId) return { commits: [], total: 0, hasMore: false };
            return ipc.git.getCommitHistory({
                appId,
                limit: PAGE_SIZE,
                offset: page * PAGE_SIZE,
                branch,
            });
        },
        enabled: appId !== null,
        staleTime: 10000, // Keep data fresh for 10 seconds
    });

    // Fetch commit detail when a commit is selected
    const {
        data: commitDetail,
        isLoading: isLoadingDetail,
    } = useQuery({
        queryKey: ["commit-detail", appId, selectedCommit],
        queryFn: async () => {
            if (!appId || !selectedCommit) return null;
            return ipc.git.getCommitDetail({
                appId,
                commitHash: selectedCommit,
            });
        },
        enabled: appId !== null && selectedCommit !== null,
    });

    const nextPage = useCallback(() => {
        if (historyData?.hasMore) {
            setPage((p) => p + 1);
        }
    }, [historyData?.hasMore]);

    const prevPage = useCallback(() => {
        setPage((p) => Math.max(0, p - 1));
    }, []);

    const selectCommit = useCallback((hash: string | null) => {
        setSelectedCommit(hash);
    }, []);

    const filterByBranch = useCallback((branchName: string | undefined) => {
        setBranch(branchName);
        setPage(0);
    }, []);

    return {
        // Data
        commits: historyData?.commits ?? [],
        total: historyData?.total ?? 0,
        hasMore: historyData?.hasMore ?? false,
        commitDetail,
        selectedCommit,
        currentPage: page,
        pageSize: PAGE_SIZE,

        // Loading
        isLoadingHistory,
        isLoadingDetail,

        // Actions
        nextPage,
        prevPage,
        selectCommit,
        filterByBranch,
        refreshHistory,
    };
}
