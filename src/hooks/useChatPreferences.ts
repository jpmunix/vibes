/**
 * useChatPreference — Per-chat preference persistence hook.
 *
 * Uses the existing KV preferences store (BunnyDB) with `chatId` as the `appId` scope.
 * This gives us per-chat persistence for free without touching the backend.
 *
 * Usage:
 *   const [model, setModel] = useChatPreference<LargeLanguageModel>(chatId, "selectedModel", defaultModel);
 *   const [filters, setFilters] = useChatPreference<ModelFilters>(chatId, "modelFilters", defaultFilters);
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ipc } from "@/ipc/types";

const CHAT_PREF_PREFIX = "chatPref:";

/**
 * Hook to read and write a per-chat preference from the KV store.
 *
 * @param chatId - The chat ID to scope the preference to. If null/undefined, returns defaultValue and setter is a no-op.
 * @param key - The preference key (will be prefixed with "chatPref:")
 * @param defaultValue - Fallback value when the key doesn't exist for this chat
 * @returns [value, setValue, isLoaded] tuple
 */
export function useChatPreference<T>(
  chatId: number | null | undefined,
  key: string,
  defaultValue: T,
): [T, (newValue: T) => void, boolean] {
  const [value, setValue] = useState<T>(defaultValue);
  const [isLoaded, setIsLoaded] = useState(false);
  const prefKey = `${CHAT_PREF_PREFIX}${key}`;
  const prevChatIdRef = useRef<number | null | undefined>(undefined);

  // Load preference when chatId changes
  useEffect(() => {
    if (!chatId || chatId === prevChatIdRef.current) return;
    prevChatIdRef.current = chatId;

    let cancelled = false;

    ipc.misc
      .getPreference({ key: prefKey, appId: chatId })
      .then((stored) => {
        if (cancelled) return;
        if (stored !== null) {
          try {
            setValue(JSON.parse(stored) as T);
          } catch {
            // If not valid JSON, use as-is if T is string
            setValue(stored as unknown as T);
          }
        } else {
          // No stored value for this chat — use default
          setValue(defaultValue);
        }
        setIsLoaded(true);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(
          `Failed to load chat preference "${prefKey}" for chat ${chatId}:`,
          err,
        );
        setValue(defaultValue);
        setIsLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [chatId, prefKey]); // intentionally omit defaultValue to avoid reset loops

  const setPreference = useCallback(
    (newValue: T) => {
      // Optimistic UI update
      setValue(newValue);

      if (!chatId) return;

      const serialized =
        typeof newValue === "string" ? newValue : JSON.stringify(newValue);

      // Persist to KV store with chatId as appId scope
      ipc.misc
        .setPreference({ key: prefKey, value: serialized, appId: chatId })
        .catch((err) => {
          console.error(
            `Failed to persist chat preference "${prefKey}" for chat ${chatId}:`,
            err,
          );
        });
    },
    [chatId, prefKey],
  );

  return [value, setPreference, isLoaded];
}
