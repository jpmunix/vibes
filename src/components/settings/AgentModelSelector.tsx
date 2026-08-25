import { useSettings } from "@/hooks/useSettings";
import { useI18n } from "@/lib/i18n";
import { useMultiProviderModels } from "@/hooks/useMultiProviderModels";
import { SettingsModelSelector } from "../SettingsModelSelector";
import { DEFAULT_AGENT_MODEL } from "@/lib/schemas";

/** All supported agent IDs that can have model overrides */
export type AgentId =
  | "plan"
  | "explore"
  | "general"
  | "compaction"
  | "title"
  | "summary"
  | "mockup";

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
  const { t } = useI18n();
  const { data: allModels, isLoading } = useMultiProviderModels();

  const currentValue = settings?.agentModels?.[agentId] ?? DEFAULT_AGENT_MODEL;

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

  const defaultModelInList = allModels?.find(
    (m) => m.apiName === DEFAULT_AGENT_MODEL,
  );

  return (
    <SettingsModelSelector
      variant="pill"
      selectedModel={currentValue}
      onModelSelect={handleChange}
      models={(allModels || []).filter(
        (m) => m.apiName !== DEFAULT_AGENT_MODEL,
      )}
      loading={isLoading}
      placeholder={t("common.selectModel")}
      disableEnabledFilter
      showProviderBadge
      specialOptions={[
        {
          value: DEFAULT_AGENT_MODEL,
          label:
            defaultModelInList?.displayName ||
            t("agentModels.defaultLabel"),
          description: defaultModelInList
            ? undefined
            : t("agentModels.defaultDesc"),
        },
      ]}
    />
  );
}
