import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

// Atom to track if any dropdown is currently open in the UI
export const dropdownOpenAtom = atom<boolean>(false);

// Atom to track chat panel position ("left" or "right"), persisted in localStorage
export type ChatPosition = "left" | "right";
export const chatPositionAtom = atomWithStorage<ChatPosition>("chat-position", "left");

// Atom to track if workspace mode is active (persisted)
export const workspaceModeAtom = atomWithStorage<boolean>("workspace-mode", false);
