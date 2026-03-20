import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    ipc,
    FirebaseProject,
    FirebaseWebConfig,
    SetFirebaseAppProjectParams,
    CreateFirebaseProjectParams
} from "@/ipc/types";
import { useSettings } from "./useSettings";
import { queryKeys } from "@/lib/queryKeys";

export function useFirebase() {
    const queryClient = useQueryClient();
    const { settings, refreshSettings } = useSettings();
    const isConnected = !!settings?.firebase?.accessToken;

    // Query: Load all Firebase projects
    const projectsQuery = useQuery<FirebaseProject[], Error>({
        queryKey: queryKeys.firebase.projects,
        queryFn: async () => {
            return ipc.firebase.listProjects();
        },
        enabled: isConnected,
        staleTime: 0, // Always consider data stale
        refetchOnMount: "always", // Force refetch EVERY time the component mounts
        refetchOnWindowFocus: true, // Sync when returning from browser (Google Cloud Console)
        meta: { showErrorToast: true },
    });

    // Mutation: Associate a Firebase project with an app
    const setAppProjectMutation = useMutation<
        void,
        Error,
        SetFirebaseAppProjectParams
    >({
        mutationFn: async (params) => {
            await ipc.firebase.setAppProject(params);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.apps.all });
        },
        meta: { showErrorToast: true },
    });

    // Mutation: Remove a Firebase project association from an app
    const unsetAppProjectMutation = useMutation<void, Error, number>({
        mutationFn: async (appId) => {
            await ipc.firebase.unsetAppProject({ appId });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.apps.all });
        },
        meta: { showErrorToast: true },
    });

    // Mutation: Disconnect Firebase account
    const disconnectMutation = useMutation<void, Error, void>({
        mutationFn: async () => {
            await ipc.firebase.disconnect();
        },
        onSuccess: async () => {
            // Reset queries to clear cache and stop any background refetching
            queryClient.resetQueries({ queryKey: queryKeys.firebase.all });
            await refreshSettings();
        },
        meta: { showErrorToast: true },
    });

    // Mutation: Create a new Firebase project
    const createProjectMutation = useMutation<
        FirebaseProject,
        Error,
        { projectId: string; displayName: string }
    >({
        mutationFn: async (params) => {
            return await ipc.firebase.createProject(params);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.firebase.projects });
        },
        meta: { showErrorToast: true },
    });

    // Function to get config for a project
    const getProjectConfig = async (projectId: string, appId?: string, displayName?: string): Promise<FirebaseWebConfig> => {
        return ipc.firebase.getProjectWebConfig({ projectId, appId, displayName });
    };

    const listWebApps = async (projectId: string) => {
        return ipc.firebase.listWebApps({ projectId });
    };

    const createWebApp = async (projectId: string, displayName: string) => {
        return ipc.firebase.createWebApp({ projectId, displayName });
    };

    return {
        // Data
        projects: projectsQuery.data ?? [],
        isConnected,

        // Query state
        isLoadingProjects: projectsQuery.isLoading,
        isFetchingProjects: projectsQuery.isFetching,
        projectsError: projectsQuery.error,

        // Mutation states
        isSettingAppProject: setAppProjectMutation.isPending,
        isUnsettingAppProject: unsetAppProjectMutation.isPending,
        isDisconnecting: disconnectMutation.isPending,
        isCreatingProject: createProjectMutation.isPending,

        // Actions
        refetchProjects: projectsQuery.refetch,
        setAppProject: setAppProjectMutation.mutateAsync,
        unsetAppProject: unsetAppProjectMutation.mutateAsync,
        disconnect: disconnectMutation.mutateAsync,
        createProject: createProjectMutation.mutateAsync,
        getProjectConfig,
        listWebApps,
        createWebApp,
    };
}
