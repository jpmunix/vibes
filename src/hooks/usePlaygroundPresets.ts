import { useState, useEffect, useCallback, useMemo } from "react";
import { ipc } from "@/ipc/types";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ModelPreset {
    name: string;
    models: string[];
}

export interface PromptPreset {
    name: string;
    prompt: string;
}

// ─── Preference keys ─────────────────────────────────────────────────────────

const MODEL_PRESETS_KEY = "playground_model_presets";
const PROMPT_PRESETS_KEY = "playground_prompt_presets";

// ─── Hook ────────────────────────────────────────────────────────────────────

export function usePlaygroundPresets() {
    const [modelPresets, setModelPresetsState] = useState<ModelPreset[]>([]);
    const [promptPresets, setPromptPresetsState] = useState<PromptPreset[]>([]);
    const [loaded, setLoaded] = useState(false);

    // ── Load from DB ──────────────────────────────────────────────────────
    useEffect(() => {
        (async () => {
            try {
                const raw = await ipc.misc.getPreferences({
                    keys: [MODEL_PRESETS_KEY, PROMPT_PRESETS_KEY],
                    appId: 0,
                });

                if (raw[MODEL_PRESETS_KEY]) {
                    try { setModelPresetsState(JSON.parse(raw[MODEL_PRESETS_KEY])); } catch { /* corrupt */ }
                }
                if (raw[PROMPT_PRESETS_KEY]) {
                    try { setPromptPresetsState(JSON.parse(raw[PROMPT_PRESETS_KEY])); } catch { /* corrupt */ }
                }
            } catch (err) {
                console.error("[PlaygroundPresets] Failed to load:", err);
            }
            setLoaded(true);
        })();
    }, []);

    // ── Persistence helpers ───────────────────────────────────────────────
    const persistModelPresets = useCallback(async (next: ModelPreset[]) => {
        setModelPresetsState(next);
        await ipc.misc.setPreference({
            key: MODEL_PRESETS_KEY,
            value: JSON.stringify(next),
            appId: 0,
        });
    }, []);

    const persistPromptPresets = useCallback(async (next: PromptPreset[]) => {
        setPromptPresetsState(next);
        await ipc.misc.setPreference({
            key: PROMPT_PRESETS_KEY,
            value: JSON.stringify(next),
            appId: 0,
        });
    }, []);

    // ── Model preset CRUD ─────────────────────────────────────────────────
    const saveModelPreset = useCallback(async (name: string, models: string[]) => {
        const trimmed = name.trim();
        if (!trimmed || models.length === 0) return;
        const next = [...modelPresets.filter(p => p.name !== trimmed), { name: trimmed, models }];
        await persistModelPresets(next);
    }, [modelPresets, persistModelPresets]);

    const deleteModelPreset = useCallback(async (name: string) => {
        await persistModelPresets(modelPresets.filter(p => p.name !== name));
    }, [modelPresets, persistModelPresets]);

    const renameModelPreset = useCallback(async (oldName: string, newName: string) => {
        const trimmed = newName.trim();
        if (!trimmed || trimmed === oldName) return;
        const next = modelPresets.map(p => p.name === oldName ? { ...p, name: trimmed } : p);
        await persistModelPresets(next);
    }, [modelPresets, persistModelPresets]);

    // ── Prompt preset CRUD ────────────────────────────────────────────────
    const savePromptPreset = useCallback(async (name: string, prompt: string) => {
        const trimmed = name.trim();
        if (!trimmed || !prompt.trim()) return;
        const next = [...promptPresets.filter(p => p.name !== trimmed), { name: trimmed, prompt }];
        await persistPromptPresets(next);
    }, [promptPresets, persistPromptPresets]);

    const deletePromptPreset = useCallback(async (name: string) => {
        await persistPromptPresets(promptPresets.filter(p => p.name !== name));
    }, [promptPresets, persistPromptPresets]);

    const renamePromptPreset = useCallback(async (oldName: string, newName: string) => {
        const trimmed = newName.trim();
        if (!trimmed || trimmed === oldName) return;
        const next = promptPresets.map(p => p.name === oldName ? { ...p, name: trimmed } : p);
        await persistPromptPresets(next);
    }, [promptPresets, persistPromptPresets]);

    const updatePromptPreset = useCallback(async (name: string, prompt: string) => {
        if (!prompt.trim()) return;
        const next = promptPresets.map(p => p.name === name ? { ...p, prompt } : p);
        await persistPromptPresets(next);
    }, [promptPresets, persistPromptPresets]);

    // ── Migration: import from settings JSON (one-shot) ───────────────────
    const migrateFromSettings = useCallback(async (settingsModelSets: ModelPreset[] | undefined) => {
        if (!settingsModelSets || settingsModelSets.length === 0) return false;
        // Only migrate if DB is empty (never been migrated)
        if (modelPresets.length > 0) return false;
        await persistModelPresets(settingsModelSets);
        return true; // caller should clean up settings
    }, [modelPresets, persistModelPresets]);

    return {
        loaded,
        // Model presets
        modelPresets,
        saveModelPreset,
        deleteModelPreset,
        renameModelPreset,
        // Prompt presets
        promptPresets,
        savePromptPreset,
        deletePromptPreset,
        renamePromptPreset,
        updatePromptPreset,
        // Migration
        migrateFromSettings,
    };
}
