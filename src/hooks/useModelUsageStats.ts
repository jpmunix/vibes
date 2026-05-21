import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ipc } from "@/ipc/types";

const PREF_KEY = "model_usage_stats";

/**
 * Each value is a timestamp (Date.now()) of the last time the model was used.
 * Higher values = more recently used.
 * This also serves as a boolean "has been used" check since any timestamp > 0.
 */
type ModelStats = Record<string, number>;

export function useModelUsageStats() {
  const queryClient = useQueryClient();

  const { data: stats = {} } = useQuery({
    queryKey: ["model_usage_stats"],
    queryFn: async () => {
      const stored = await ipc.misc.getPreference({ key: PREF_KEY });
      if (!stored) return {};
      try {
        return JSON.parse(stored) as ModelStats;
      } catch {
        return {};
      }
    },
  });

  const { mutate: incrementUsage } = useMutation({
    mutationFn: async (modelId: string) => {
      const currentStats = queryClient.getQueryData<ModelStats>(["model_usage_stats"]) || {};
      const newStats = {
        ...currentStats,
        [modelId]: Date.now(),
      };
      
      // Update cache optimistically
      queryClient.setQueryData(["model_usage_stats"], newStats);
      
      await ipc.misc.setPreference({
        key: PREF_KEY,
        value: JSON.stringify(newStats),
      });
      return newStats;
    },
  });

  const { mutate: removeUsage } = useMutation({
    mutationFn: async (modelId: string) => {
      const currentStats = queryClient.getQueryData<ModelStats>(["model_usage_stats"]) || {};
      const newStats = { ...currentStats };
      delete newStats[modelId];
      
      queryClient.setQueryData(["model_usage_stats"], newStats);
      
      await ipc.misc.setPreference({
        key: PREF_KEY,
        value: JSON.stringify(newStats),
      });
      return newStats;
    },
  });

  return { stats, incrementUsage, removeUsage };
}
