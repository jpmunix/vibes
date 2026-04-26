import { useState, useEffect, useCallback } from "react";
import { useAtom } from "jotai";
import { userSettingsAtom, envVarsAtom } from "@/atoms/appAtoms";
import { ipc } from "@/ipc/types";
import { type UserSettings } from "@/lib/schemas";
import { usePostHog } from "posthog-js/react";
import { useAppVersion } from "./useAppVersion";
import { showSuccess } from "@/lib/toast";

const TELEMETRY_CONSENT_KEY = "vibesTelemetryConsent";
const TELEMETRY_USER_ID_KEY = "vibesTelemetryUserId";

export function isTelemetryOptedIn() {
  return window.localStorage.getItem(TELEMETRY_CONSENT_KEY) === "opted_in";
}

export function getTelemetryUserId(): string | null {
  return window.localStorage.getItem(TELEMETRY_USER_ID_KEY);
}

let isInitialLoad = false;

export function useSettings() {
  const posthog = usePostHog();
  const [settings, setSettingsAtom] = useAtom(userSettingsAtom);
  const [envVars, setEnvVarsAtom] = useAtom(envVarsAtom);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const appVersion = useAppVersion();
  const loadInitialData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch settings and env vars concurrently
      const [userSettings, fetchedEnvVars] = await Promise.all([
        ipc.settings.getUserSettings(),
        ipc.misc.getEnvVars(),
      ]);
      processSettingsForTelemetry(userSettings);
      if (!isInitialLoad && appVersion) {
        posthog.capture("app:initial-load", {
          appVersion,
        });
        isInitialLoad = true;
      }
      setSettingsAtom(userSettings);
      setEnvVarsAtom(fetchedEnvVars);
      setError(null);
    } catch (error) {
      console.error("Error loading initial data:", error);
      setError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      setLoading(false);
    }
  }, [setSettingsAtom, setEnvVarsAtom, appVersion]);

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

  const updateSettings = async (newSettings: Partial<UserSettings>, options?: { showToast?: boolean }) => {
    setLoading(true);
    try {
      const updatedSettings = await ipc.settings.setUserSettings(newSettings);
      setSettingsAtom(updatedSettings);
      processSettingsForTelemetry(updatedSettings);


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

function processSettingsForTelemetry(settings: UserSettings) {
  if (settings.telemetryConsent) {
    window.localStorage.setItem(
      TELEMETRY_CONSENT_KEY,
      settings.telemetryConsent,
    );
  } else {
    window.localStorage.removeItem(TELEMETRY_CONSENT_KEY);
  }
  if (settings.telemetryUserId) {
    window.localStorage.setItem(
      TELEMETRY_USER_ID_KEY,
      settings.telemetryUserId,
    );
  } else {
    window.localStorage.removeItem(TELEMETRY_USER_ID_KEY);
  }
}
