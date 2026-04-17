import { useState, useCallback, useEffect, useRef } from "react";
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
    const isMessageUserEdited = useRef(false);
    const lastAutoGenAhead = useRef<number | null>(null);

    // Wrapper to track when the user manually edits the commit message
    const handleSetCommitMessage = useCallback((msg: string) => {
        isMessageUserEdited.current = true;
        setCommitMessage(msg);
    }, []);

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

    // Auto-generate AI commit message when ≥2 local commits ahead of remote
    // (squash scenario — pre-fill so user sees a good message before push)
    useEffect(() => {
        const ahead = gitState?.ahead;
        if (
            !appId ||
            !ahead ||
            ahead < 2 ||
            isMessageUserEdited.current ||
            lastAutoGenAhead.current === ahead
        ) {
            return;
        }
        lastAutoGenAhead.current = ahead;
        let cancelled = false;
        (async () => {
            setIsGeneratingMessage(true);
            try {
                const result = await ipc.github.generateSquashMessage({ appId, aheadCount: ahead });
                if (!cancelled && !isMessageUserEdited.current) {
                    setCommitMessage(result.message);
                }
            } catch (err: any) {
                // Silently fail — user can still type manually
            } finally {
                if (!cancelled) setIsGeneratingMessage(false);
            }
        })();
        return () => { cancelled = true; };
    }, [appId, gitState?.ahead]);

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
            queryClient.invalidateQueries({ queryKey: ["git-state", appId] });
            toast.success("Push realizado correctamente");
        },
        onError: (err: Error) => toast.error(`Error en push: ${err.message}`),
    });

    // Pull mutation
    const pullMutation = useMutation({
        mutationFn: async () => {
            if (!appId) throw new Error("No app selected");
            await ipc.github.pull({ appId });
        },
        onSuccess: () => {
            refreshFiles();
            refreshBranch();
            queryClient.invalidateQueries({ queryKey: ["git-state", appId] });
            queryClient.invalidateQueries({
                queryKey: queryKeys.versions.list({ appId }),
            });
            toast.success("Pull realizado correctamente");
        },
        onError: (err: Error) => toast.error(`Error en pull: ${err.message}`),
    });

    // Fetch mutation
    const fetchMutation = useMutation({
        mutationFn: async () => {
            if (!appId) throw new Error("No app selected");
            await ipc.github.fetch({ appId });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["git-state", appId] });
            toast.success("Fetch realizado correctamente");
        },
        onError: (err: Error) => toast.error(`Error en fetch: ${err.message}`),
    });

    // Generate commit message with AI streaming
    // Pattern: identical to ipc.debateStream.start() in DebatePanel.tsx
    // 1. Register event listeners for token/done/error
    // 2. Fire invoke() without await (fire-and-forget)
    // 3. All data arrives via events, invoke resolves when stream ends
    const generateCommitMessage = useCallback(() => {
        if (!appId) return;
        setIsGeneratingMessage(true);
        setCommitMessage("");

        let accumulated = "";
        let displayed = "";
        const renderQueue: string[] = [];
        let renderInterval: NodeJS.Timeout | null = null;
        let isDone = false;

        const cleanupListeners = () => {
            removeTokenListener?.();
            removeDoneListener?.();
            removeErrorListener?.();
        };

        // Smooth typewriter effect for bursting tokens
        renderInterval = setInterval(() => {
            if (renderQueue.length > 0) {
                // Pull a few chars per tick to ensure we don't take forever but it stays smooth
                const chars = renderQueue.splice(0, Math.max(1, Math.ceil(renderQueue.length / 15)));
                displayed += chars.join("");
                setCommitMessage(displayed);
            } else if (isDone) {
                if (renderInterval) clearInterval(renderInterval);
                setIsGeneratingMessage(false);
                cleanupListeners();
            }
        }, 15);

        const removeTokenListener = window.electron.ipcRenderer.on(
            "git:commit-message-token" as any,
            (payload: any) => {
                accumulated += payload.token;
                for (const char of payload.token) {
                    renderQueue.push(char);
                }
            },
        );

        const removeDoneListener = window.electron.ipcRenderer.on(
            "git:commit-message-done" as any,
            () => {
                isDone = true; 
            },
        );

        const removeErrorListener = window.electron.ipcRenderer.on(
            "git:commit-message-error" as any,
            (payload: any) => {
                toast.error(`Error generando mensaje: ${payload.error}`);
                setCommitMessage(accumulated); // show whatever we got
                isDone = true;
            },
        );

        // Fire-and-forget via the NEW dedicated streaming channel.
        // This bypasses the typed client entirely — direct ipcRenderer.invoke,
        // exactly like debateStreamClient.start() calls ipcRenderer.invoke().
        const filesToPass = uncommittedFiles.map(f => ({ path: f.path, status: f.status }));
        window.electron.ipcRenderer
            .invoke("github:generate-commit-message-stream", { appId, files: filesToPass })
            .catch((err: any) => {
                toast.error(`Error generando mensaje: ${err.message}`);
                setCommitMessage("");
                isDone = true;
            });
    }, [appId, uncommittedFiles]);

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

    // Switch branch mutation
    const switchBranchMutation = useMutation({
        mutationFn: async (branch: string) => {
            if (!appId) throw new Error("No app selected");
            await ipc.github.switchBranch({ appId, branch });
        },
        onSuccess: () => {
            refreshFiles();
            refreshBranch();
            queryClient.invalidateQueries({ queryKey: ["git-state", appId] });
            queryClient.invalidateQueries({ queryKey: ["git-panel", "local-branches", appId] });
            toast.success("Rama cambiada correctamente");
        },
        onError: (err: Error) => toast.error(`Error al cambiar de rama: ${err.message}`),
    });

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
        setCommitMessage: handleSetCommitMessage,

        // Actions
        stageFile: stageFileMutation.mutateAsync,
        unstageFile: unstageFileMutation.mutateAsync,
        stageAll: stageAllMutation.mutateAsync,
        unstageAll: unstageAllMutation.mutateAsync,
        commit: commitMutation.mutateAsync,
        push: pushMutation.mutateAsync,
        pull: pullMutation.mutateAsync,
        fetch: fetchMutation.mutateAsync,
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
        switchBranch: switchBranchMutation.mutateAsync,

        // Loading states
        isStaging: stageFileMutation.isPending || stageAllMutation.isPending,
        isUnstaging: unstageFileMutation.isPending || unstageAllMutation.isPending,
        isCommitting: commitMutation.isPending,
        isPushing: pushMutation.isPending,
        isPulling: pullMutation.isPending,
        isFetching: fetchMutation.isPending,
        isGeneratingMessage,
        isResolvingMerge: resolveMergeOursMutation.isPending || resolveMergeTheirsMutation.isPending,
        isAbortingMerge: abortMergeMutation.isPending,
        isResolvingFile: resolveFileOursMutation.isPending || resolveFileTheirsMutation.isPending,
        isSwitchingBranch: switchBranchMutation.isPending,
    };
}

