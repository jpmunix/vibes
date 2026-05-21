import { useQuery } from "@tanstack/react-query";
import { ipc } from "@/ipc/types";

export function useChatArtifacts(chatId: number | null) {
  const {
    data: artifacts = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["chatArtifacts", chatId],
    queryFn: async () => {
      if (!chatId) return [];
      return await ipc.chat.getChatArtifacts(chatId);
    },
    enabled: !!chatId,
  });

  return {
    artifacts,
    isLoading,
    invalidateArtifacts: refetch,
  };
}
