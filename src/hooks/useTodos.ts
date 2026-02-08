import { ipc } from "@/ipc/types";
import { queryKeys } from "@/lib/queryKeys";
import { showError, showSuccess } from "@/lib/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function useTodos(appId: number) {
  const queryClient = useQueryClient();

  const { data: todos = [], isLoading: loading } = useQuery({
    queryKey: queryKeys.todos.byApp({ appId }),
    queryFn: async () => {
      return await ipc.todo.getTodosByApp(appId);
    },
    enabled: !!appId,
  });

  const createTodo = useMutation({
    mutationFn: async (content: string) => {
      return await ipc.todo.createTodo({ appId, content });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.todos.byApp({ appId }),
      });
    },
    onError: (error) => {
      showError(`Error al crear tarea: ${(error as Error).message}`);
    },
  });

  const updateTodo = useMutation({
    mutationFn: async ({
      todoId,
      content,
      description,
      prompt,
      completed,
    }: {
      todoId: number;
      content?: string;
      description?: string | null;
      prompt?: string | null;
      completed?: boolean;
    }) => {
      return await ipc.todo.updateTodo({ todoId, content, description, prompt, completed });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.todos.byApp({ appId }),
      });
      showSuccess("Tarea actualizada");
    },
    onError: (error) => {
      showError(`Error al actualizar tarea: ${(error as Error).message}`);
    },
  });

  const deleteTodo = useMutation({
    mutationFn: async (todoId: number) => {
      await ipc.todo.deleteTodo(todoId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.todos.byApp({ appId }),
      });
      showSuccess("Tarea eliminada");
    },
    onError: (error) => {
      showError(`Error al eliminar tarea: ${(error as Error).message}`);
    },
  });

  const developTodo = useMutation({
    mutationFn: async ({ todoId, prompt }: { todoId: number; prompt?: string }) => {
      return await ipc.todo.developTodo({ todoId, prompt });
    },
    onError: (error) => {
      showError(`Error al crear chat: ${(error as Error).message}`);
    },
  });

  const reorderTodos = useMutation({
    mutationFn: async (todoIds: number[]) => {
      return await ipc.todo.reorderTodos({ appId, todoIds });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.todos.byApp({ appId }),
      });
    },
    onError: (error) => {
      showError(`Error al reordenar tareas: ${(error as Error).message}`);
    },
  });

  const refinePrompt = useMutation({
    mutationFn: async ({ todoId }: { todoId: number }) => {
      const response = await ipc.todo.refineTodoPrompt({ todoId });
      return response.prompt;
    },
    onError: (error) => {
      showError(`Error al refinar prompt: ${(error as Error).message}`);
    },
  });

  return {
    todos,
    loading,
    createTodo: createTodo.mutateAsync,
    updateTodo: updateTodo.mutateAsync,
    deleteTodo: deleteTodo.mutateAsync,
    developTodo: developTodo.mutateAsync,
    reorderTodos: reorderTodos.mutateAsync,
    refinePrompt: refinePrompt.mutateAsync,
  };
}
