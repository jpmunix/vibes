import { atom } from "jotai";

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

export const userAtom = atom<VibesUser | null>(null);
export const authLoadingAtom = atom<boolean>(true);
