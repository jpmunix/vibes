import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    ipc,
    FirebaseProject,
    FirebaseWebConfig,
    SetFirebaseAppProjectParams
} from "@/ipc/types";
import { useSettings } from "./useSettings";
import { queryKeys } from "@/lib/queryKeys";

export function useFirebase() {
    const queryClient = useQueryClient();
    const { settings } = useSettings();
    const isConnected = !!settings.firebase?.accessToken;

    // Query: Load all Firebase projects
    const projectsQuery = useQuery<FirebaseProject[], Error>({
        queryKey: queryKeys.firebase.projects,
        queryFn: async () => {
            return ipc.firebase.listProjects();
        },
        enabled: isConnected,
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

    // Function to get config for a project
    const getProjectConfig = async (projectId: string): Promise<FirebaseWebConfig> => {
        return ipc.firebase.getProjectWebConfig({ projectId });
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

        // Actions
        refetchProjects: projectsQuery.refetch,
        setAppProject: setAppProjectMutation.mutateAsync,
        unsetAppProject: unsetAppProjectMutation.mutateAsync,
        getProjectConfig,
    };
}
