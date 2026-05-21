import { useSettings } from "@/hooks/useSettings";
import { useLanguageModelsForProvider } from "@/hooks/useLanguageModelsForProvider";
import { SettingsModelSelector } from "../SettingsModelSelector";

const DEFAULT_MODEL = "qwen/qwen3-coder";

/**
 * Model selector for the memory synthesis (generator) pipeline.
 * Same pattern as StandardModeModelSelector but writes to `memoriesSynthesisModelV2`.
 * Uses the full OpenRouter model list — no hardcoded special options.
 * Default (`qwen/qwen3-coder`) only applies when the setting has never been set.
 */
export function MemoryExtractionModelSelector() {
    const { settings, updateSettings } = useSettings();
    const { data: openRouterModels, isLoading } =
        useLanguageModelsForProvider("openrouter");

    const currentValue =
        !settings?.memoriesSynthesisModelV2 || settings?.memoriesSynthesisModelV2 === ""
            ? DEFAULT_MODEL
            : settings?.memoriesSynthesisModelV2;

    const handleChange = async (value: string) => {
        await updateSettings(
            { memoriesSynthesisModelV2: value },
            { showToast: true },
        );
    };

    return (
        <SettingsModelSelector
            variant="pill"
            selectedModel={currentValue}
            onModelSelect={handleChange}
            models={openRouterModels || []}
            loading={isLoading}
            placeholder="Selecciona un modelo"
            disableEnabledFilter
        />
    );
}
