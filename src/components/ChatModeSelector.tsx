import { UnifiedSelector } from "@/components/ui/UnifiedSelector";
import { useSettings } from "@/hooks/useSettings";
import type { ChatMode } from "@/lib/schemas";
import { cn } from "@/lib/utils";
import { detectIsMac } from "@/hooks/useChatModeToggle";
import { chatClient } from "@/ipc/types/chat";
import { useCustomAgents } from "@/hooks/useCustomAgents";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface ChatModeSelectorProps {
  chatId?: number;
}

export function ChatModeSelector({ chatId }: ChatModeSelectorProps) {
  const { settings, updateSettings } = useSettings();
  const { customAgents } = useCustomAgents();
  const queryClient = useQueryClient();

  // Load chat data to query current chatMode if we are in a specific chat
  const { data: chat } = useQuery({
    queryKey: ["chat", chatId],
    queryFn: () => chatClient.getChat(chatId!),
    enabled: !!chatId,
  });

  const updateChatMutation = useMutation({
    mutationFn: (newMode: string) =>
      chatClient.updateChat({ chatId: chatId!, chatMode: newMode }),
    onSuccess: (_, newMode) => {
      queryClient.setQueryData(["chat", chatId], (old: any) => {
        if (!old) return old;
        return { ...old, chatMode: newMode };
      });
      queryClient.invalidateQueries({ queryKey: ["chat", chatId] });
    },
  });

  // The active mode is resolved from the chat if active, otherwise from global settings
  const selectedMode = chatId && chat ? (chat.chatMode || "agent") : (settings?.selectedChatMode || "agent");

  const handleModeChange = (value: string) => {
    if (chatId) {
      updateChatMutation.mutate(value);
    } else {
      updateSettings({ selectedChatMode: value as ChatMode });
    }
  };

  const getModeDisplayName = (mode: string) => {
    switch (mode) {
      case "plan":
        return "Planificar";
      case "ask":
        return "Preguntar";
      case "agent":
        return "Agente";
      default:
        if (mode.startsWith("custom-agent::")) {
          const id = parseInt(mode.split("::")[1]);
          const agent = customAgents.find((ca) => ca.id === id);
          return agent ? agent.name : "Agente";
        }
        return "Agente";
    }
  };

  const baseOptions = [
    {
      value: "agent",
      label: "Agente",
      description: "Desarrolla, edita y depura con herramientas avanzadas",
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

  const customOptions = (customAgents || []).map((agent) => ({
    value: `custom-agent::${agent.id}`,
    label: agent.name,
    description: `[Comando: /${agent.slashCommand}] Agente personalizado con base ${agent.baseAgent}`,
  }));

  const options = [...baseOptions, ...customOptions];

  const isCustomMode = selectedMode.startsWith("custom-agent::");

  return (
    <UnifiedSelector
      value={selectedMode}
      onChange={handleModeChange}
      options={options}
      triggerVariant="pill"
      triggerSize="sm"
      triggerClassName={cn(
        selectedMode === "agent"
          ? "bg-muted/80 text-foreground hover:bg-muted"
          : isCustomMode
            ? "!bg-emerald-500/20 !text-emerald-600 dark:!text-emerald-400 !border-emerald-500/20 hover:!bg-emerald-500/30"
            : "!bg-primary/20 !text-primary !border-primary/20 hover:!bg-primary/30"
      )}
      customTriggerLabel={<span className="font-semibold">{getModeDisplayName(selectedMode)}</span>}
      popoverWidth="w-[300px]"
      data-testid="chat-mode-selector"
      side="top"
    />
  );
}
