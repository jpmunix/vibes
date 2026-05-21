/**
 * usePreference — React hook for reading/writing a single preference from the KV store.
 *
 * Usage:
 *   const [lang, setLang] = usePreference<string>("chatLanguage", "es");
 *   const [model, setModel] = usePreference<SelectedModel>("selectedModel", defaultModel);
 *
 * How it works:
 * - Reads from the global `preferencesMapAtom` (hydrated on boot from BunnyDB).
 * - Writes go through IPC → cache → async DB → broadcast to other windows.
 * - Listens for `preference:changed` events for cross-window sync.
 * - Values are stored as JSON strings in the DB; this hook handles serialization.
 */
import { useCallback, useEffect, useMemo } from "react";
import { useAtom } from "jotai";
import { preferencesMapAtom, preferencesHydratedAtom } from "@/atoms/preferenceAtoms";
import { ipc } from "@/ipc/types";

/**
 * Hook to read and write a single preference from the KV store.
 *
 * @param key - The preference key (e.g. "chatLanguage", "selectedModel")
 * @param defaultValue - Fallback value when the key doesn't exist in the store
 * @returns [value, setValue] tuple — same ergonomics as useState
 */
export function usePreference<T>(key: string, defaultValue: T): [T, (newValue: T) => void] {
  const [prefsMap, setPrefsMap] = useAtom(preferencesMapAtom);

  // Parse the stored JSON string into the expected type
  const value = useMemo<T>(() => {
    const raw = prefsMap[key];
    if (raw === undefined || raw === null) return defaultValue;
    try {
      return JSON.parse(raw) as T;
    } catch {
      // If it's a plain string that isn't valid JSON, return it directly
      return raw as unknown as T;
    }
  }, [prefsMap, key, defaultValue]);

  const setValue = useCallback(
    (newValue: T) => {
      const serialized = typeof newValue === "string"
        ? newValue
        : JSON.stringify(newValue);

      // 1. Optimistic update of the Jotai atom (instant UI update)
      setPrefsMap((prev) => ({ ...prev, [key]: serialized }));

      // 2. IPC call to main process → cache → DB → broadcast
      ipc.misc.setPreference({ key, value: serialized }).catch((err) => {
        console.error(`Failed to persist preference "${key}":`, err);
      });
    },
    [key, setPrefsMap],
  );

  return [value, setValue];
}

/**
 * Hook to hydrate all preferences from the main process on boot.
 * Should be called once in the root layout/provider.
 */
export function useHydratePreferences() {
  const [, setPrefsMap] = useAtom(preferencesMapAtom);
  const [hydrated, setHydrated] = useAtom(preferencesHydratedAtom);

  useEffect(() => {
    if (hydrated) return;

    ipc.misc
      .hydratePreferences()
      .then((allPrefs) => {
        setPrefsMap(allPrefs);
        setHydrated(true);
      })
      .catch((err) => {
        console.error("Failed to hydrate preferences:", err);
      });
  }, [hydrated, setPrefsMap, setHydrated]);

  // Listen for cross-window preference changes
  useEffect(() => {
    // @ts-ignore — window.electron typing
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

  return hydrated;
}
