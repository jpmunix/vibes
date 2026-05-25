import { UnifiedSelector } from "@/components/ui/UnifiedSelector";
import { useSettings } from "@/hooks/useSettings";
import type { ChatMode } from "@/lib/schemas";
import { cn } from "@/lib/utils";
import { detectIsMac } from "@/hooks/useChatModeToggle";
import { chatClient } from "@/ipc/types/chat";
import { useCustomAgents, getUltimateBaseAgent } from "@/hooks/useCustomAgents";
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
  let selectedMode = chatId && chat ? (chat.chatMode || "agent") : (settings?.selectedChatMode || "agent");

  // If the active mode is a base mode, check if we have a default custom replacement for it
  const getUltimateBase = (mode: string): "build" | "plan" | "explore" | null => {
    if (mode === "agent" || mode === "build") return "build";
    if (mode === "plan") return "plan";
    if (mode === "ask" || mode === "explore") return "explore";
    return null;
  };

  const selectedModeUltBase = getUltimateBase(selectedMode);
  if (selectedModeUltBase) {
    const replacer = (customAgents || []).find(
      (ca) => ca.isDefaultBase === 1 && getUltimateBaseAgent(ca.baseAgent, customAgents) === selectedModeUltBase
    );
    if (replacer) {
      selectedMode = `custom-agent::${replacer.id}`;
    }
  }

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
      key: "build",
      value: "agent",
      label: "Agente",
      description: "Desarrolla, edita y depura con herramientas avanzadas",
      command: "/agent",
    },
    {
      key: "plan",
      value: "plan",
      label: "Planificar",
      description: "Diseña un plan de acción antes de implementar",
      command: "/plan",
    },
    {
      key: "explore",
      value: "ask",
      label: "Preguntar",
      description: "Consulta sobre tu código sin realizar cambios",
      command: "/ask",
    },
  ].map((baseOpt) => {
    const replacer = (customAgents || []).find(
      (ca) => ca.isDefaultBase === 1 && getUltimateBaseAgent(ca.baseAgent, customAgents) === baseOpt.key
    );
    if (replacer) {
      return {
        value: `custom-agent::${replacer.id}`,
        label: replacer.name,
        description: replacer.description || "",
        command: `/${replacer.slashCommand}`,
      };
    }
    return baseOpt;
  });

  const customOptions = (customAgents || [])
    .filter((ca) => ca.isDefaultBase !== 1)
    .map((agent) => ({
      value: `custom-agent::${agent.id}`,
      label: agent.name,
      description: agent.description || "",
      command: `/${agent.slashCommand}`,
    }));

  const options = [...baseOptions, ...customOptions];


  const isCustomMode = selectedMode.startsWith("custom-agent::");

  const renderItem = (option: any) => {
    return (
      <div className="flex flex-col gap-0 flex-1 min-w-0 w-full">
        <div className="flex items-center justify-between w-full whitespace-nowrap">
          <span>{option.label}</span>
          {option.command && (
            <span className="ml-2 font-mono text-emerald-600 dark:text-emerald-400 text-[11px] shrink-0 font-normal">
              {option.command}
            </span>
          )}
        </div>
        {option.description && (
          <span className="typo-caption leading-tight opacity-80 whitespace-nowrap">
            {option.description}
          </span>
        )}
      </div>
    );
  };

  return (
    <UnifiedSelector
      value={selectedMode}
      onChange={handleModeChange}
      options={options}
      triggerVariant="pill"
      triggerSize="sm"
      triggerClassName={cn(
        selectedMode === "agent"
          ? "!border !border-input !bg-muted/80 text-foreground !shadow-none hover:!bg-muted"
          : isCustomMode
            ? "!bg-emerald-500/20 !text-emerald-600 dark:!text-emerald-400 !border-emerald-500/20 hover:!bg-emerald-500/30"
            : "!bg-primary/20 !text-primary !border-primary/20 hover:!bg-primary/30"
      )}
      customTriggerLabel={<span className="font-semibold">{getModeDisplayName(selectedMode)}</span>}
      popoverWidth="w-[300px]"
      data-testid="chat-mode-selector"
      side="top"
      renderItem={renderItem}
    />
  );
}
