import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { ipc } from "@/ipc/types";

export function useNotes() {
  const queryClient = useQueryClient();

  const { data: notes = [], isLoading: loading } = useQuery({
    queryKey: queryKeys.notes.all,
    queryFn: async () => {
      return await ipc.note.getNotes();
    },
  });

  const invalidateNotes = async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.notes.all });
  };

  return {
    notes,
    loading,
    invalidateNotes,
  };
}
