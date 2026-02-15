import { atom } from "jotai";

// --- Plan Item Types ---

export interface PlanTask {
    id: string;
    text: string;
    checked: boolean;
    isDeveloped?: boolean;
}

export interface PlanStage {
    id: string;
    title: string;
    summary: string;
    tasks: PlanTask[];
}

export interface Plan {
    objective: string;
    stages: PlanStage[];
}

// --- Plan State (Scoped by Chat ID) ---

/** Plans stored by chatId */
export const plansByChatIdAtom = atom<Map<number, Plan>>(new Map());

/** Collapsed state by chatId (default: true) */
export const planCollapsedByChatIdAtom = atom<Map<number, boolean>>(new Map());

/** Read-only state by chatId (default: false) */
export const planReadOnlyByChatIdAtom = atom<Map<number, boolean>>(new Map());

/** Loading state by chatId (default: false) */
export const planLoadingByChatIdAtom = atom<Map<number, boolean>>(new Map());

/** Input values by chatId */
export const planInputValueByChatIdAtom = atom<Map<number, string>>(new Map());
