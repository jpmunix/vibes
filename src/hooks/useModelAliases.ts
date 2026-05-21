import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ipc } from "@/ipc/types";

const PREF_KEY = "model_aliases";

/** Map of modelApiName → user-defined alias */
export type ModelAliases = Record<string, string>;

export function useModelAliases() {
  const queryClient = useQueryClient();

  const { data: aliases = {} } = useQuery({
    queryKey: ["model_aliases"],
    queryFn: async () => {
      const stored = await ipc.misc.getPreference({ key: PREF_KEY });
      if (!stored) return {};
      try {
        return JSON.parse(stored) as ModelAliases;
      } catch {
        return {};
      }
    },
  });

  const { mutate: setAlias } = useMutation({
    mutationFn: async ({ modelId, alias }: { modelId: string; alias: string }) => {
      const current = queryClient.getQueryData<ModelAliases>(["model_aliases"]) || {};
      const updated = { ...current, [modelId]: alias };

      // Optimistic update
      queryClient.setQueryData(["model_aliases"], updated);

      await ipc.misc.setPreference({
        key: PREF_KEY,
        value: JSON.stringify(updated),
      });
      return updated;
    },
  });

  const { mutate: removeAlias } = useMutation({
    mutationFn: async (modelId: string) => {
      const current = queryClient.getQueryData<ModelAliases>(["model_aliases"]) || {};
      const updated = { ...current };
      delete updated[modelId];

      queryClient.setQueryData(["model_aliases"], updated);

      await ipc.misc.setPreference({
        key: PREF_KEY,
        value: JSON.stringify(updated),
      });
      return updated;
    },
  });

  /** Resolve a display name: returns alias if set, otherwise the original displayName */
  const resolveDisplayName = (modelApiName: string, originalDisplayName: string): string => {
    return aliases[modelApiName] || originalDisplayName;
  };

  return { aliases, setAlias, removeAlias, resolveDisplayName };
}
