import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { ipc } from "@/ipc/types";

export function useNote(noteId: number | null) {
  const { data: note, isLoading: loading } = useQuery({
    queryKey: queryKeys.notes.detail({ noteId }),
    queryFn: async () => {
      if (!noteId) return null;
      return await ipc.note.getNote(noteId);
    },
    enabled: !!noteId,
  });

  return {
    note,
    loading,
  };
}
