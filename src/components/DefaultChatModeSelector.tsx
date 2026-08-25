import { useSettings } from "@/hooks/useSettings";
import { useI18n } from "@/lib/i18n";
import {
  UnifiedSelector,
  type SelectorOption,
} from "@/components/ui/UnifiedSelector";

import type { ChatMode } from "@/lib/schemas";
import { getEffectiveDefaultChatMode } from "@/lib/schemas";

export function DefaultChatModeSelector() {
  const { settings, updateSettings } = useSettings();
  const { t } = useI18n();

  if (!settings) {
    return null;
  }

  const effectiveDefault = getEffectiveDefaultChatMode(settings);

  const chatModeOptions: SelectorOption[] = [
    {
      value: "agent",
      label: t("settingsItems.modo_de_chat_predeterminadoAgent"),
      description: t("settingsItems.modo_de_chat_predeterminadoAgentDesc"),
    },
    {
      value: "plan",
      label: t("settingsItems.modo_de_chat_predeterminadoPlan"),
      description: t("settingsItems.modo_de_chat_predeterminadoPlanDesc"),
    },
    {
      value: "ask",
      label: t("settingsItems.modo_de_chat_predeterminadoAsk"),
      description: t("settingsItems.modo_de_chat_predeterminadoAskDesc"),
    },
  ];

  const handleDefaultChatModeChange = (value: string) => {
    updateSettings({ defaultChatMode: value as ChatMode });
  };

  return (
    <UnifiedSelector
      value={effectiveDefault}
      onChange={handleDefaultChatModeChange}
      options={chatModeOptions}
      triggerVariant="pill"
      triggerSize="md"
      popoverWidth="w-[280px]"
      data-testid="default-chat-mode"
    />
  );
}
