import { atom } from "jotai";
import type { App, Version, ConsoleEntry } from "@/ipc/types";
import type { ListedApp } from "@/ipc/types/app";
import type { UserSettings } from "@/lib/schemas";

export const currentAppAtom = atom<App | null>(null);
export const selectedAppIdAtom = atom<number | null>(null);
export const appsListAtom = atom<ListedApp[]>([]);
export const versionsListAtom = atom<Version[]>([]);
export const previewModeAtom = atom<
  | "preview"
  | "code"
  | "problems"
  | "configure"
  | "publish"
  | "versions"
  | "database"
>("preview");
export const selectedVersionIdAtom = atom<string | null>(null);

// Cap console entries to match backend MAX_LOGS_PER_APP to prevent
// unbounded growth causing increasingly expensive re-renders.
const MAX_CONSOLE_ENTRIES = 1000;
const _consoleEntriesBaseAtom = atom<ConsoleEntry[]>([]);
export const appConsoleEntriesAtom = atom(
  (get) => get(_consoleEntriesBaseAtom),
  (
    _get,
    set,
    update: ConsoleEntry[] | ((prev: ConsoleEntry[]) => ConsoleEntry[]),
  ) => {
    set(_consoleEntriesBaseAtom, (prev) => {
      const next = typeof update === "function" ? update(prev) : update;
      return next.length > MAX_CONSOLE_ENTRIES
        ? next.slice(next.length - MAX_CONSOLE_ENTRIES)
        : next;
    });
  },
);
export const appUrlAtom = atom<
  | { appUrl: string; appId: number; originalUrl: string }
  | { appUrl: null; appId: null; originalUrl: null }
>({ appUrl: null, appId: null, originalUrl: null });
export const userSettingsAtom = atom<UserSettings | null>(null);

// Atom for storing allow-listed environment variables
export const envVarsAtom = atom<Record<string, string | undefined>>({});

export const previewPanelKeyAtom = atom<number>(0);

// Stores the current preview URL to preserve route across HMR-induced remounts
// Maps appId to the current URL for that app
export const previewCurrentUrlAtom = atom<Record<number, string>>({});

// Per-app route history for the address bar combobox
// Maps appId to an ordered list of visited paths (most recent first, max 10)
export const routeHistoryAtom = atom<Record<number, string[]>>({});

export const previewErrorMessageAtom = atom<
  { message: string; source: "preview-app" | "vibes-app" } | undefined
>(undefined);
