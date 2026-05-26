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

export function getUltimateBaseAgent(baseAgent: string, allAgents: CustomAgentDto[]): "build" | "plan" | "explore" {
  let currentBase = baseAgent;
  const visited = new Set<number>();
  while (currentBase.startsWith("custom-agent::")) {
    const parentId = parseInt(currentBase.split("::")[1]);
    if (visited.has(parentId)) break;
    visited.add(parentId);
    const parent = allAgents.find(a => a.id === parentId);
    if (!parent) break;
    currentBase = parent.baseAgent;
  }
  if (currentBase === "build" || currentBase === "plan" || currentBase === "explore") {
    return currentBase;
  }
  return "build";
}

export function resolveEffectiveChatMode(mode: string, allAgents: CustomAgentDto[]): "build" | "plan" | "explore" {
  if (mode === "agent" || mode === "build") return "build";
  if (mode === "plan") return "plan";
  if (mode === "ask" || mode === "explore") return "explore";
  if (mode.startsWith("custom-agent::")) {
    return getUltimateBaseAgent(mode, allAgents);
  }
  return "build";
}

