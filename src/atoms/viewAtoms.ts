import { atom } from "jotai";

export const isPreviewOpenAtom = atom(true);
export const isVersionPaneOpenAtom = atom(false);
export const selectedFileAtom = atom<{
  path: string;
  line?: number | null;
} | null>(null);
export const activeSettingsSectionAtom = atom<string | null>(
  "general-settings",
);
