import { useState, useEffect, useCallback } from "react";
import { useAtom } from "jotai";
import { appsListAtom } from "@/atoms/appAtoms";
import { ipc } from "@/ipc/types";
import type { ListedApp } from "@/ipc/types/app";

/**
 * Module-level singleton to deduplicate concurrent listApps IPC calls.
 * When multiple components mount simultaneously and all trigger refreshApps(),
 * only ONE actual IPC call is made. All callers share the same Promise.
 * Once resolved, the next call will create a fresh request.
 */
let inflightRequest: Promise<{ apps: ListedApp[] }> | null = null;

function fetchAppsSingleton(): Promise<{ apps: ListedApp[] }> {
  if (!inflightRequest) {
    inflightRequest = ipc.app.listApps().finally(() => {
      inflightRequest = null;
    });
  }
  return inflightRequest;
}

export function useLoadApps() {
  const [apps, setApps] = useAtom(appsListAtom);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refreshApps = useCallback(async () => {
    setLoading(true);
    try {
      const appListResponse = await fetchAppsSingleton();
      setApps(appListResponse.apps);
      setError(null);
    } catch (error) {
      console.error("Error refreshing apps:", error);
      setError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      setLoading(false);
    }
  }, [setApps, setError, setLoading]);

  useEffect(() => {
    refreshApps();
  }, [refreshApps]);

  return { apps, loading, error, refreshApps };
}
