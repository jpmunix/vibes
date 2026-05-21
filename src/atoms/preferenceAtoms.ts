/**
 * Preference Atoms — Jotai atom system for the KV preferences store.
 *
 * - `preferencesMapAtom`: holds the full Record<string, string> from the main process cache
 * - `preferenceAtom(key)`: derived atom for a single preference key (reactive)
 *
 * The map is populated once on boot via `hydratePreferences` IPC call,
 * then kept in sync via `preference:changed` events from the main process.
 */
import { atom } from "jotai";

/**
 * Flat map of all user preferences (key → serialized JSON string).
 * Populated on boot from the main process preferences cache.
 */
export const preferencesMapAtom = atom<Record<string, string>>({});

/**
 * Whether preferences have been loaded from the main process.
 */
export const preferencesHydratedAtom = atom<boolean>(false);
