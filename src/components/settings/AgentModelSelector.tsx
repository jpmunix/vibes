import { useSettings } from "@/hooks/useSettings";
import { useLanguageModelsForProvider } from "@/hooks/useLanguageModelsForProvider";
import { SettingsModelSelector } from "../SettingsModelSelector";
import { DEFAULT_AGENT_MODEL } from "@/lib/schemas";

/** All supported agent IDs that can have model overrides */
export type AgentId = "plan" | "explore" | "general" | "compaction" | "title" | "summary" | "mockup";

interface AgentModelSelectorProps {
    agentId: AgentId;
}

/**
 * Selector for per-agent model overrides.
 * Uses agentModels[agentId] from settings. Falls back to DEFAULT_AGENT_MODEL.
 * Selecting the default option resets to the global default.
 */
export function AgentModelSelector({ agentId }: AgentModelSelectorProps) {
    const { settings, updateSettings } = useSettings();
    const { data: openRouterModels, isLoading } =
        useLanguageModelsForProvider("openrouter");

    const currentValue =
        settings?.agentModels?.[agentId] ?? DEFAULT_AGENT_MODEL;

    const handleChange = async (value: string) => {
        const current = settings?.agentModels || {};
        await updateSettings(
            {
                agentModels: {
                    ...current,
                    // If selecting the default, clear the override so DEFAULT_AGENT_MODEL is used
                    [agentId]: value === DEFAULT_AGENT_MODEL ? undefined : value,
                },
            },
            { showToast: true },
        );
    };

    const defaultModelInList = openRouterModels?.find(
        (m) => m.apiName === DEFAULT_AGENT_MODEL,
    );

    return (
        <SettingsModelSelector
            variant="pill"
            selectedModel={currentValue}
            onModelSelect={handleChange}
            models={(openRouterModels || []).filter(
                (m) => m.apiName !== DEFAULT_AGENT_MODEL,
            )}
            loading={isLoading}
            placeholder="Selecciona un modelo"
            disableEnabledFilter
            specialOptions={[
                {
                    value: DEFAULT_AGENT_MODEL,
                    label:
                        defaultModelInList?.displayName ||
                        "Gemini 3.1 Flash Lite (recomendado)",
                    description: defaultModelInList
                        ? undefined
                        : "Modelo por defecto para este agente",
                },
            ]}
        />
    );
}
