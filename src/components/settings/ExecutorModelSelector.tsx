import { useSettings } from "@/hooks/useSettings";
import { useMultiProviderModels } from "@/hooks/useMultiProviderModels";
import { SettingsModelSelector } from "../SettingsModelSelector";
import { DEFAULT_EXECUTOR_MODEL, MODEL_PROVIDER_SEPARATOR } from "@/lib/schemas";

const DEFAULT_MODEL = DEFAULT_EXECUTOR_MODEL;

/**
 * Selector for the "Modelo Ejecutor" — lightweight tasks (titles, summaries,
 * compaction, mockups, commit messages, etc.).
 * Uses the `executorModel` settings key.
 *
 * v2: Shows models from ALL providers (OpenRouter + Ollama).
 * Values with a provider prefix (e.g. "ollama::qwen2.5-coder:7b") are stored
 * as-is, enabling cross-provider routing in the adapter.
 */
export function ExecutorModelSelector() {
    const { settings, updateSettings } = useSettings();
    const { data: allModels, isLoading } = useMultiProviderModels();

    const currentValue =
        !settings?.executorModel || settings?.executorModel === ""
            ? DEFAULT_MODEL
            : settings?.executorModel;

    const handleChange = async (value: string) => {
        await updateSettings(
            { executorModel: value },
            { showToast: true },
        );
    };

    // Find the default model in the list for display
    const defaultModelInList = allModels?.find(
        (m) => m.apiName === DEFAULT_MODEL,
    );

    // Filter out the default so it only appears in the "special" section
    const filteredModels = (allModels || []).filter(
        (m) => m.apiName !== DEFAULT_MODEL,
    );

    return (
        <SettingsModelSelector
            variant="pill"
            selectedModel={currentValue}
            onModelSelect={handleChange}
            models={filteredModels}
            loading={isLoading}
            placeholder="Selecciona un modelo"
            disableEnabledFilter
            showProviderBadge
            specialOptions={[
                {
                    value: DEFAULT_MODEL,
                    label:
                        defaultModelInList?.displayName || "Gemini 2.5 Flash Lite (recomendado)",
                    description: defaultModelInList ? undefined : "Modelo predeterminado",
                },
            ]}
        />
    );
}

