import { useSettings } from "@/hooks/useSettings";
import { UnifiedSelector, type SelectorOption } from "@/components/ui/UnifiedSelector";

import type { ChatMode } from "@/lib/schemas";
import { getEffectiveDefaultChatMode } from "@/lib/schemas";

const chatModeOptions: SelectorOption[] = [
  {
    value: "agent",
    label: "Agente",
    description: "Desarrolla, edita y depura con acceso a herramientas",
  },
  {
    value: "plan",
    label: "Planificar",
    description: "Diseña un plan de acción antes de implementar",
  },
  {
    value: "ask",
    label: "Preguntar",
    description: "Consulta sobre tu código sin realizar cambios",
  },
];

export function DefaultChatModeSelector() {
  const { settings, updateSettings } = useSettings();

  if (!settings) {
    return null;
  }

  const effectiveDefault = getEffectiveDefaultChatMode(settings);

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
