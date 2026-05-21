import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ipc } from "@/ipc/types";

export type ArtifactComment = {
  id: number;
  artifactId: number;
  selectedText: string | null;
  blockRef: string | null;
  comment: string;
  createdAt: Date;
};

export function useArtifactComments(artifactId: number | null) {
  const queryClient = useQueryClient();
  const queryKey = ["artifactComments", artifactId];

  const {
    data: comments = [],
    isLoading,
  } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!artifactId) return [];
      return await ipc.chat.getArtifactComments(artifactId);
    },
    enabled: !!artifactId,
  });

  const addComment = useMutation({
    mutationFn: (params: {
      selectedText: string | null;
      blockRef: string | null;
      comment: string;
    }) => {
      if (!artifactId) throw new Error("No artifact selected");
      return ipc.chat.addArtifactComment({
        artifactId,
        ...params,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const updateComment = useMutation({
    mutationFn: (params: { commentId: number; comment: string }) => {
      return ipc.chat.updateArtifactComment(params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const deleteComment = useMutation({
    mutationFn: (commentId: number) => {
      return ipc.chat.deleteArtifactComment(commentId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    comments: comments as ArtifactComment[],
    isLoading,
    addComment,
    updateComment,
    deleteComment,
  };
}
