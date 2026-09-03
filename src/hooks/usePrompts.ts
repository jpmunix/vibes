import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ipc } from "@/ipc/types";
import type { PromptDto } from "@/ipc/types";
import { queryKeys } from "@/lib/queryKeys";

/**
 * PromptItem = PromptDto (el wire type). El hook usePrompts devuelve
 * exactamente lo que ipc.prompt.list() trae: PromptDto[].
 * Los consumidores (library.tsx, PromptsSection) consumen PromptDto directo.
 */
export type PromptItem = PromptDto;

export function usePrompts() {
  const queryClient = useQueryClient();
  const listQuery = useQuery({
    queryKey: queryKeys.prompts.all,
    queryFn: async (): Promise<PromptItem[]> => {
      return ipc.prompt.list();
    },
    meta: { showErrorToast: true },
  });

  const createMutation = useMutation({
    mutationFn: async (params: {
      title: string;
      description?: string;
      content: string;
    }): Promise<PromptItem> => {
      return ipc.prompt.create(params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.prompts.all });
    },
    meta: {
      showErrorToast: true,
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (params: {
      id: number;
      title: string;
      description?: string;
      content: string;
    }): Promise<void> => {
      return ipc.prompt.update(params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.prompts.all });
    },
    meta: {
      showErrorToast: true,
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number): Promise<void> => {
      return ipc.prompt.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.prompts.all });
    },
    meta: {
      showErrorToast: true,
    },
  });

  return {
    prompts: listQuery.data ?? [],
    isLoading: listQuery.isLoading,
    error: listQuery.error,
    refetch: listQuery.refetch,
    createPrompt: createMutation.mutateAsync,
    updatePrompt: updateMutation.mutateAsync,
    deletePrompt: deleteMutation.mutateAsync,
  };
}
