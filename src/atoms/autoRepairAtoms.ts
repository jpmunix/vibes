import { atom } from "jotai";

/**
 * State for the auto-repair system.
 * Tracks whether we're in a monitoring window, currently repairing,
 * and how many attempts have been made in the current cycle.
 */
export interface AutoRepairState {
    /** Whether we're actively watching stderr for Vite compilation errors */
    watching: boolean;
    /** Whether an auto-repair stream is currently in progress */
    repairing: boolean;
    /** Number of auto-repair attempts in the current cycle (reset on new user message) */
    attempts: number;
    /** The chatId to send the fix prompt to */
    chatId: number | null;
    /** Timestamp when the monitoring window started */
    watchStartedAt: number | null;
    /** The detected error message (to avoid re-triggering on the same error) */
    lastDetectedError: string | null;
}

const INITIAL_STATE: AutoRepairState = {
    watching: false,
    repairing: false,
    attempts: 0,
    chatId: null,
    watchStartedAt: null,
    lastDetectedError: null,
};

export const autoRepairStateAtom = atom<AutoRepairState>(INITIAL_STATE);

/** Maximum number of auto-repair attempts per user message cycle */
export const MAX_AUTO_REPAIR_ATTEMPTS = 2;

/** How long (ms) to keep the monitoring window open after onEnd */
export const AUTO_REPAIR_WATCH_WINDOW_MS = 8_000;

/**
 * Set of apps that have been silently started in this session.
 * Prevents re-starting an app that was already started silently.
 */
export const silentlyStartedAppsAtom = atom<Set<number>>(new Set<number>());
