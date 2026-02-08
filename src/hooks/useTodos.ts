import { ipc, type Todo } from "@/ipc/types";
import { queryKeys } from "@/lib/queryKeys";
import { showError, showSuccess } from "@/lib/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export function useTodos(appId: number) {
  const queryClient = useQueryClient();

  const { data: todos = [], isLoading: loadingTodos } = useQuery({
    queryKey: queryKeys.todos.byApp({ appId }),
    queryFn: async () => {
      return await ipc.todo.getTodosByApp(appId);
    },
    enabled: !!appId,
  });

  const { data: sections = [], isLoading: loadingSections } = useQuery({
    queryKey: queryKeys.todos.sections({ appId }),
    queryFn: async () => {
      return await ipc.todo.getTodoSectionsByApp(appId);
    },
    enabled: !!appId,
  });

  const createSection = useMutation({
    mutationFn: async (title: string) => {
      return await ipc.todo.createTodoSection({ appId, title });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.todos.sections({ appId }),
      });
    },
    onError: (error) => {
      showError(`Error al crear sección: ${(error as Error).message}`);
    },
  });

  const updateSection = useMutation({
    mutationFn: async ({
      sectionId,
      title,
      order,
    }: {
      sectionId: number;
      title?: string;
      order?: number;
    }) => {
      return await ipc.todo.updateTodoSection({ sectionId, title, order });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.todos.sections({ appId }),
      });
    },
  });

  const deleteSection = useMutation({
    mutationFn: async (sectionId: number) => {
      await ipc.todo.deleteTodoSection(sectionId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.todos.sections({ appId }),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.todos.byApp({ appId }),
      });
    },
  });

  const createTodo = useMutation({
    mutationFn: async ({
      content,
      sectionId,
    }: {
      content: string;
      sectionId?: number;
    }) => {
      return await ipc.todo.createTodo({ appId, content, sectionId });
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
    mutationFn: async (params: {
      todoId: number;
      sectionId?: number | null;
      content?: string;
      description?: string | null;
      prompt?: string | null;
      completed?: boolean;
      order?: number;
    }) => {
      return await ipc.todo.updateTodo(params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.todos.byApp({ appId }),
      });
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

  const reorderTodos = useMutation({
    mutationFn: async ({
      todoIds,
      sectionId,
    }: {
      todoIds: number[];
      sectionId?: number | null;
    }) => {
      return await ipc.todo.reorderTodos({ appId, todoIds, sectionId });
    },
    onMutate: async ({ todoIds, sectionId }) => {
      // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({
        queryKey: queryKeys.todos.byApp({ appId }),
      });

      // Snapshot the previous value
      const previousTodos = queryClient.getQueryData<Todo[]>(
        queryKeys.todos.byApp({ appId }),
      );

      // Optimistically update to the new value
      if (previousTodos) {
        // Create a map of the new positions for quick lookup
        const orderMap = new Map(todoIds.map((id, index) => [id, index]));

        const resultTodos = previousTodos.map((todo) => {
          // If the item is in the list being reordered
          if (orderMap.has(todo.id)) {
            return {
              ...todo,
              sectionId: sectionId ?? null,
              order: orderMap.get(todo.id)!,
            };
          }
          return todo;
        });

        queryClient.setQueryData(queryKeys.todos.byApp({ appId }), resultTodos);
      }

      return { previousTodos };
    },
    onError: (error, __, context) => {
      if (context?.previousTodos) {
        queryClient.setQueryData(
          queryKeys.todos.byApp({ appId }),
          context.previousTodos,
        );
      }
      showError(`Error al reordenar tareas: ${(error as Error).message}`);
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.todos.byApp({ appId }),
      });
    },
  });

  const reorderSections = useMutation({
    mutationFn: async (sectionIds: number[]) => {
      return await ipc.todo.reorderTodoSections({ appId, sectionIds });
    },
    onMutate: async (sectionIds) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.todos.sections({ appId }),
      });
      const previousSections = queryClient.getQueryData<any[]>(
        queryKeys.todos.sections({ appId }),
      );

      if (previousSections) {
        const orderMap = new Map(sectionIds.map((id, index) => [id, index]));
        const resultSections = previousSections
          .map((section) => ({
            ...section,
            order: orderMap.get(section.id) ?? section.order,
          }))
          .sort((a, b) => a.order - b.order);

        queryClient.setQueryData(
          queryKeys.todos.sections({ appId }),
          resultSections,
        );
      }

      return { previousSections };
    },
    onError: (error, __, context) => {
      if (context?.previousSections) {
        queryClient.setQueryData(
          queryKeys.todos.sections({ appId }),
          context.previousSections,
        );
      }
      showError(`Error al reordenar secciones: ${(error as Error).message}`);
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.todos.sections({ appId }),
      });
    },
  });

  const developTodo = useMutation({
    mutationFn: async ({
      todoId,
      prompt,
    }: {
      todoId: number;
      prompt?: string;
    }) => {
      return await ipc.todo.developTodo({ todoId, prompt });
    },
    onError: (error) => {
      showError(`Error al crear chat: ${(error as Error).message}`);
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

  const smartImport = useMutation({
    mutationFn: async () => {
      const files = await ipc.todo.selectTodoFiles();
      if (files.length === 0) return;

      const analysis = await ipc.todo.analyzeTodoFiles({ appId, files });

      // Create new section
      const section = await ipc.todo.createTodoSection({
        appId,
        title: analysis.listTitle,
      });

      // Create todos in that section
      for (const task of analysis.tasks) {
        await ipc.todo.createTodo({
          appId,
          content: task.content,
          sectionId: section.id,
          description: task.description || undefined,
          completed: task.completed ?? false,
        });
      }

      return section;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.todos.sections({ appId }),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.todos.byApp({ appId }),
      });
      showSuccess("Lista de tareas importada con éxito");
    },
    onError: (error) => {
      showError(`Error en Smart Import: ${(error as Error).message}`);
    },
  });

  return {
    todos,
    sections,
    loading: loadingTodos || loadingSections,
    createSection: createSection.mutateAsync,
    updateSection: updateSection.mutateAsync,
    deleteSection: deleteSection.mutateAsync,
    createTodo: createTodo.mutateAsync,
    updateTodo: updateTodo.mutateAsync,
    deleteTodo: deleteTodo.mutateAsync,
    reorderTodos: reorderTodos.mutateAsync,
    reorderSections: reorderSections.mutateAsync,
    developTodo: developTodo.mutateAsync,
    refinePrompt: refinePrompt.mutateAsync,
    smartImport: smartImport.mutateAsync,
    isImporting: smartImport.isPending,
  };
}
