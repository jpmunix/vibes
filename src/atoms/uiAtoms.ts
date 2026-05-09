import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

// Atom to track if any dropdown is currently open in the UI
export const dropdownOpenAtom = atom<boolean>(false);

// Atom to track chat panel position ("left" or "right"), persisted in localStorage
export type ChatPosition = "left" | "right";
export const chatPositionAtom = atomWithStorage<ChatPosition>("chat-position", "left");

// Atom to track if workspace mode is active (persisted)
export const workspaceModeAtom = atomWithStorage<boolean>("workspace-mode", false);

// ── Sidebar action triggers ──
// These atoms are set by the TopNavbar dropdown menus and consumed by the
// sidebar list components (AppList, WorkspaceList) to trigger their actions.
// The timestamp ensures each trigger is unique.
export type SidebarAction =
  | "apps:new"
  | "apps:import"
  | "apps:search"
  | "apps:bulk-close"
  | "workspace:new-project"
  | "workspace:open-folder"
  | "workspace:search"
  | "workspace:bulk-close"
  | null;

export const sidebarActionAtom = atom<{ action: SidebarAction; ts: number } | null>(null);

// Atoms for artifacts UI
export const artifactsSidebarOpenAtom = atom<boolean>(false);
export const selectedArtifactPathAtom = atom<string | null>(null);

// Atom to track if the release notes rocket button should be shown (transient state for the session)
export const showReleaseNotesBadgeAtom = atom<boolean>(false);
