import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

/**
 * Custom user type for Vibes auth (replaces Firebase User)
 */
export interface VibesUser {
    id: string;
    email: string;
    displayName: string;
    photoUrl: string | null;
    createdAt: number;
}

export const userAtom = atomWithStorage<VibesUser | null>("vibes_user", null);
export const authLoadingAtom = atom<boolean>(true);
