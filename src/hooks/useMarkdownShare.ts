import { useMutation } from "@tanstack/react-query";
import { ipc } from "@/ipc/types";
import type { MarkdownShareDocument } from "@/ipc/types/markdown-share";

interface UploadParams {
  title: string;
  content: string;
  format?: "md" | "txt";
}

/**
 * Hook to upload documents to md.mnstatic.com.
 *
 * @example
 * ```tsx
 * const { upload, isLoading, data, error } = useMarkdownShare();
 *
 * // Upload markdown
 * const result = await upload({
 *   title: "My Note",
 *   content: "# Hello\n\nWorld",
 *   format: "md",
 * });
 * console.log(result.share_url);
 *
 * // Upload plain text
 * await upload({ title: "Log output", content: logText, format: "txt" });
 * ```
 */
export function useMarkdownShare() {
  const mutation = useMutation<
    { data: MarkdownShareDocument },
    Error,
    UploadParams
  >({
    mutationFn: (params) =>
      ipc.markdownShare.uploadDocument({
        title: params.title,
        content: params.content,
        format: params.format ?? "md",
      }),
  });

  return {
    /** Trigger an upload. Returns a promise with the uploaded document data. */
    upload: async (params: UploadParams): Promise<MarkdownShareDocument> => {
      const result = await mutation.mutateAsync(params);
      return result.data;
    },
    /** Whether an upload is in progress. */
    isLoading: mutation.isPending,
    /** The last successfully uploaded document. */
    data: mutation.data?.data ?? null,
    /** The last error, if any. */
    error: mutation.error,
    /** Reset the mutation state. */
    reset: mutation.reset,
  };
}
