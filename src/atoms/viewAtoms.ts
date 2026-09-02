import { atom } from "jotai";

export const isPreviewOpenAtom = atom(true);
export const isPreviewExpandedAtom = atom(false);
export const selectedFileAtom = atom<{
  path: string;
  line?: number | null;
} | null>(null);
export const activeSettingsSectionAtom = atom<string | null>(
  "general-settings",
);

// Ephemeral flag: set to true right after the user creates a new empty
// project. Consumed by ChatInput to show the DesignPicker exactly once —
// when the event happens — and never again until another project is created.
// Reset to false as soon as the user types a message, switches app, or
// switches chat. Lives only in memory (not persisted).
export const justCreatedAppAtom = atom(false);
