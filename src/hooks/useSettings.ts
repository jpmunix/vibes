import { useState, useEffect, useCallback } from "react";
import { useAtom } from "jotai";
import { userSettingsAtom, envVarsAtom } from "@/atoms/appAtoms";
import { preferencesMapAtom, preferencesHydratedAtom } from "@/atoms/preferenceAtoms";
import { ipc } from "@/ipc/types";
import { type UserSettings } from "@/lib/schemas";
import { useAppVersion } from "./useAppVersion";
import { showSuccess } from "@/lib/toast";

export function useSettings() {
  const [settings, setSettingsAtom] = useAtom(userSettingsAtom);
  const [envVars, setEnvVarsAtom] = useAtom(envVarsAtom);
  const [, setPrefsMap] = useAtom(preferencesMapAtom);
  const [, setPrefsHydrated] = useAtom(preferencesHydratedAtom);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const appVersion = useAppVersion();
  const loadInitialData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch settings, env vars, and preferences concurrently
      const [userSettings, fetchedEnvVars, allPrefs] = await Promise.all([
        ipc.settings.getUserSettings(),
        ipc.misc.getEnvVars(),
        ipc.misc.hydratePreferences().catch(() => ({} as Record<string, string>)),
      ]);

      setSettingsAtom(userSettings);
      setEnvVarsAtom(fetchedEnvVars);

      // Hydrate the preferences map for usePreference() consumers
      setPrefsMap(allPrefs);
      setPrefsHydrated(true);

      setError(null);
    } catch (error) {
      console.error("Error loading initial data:", error);
      setError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      setLoading(false);
    }
  }, [setSettingsAtom, setEnvVarsAtom, setPrefsMap, setPrefsHydrated, appVersion]);

  useEffect(() => {
    // Only run once on mount, dependencies are stable getters/setters
    loadInitialData();
  }, [loadInitialData]);

  // ── Backend-initiated settings push ──────────────────────────────────
  // When the main process modifies settings directly (e.g. permission
  // persistence during an agent session), it broadcasts the updated
  // settings object via the "settings:updated-from-backend" channel.
  // We listen here to keep the Jotai atom in sync without a full IPC
  // round-trip through getUserSettings (which merges with Bunny DB).
  useEffect(() => {
    // @ts-ignore
    const unsubscribe = window.electron?.ipcRenderer?.on(
      "settings:updated-from-backend" as any,
      (updatedSettings: any) => {
        if (updatedSettings && typeof updatedSettings === "object") {
          setSettingsAtom(updatedSettings);
        }
      },
    );
    return () => { unsubscribe?.(); };
  }, [setSettingsAtom]);

  // ── Cross-window preference changes ──────────────────────────────────
  // Keep the preferences map in sync when another window changes a pref
  useEffect(() => {
    // @ts-ignore
    const unsubscribe = window.electron?.ipcRenderer?.on(
      "preference:changed" as any,
      (data: { key: string; value: string | null }) => {
        if (data && data.key) {
          setPrefsMap((prev) => {
            if (data.value === null) {
              const next = { ...prev };
              delete next[data.key];
              return next;
            }
            return { ...prev, [data.key]: data.value };
          });
        }
      },
    );
    return () => { unsubscribe?.(); };
  }, [setPrefsMap]);

  const updateSettings = async (newSettings: Partial<UserSettings>, options?: { showToast?: boolean }) => {
    setLoading(true);
    try {
      const updatedSettings = await ipc.settings.setUserSettings(newSettings);
      setSettingsAtom(updatedSettings);

      // Also sync the preferences map for usePreference() consumers
      // Convert the updated settings to the preferences map format
      for (const [key, value] of Object.entries(newSettings)) {
        if (value !== undefined) {
          const serialized = typeof value === "string" ? value : JSON.stringify(value);
          setPrefsMap((prev) => ({ ...prev, [key]: serialized }));
        }
      }

      setError(null);
      if (options?.showToast) {
        showSuccess("Ajustes guardados");
      }
      return updatedSettings;
    } catch (error) {
      console.error("Error updating settings:", error);
      setError(error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      setLoading(false);
    }
  };

  return {
    settings,
    envVars,
    loading,
    error,
    updateSettings,

    refreshSettings: () => {
      return loadInitialData();
    },
  };
}


