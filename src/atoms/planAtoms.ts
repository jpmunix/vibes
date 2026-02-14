import { atom } from "jotai";

// --- Plan Item Types ---

export interface PlanTask {
    id: string;
    text: string;
    checked: boolean;
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

// --- Plan State ---

/** The current plan (null = no plan generated yet) */
export const planAtom = atom<Plan | null>(null);

/** Whether the plan panel is collapsed */
export const planCollapsedAtom = atom<boolean>(true);

/** Whether the plan is in read-only mode (after sending to development) */
export const planReadOnlyAtom = atom<boolean>(false);

/** Whether the plan is currently being generated/updated by the AI */
export const planLoadingAtom = atom<boolean>(false);

/** The text input value for plan modification requests */
export const planInputValueAtom = atom<string>("");
