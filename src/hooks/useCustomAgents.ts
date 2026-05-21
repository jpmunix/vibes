import { useEffect, useState, useCallback } from "react";
import { customAgentsClient } from "@/ipc/types";
import type { CustomAgentDto } from "@/ipc/types/custom_agents";

export function useCustomAgents() {
  const [customAgents, setCustomAgents] = useState<CustomAgentDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAgents = useCallback(async () => {
    try {
      setLoading(true);
      const agents = await customAgentsClient.list();
      setCustomAgents(agents);
      setError(null);
    } catch (e: any) {
      setError(e.message || "Failed to load custom agents");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  return {
    customAgents,
    loading,
    error,
    reload: loadAgents,
  };
}
