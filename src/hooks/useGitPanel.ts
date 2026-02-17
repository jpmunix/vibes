import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ipc } from "@/ipc/types";
import { queryKeys } from "@/lib/queryKeys";
import { toast } from "sonner";

export interface GitPanelFile {
    path: string;
    status: "added" | "modified" | "deleted" | "renamed";
    staged: boolean;
}

export function useGitPanel(appId: number | null) {
    const queryClient = useQueryClient();
    const [commitMessage, setCommitMessage] = useState("");
    const [isGeneratingMessage, setIsGeneratingMessage] = useState(false);

    // Fetch uncommitted files
    const {
        data: uncommittedFiles = [],
        isLoading: isLoadingFiles,
        refetch: refreshFiles,
    } = useQuery({
        queryKey: queryKeys.uncommittedFiles.byApp({ appId }),
        queryFn: async () => {
            if (!appId) return [];
            return ipc.git.getUncommittedFiles({ appId });
        },
        enabled: appId !== null,
        refetchInterval: 3000,
    });

    // Fetch current branch
    const { data: branchInfo, refetch: refreshBranch } = useQuery({
        queryKey: queryKeys.branches.current({ appId }),
        queryFn: async () => {
            if (!appId) return null;
            return ipc.version.getCurrentBranch({ appId });
        },
        enabled: appId !== null,
    });

    // Fetch local branches
    const { data: branchList } = useQuery({
        queryKey: ["git-panel", "local-branches", appId],
        queryFn: async () => {
            if (!appId) return { branches: [], current: null };
            return ipc.github.listLocalBranches({ appId });
        },
        enabled: appId !== null,
    });

    // Fetch git state (ahead/behind, merge/rebase status)
    const { data: gitState } = useQuery({
        queryKey: ["git-state", appId],
        queryFn: async () => {
            if (!appId) return null;
            return ipc.github.getGitState({ appId });
        },
        enabled: appId !== null,
        refetchInterval: 5000,
    });

    // Stage file mutation
    const stageFileMutation = useMutation({
        mutationFn: async (filepath: string) => {
            if (!appId) throw new Error("No app selected");
            await ipc.git.stageFile({ appId, filepath });
        },
        onSuccess: () => refreshFiles(),
        onError: (err: Error) => toast.error(`Error al stage: ${err.message}`),
    });

    // Unstage file mutation
    const unstageFileMutation = useMutation({
        mutationFn: async (filepath: string) => {
            if (!appId) throw new Error("No app selected");
            await ipc.git.unstageFile({ appId, filepath });
        },
        onSuccess: () => refreshFiles(),
        onError: (err: Error) => toast.error(`Error al unstage: ${err.message}`),
    });

    // Stage all mutation
    const stageAllMutation = useMutation({
        mutationFn: async () => {
            if (!appId) throw new Error("No app selected");
            await ipc.git.stageAll({ appId });
        },
        onSuccess: () => refreshFiles(),
        onError: (err: Error) => toast.error(`Error al stage: ${err.message}`),
    });

    // Unstage all mutation
    const unstageAllMutation = useMutation({
        mutationFn: async () => {
            if (!appId) throw new Error("No app selected");
            await ipc.git.unstageAll({ appId });
        },
        onSuccess: () => refreshFiles(),
        onError: (err: Error) => toast.error(`Error al unstage: ${err.message}`),
    });

    // Commit mutation
    const commitMutation = useMutation({
        mutationFn: async ({
            message,
            filesToStage,
        }: {
            message: string;
            filesToStage?: string[];
        }) => {
            if (!appId) throw new Error("No app selected");
            return ipc.git.commitChanges({ appId, message, filesToStage });
        },
        onSuccess: () => {
            setCommitMessage("");
            refreshFiles();
            queryClient.invalidateQueries({
                queryKey: queryKeys.versions.list({ appId }),
            });
            toast.success("Commit realizado correctamente");
        },
        onError: (err: Error) => toast.error(`Error en commit: ${err.message}`),
    });

    // Push mutation
    const pushMutation = useMutation({
        mutationFn: async ({ commitMsg }: { commitMsg?: string } = {}) => {
            if (!appId) throw new Error("No app selected");
            await ipc.github.push({ appId, commitMessage: commitMsg });
        },
        onSuccess: () => {
            refreshFiles();
            toast.success("Push realizado correctamente");
        },
        onError: (err: Error) => toast.error(`Error en push: ${err.message}`),
    });

    // Generate commit message with AI
    const generateCommitMessage = useCallback(async () => {
        if (!appId) return;
        setIsGeneratingMessage(true);
        try {
            const result = await ipc.github.generateCommitMessage({ appId });
            setCommitMessage(result.message);
        } catch (err: any) {
            toast.error(`Error generando mensaje: ${err.message}`);
        } finally {
            setIsGeneratingMessage(false);
        }
    }, [appId]);

    // Get file diff
    const getFileDiff = useCallback(
        async (filepath: string) => {
            if (!appId) return null;
            return ipc.git.getFileDiff({ appId, filepath });
        },
        [appId],
    );

    // Fetch conflict files (only when merge is in progress)
    const { data: conflictData } = useQuery({
        queryKey: ["git-conflicts", appId],
        queryFn: async () => {
            if (!appId) return { files: [], mergeInProgress: false };
            return ipc.git.getConflictFiles({ appId });
        },
        enabled: appId !== null && gitState?.mergeInProgress === true,
        refetchInterval: 3000,
    });

    // Resolve merge: accept ours (local changes)
    const resolveMergeOursMutation = useMutation({
        mutationFn: async () => {
            if (!appId) throw new Error("No app selected");
            return ipc.git.resolveMergeOurs({ appId });
        },
        onSuccess: (result) => {
            refreshFiles();
            queryClient.invalidateQueries({ queryKey: ["git-state", appId] });
            queryClient.invalidateQueries({ queryKey: ["git-conflicts", appId] });
            toast.success(result.message);
        },
        onError: (err: Error) => toast.error(`Error al resolver: ${err.message}`),
    });

    // Resolve merge: accept theirs (incoming changes)
    const resolveMergeTheirsMutation = useMutation({
        mutationFn: async () => {
            if (!appId) throw new Error("No app selected");
            return ipc.git.resolveMergeTheirs({ appId });
        },
        onSuccess: (result) => {
            refreshFiles();
            queryClient.invalidateQueries({ queryKey: ["git-state", appId] });
            queryClient.invalidateQueries({ queryKey: ["git-conflicts", appId] });
            toast.success(result.message);
        },
        onError: (err: Error) => toast.error(`Error al resolver: ${err.message}`),
    });

    // Abort merge
    const abortMergeMutation = useMutation({
        mutationFn: async () => {
            if (!appId) throw new Error("No app selected");
            await ipc.git.abortMerge({ appId });
        },
        onSuccess: () => {
            refreshFiles();
            queryClient.invalidateQueries({ queryKey: ["git-state", appId] });
            queryClient.invalidateQueries({ queryKey: ["git-conflicts", appId] });
            toast.success("Merge abortado correctamente");
        },
        onError: (err: Error) => toast.error(`Error al abortar merge: ${err.message}`),
    });

    // Per-file conflict resolution: accept ours (local)
    const resolveFileOursMutation = useMutation({
        mutationFn: async (filepath: string) => {
            if (!appId) throw new Error("No app selected");
            return ipc.git.resolveFileOurs({ appId, filepath });
        },
        onSuccess: (result) => {
            refreshFiles();
            queryClient.invalidateQueries({ queryKey: ["git-conflicts", appId] });
            toast.success(result.message);
        },
        onError: (err: Error) => toast.error(`Error al resolver archivo: ${err.message}`),
    });

    // Per-file conflict resolution: accept theirs (incoming)
    const resolveFileTheirsMutation = useMutation({
        mutationFn: async (filepath: string) => {
            if (!appId) throw new Error("No app selected");
            return ipc.git.resolveFileTheirs({ appId, filepath });
        },
        onSuccess: (result) => {
            refreshFiles();
            queryClient.invalidateQueries({ queryKey: ["git-conflicts", appId] });
            toast.success(result.message);
        },
        onError: (err: Error) => toast.error(`Error al resolver archivo: ${err.message}`),
    });

    // Get conflict diff for a specific file
    const getConflictFileDiff = useCallback(
        async (filepath: string) => {
            if (!appId) return null;
            return ipc.git.getConflictFileDiff({ appId, filepath });
        },
        [appId],
    );

    return {
        // Data
        uncommittedFiles,
        currentBranch: branchInfo?.branch ?? null,
        branches: branchList?.branches ?? [],
        gitState,
        commitMessage,
        isLoadingFiles,
        conflictFiles: conflictData?.files ?? [],

        // Setters
        setCommitMessage,

        // Actions
        stageFile: stageFileMutation.mutateAsync,
        unstageFile: unstageFileMutation.mutateAsync,
        stageAll: stageAllMutation.mutateAsync,
        unstageAll: unstageAllMutation.mutateAsync,
        commit: commitMutation.mutateAsync,
        push: pushMutation.mutateAsync,
        generateCommitMessage,
        getFileDiff,
        refreshFiles,
        refreshBranch,
        resolveMergeOurs: resolveMergeOursMutation.mutateAsync,
        resolveMergeTheirs: resolveMergeTheirsMutation.mutateAsync,
        abortMerge: abortMergeMutation.mutateAsync,
        resolveFileOurs: resolveFileOursMutation.mutateAsync,
        resolveFileTheirs: resolveFileTheirsMutation.mutateAsync,
        getConflictFileDiff,

        // Loading states
        isStaging: stageFileMutation.isPending || stageAllMutation.isPending,
        isUnstaging: unstageFileMutation.isPending || unstageAllMutation.isPending,
        isCommitting: commitMutation.isPending,
        isPushing: pushMutation.isPending,
        isGeneratingMessage,
        isResolvingMerge: resolveMergeOursMutation.isPending || resolveMergeTheirsMutation.isPending,
        isAbortingMerge: abortMergeMutation.isPending,
        isResolvingFile: resolveFileOursMutation.isPending || resolveFileTheirsMutation.isPending,
    };
}

