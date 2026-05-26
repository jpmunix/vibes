import { useSettings } from "@/hooks/useSettings";
import { useLanguageModelsByProviders } from "@/hooks/useLanguageModelsByProviders";
import { useMemo } from "react";
import { useAtomValue } from "jotai";
import { selectedChatIdAtom, chatInputValueAtom } from "@/atoms/chatAtoms";
import { useCustomAgents } from "@/hooks/useCustomAgents";
import { useQuery } from "@tanstack/react-query";
import { ipc } from "@/ipc/types";
import { parseModelString } from "@/lib/schemas";

/**
 * Returns whether the currently selected model supports image inputs.
 *
 * Checks `selectedModel` or custom agent static model configuration if active.
 */
export function useSelectedModelSupportsImages(): boolean {
  const { settings } = useSettings();
  const { data: modelsByProviders } = useLanguageModelsByProviders();
  const chatId = useAtomValue(selectedChatIdAtom);
  const inputValue = useAtomValue(chatInputValueAtom);
  const { customAgents } = useCustomAgents();

  const { data: chat } = useQuery({
    queryKey: ["chat", chatId],
    queryFn: () => ipc.chat.getChat(chatId!),
    enabled: !!chatId,
  });

  return useMemo(() => {
    if (!settings || !modelsByProviders) return true;

    // 1. Resolve which model is active (dynamic selectedModel vs static custom agent model)
    let activeProvider = settings.selectedModel?.provider || "openrouter";
    let activeModelName = settings.selectedModel?.name;

    // Check if the current user input triggers a custom agent via slash command
    const trimmedInput = (inputValue || "").trim();
    let matchedAgent: any = null;
    if (trimmedInput.startsWith("/")) {
      const firstWord = trimmedInput.split(" ")[0].slice(1).toLowerCase();
      matchedAgent = customAgents?.find((a) => a.slashCommand.toLowerCase() === firstWord);
    }

    // Otherwise, check if the current chat mode itself is a custom agent
    if (!matchedAgent) {
      const currentMode = chatId && chat ? (chat.chatMode || "agent") : (settings.selectedChatMode || "agent");
      if (currentMode.startsWith("custom-agent::")) {
        const id = parseInt(currentMode.split("::")[1]);
        matchedAgent = customAgents?.find((a) => a.id === id);
      }
    }

    if (matchedAgent && matchedAgent.modelSource === "static" && matchedAgent.model) {
      const parsed = parseModelString(matchedAgent.model, activeProvider);
      activeProvider = parsed.provider;
      activeModelName = parsed.name;
    }

    if (!activeModelName) return true;

    const providerModels = modelsByProviders[activeProvider];
    if (!providerModels) return true;

    // If it was the settings model, check customModelId first
    const isSettingsModel = activeProvider === settings.selectedModel?.provider && activeModelName === settings.selectedModel?.name;
    const customFoundModel = isSettingsModel && settings.selectedModel.customModelId
      ? providerModels.find((m) => m.type === "custom" && m.id === settings.selectedModel.customModelId)
      : null;

    const model = customFoundModel || providerModels.find((m) => m.apiName === activeModelName);

    if (model?.inputModalities) {
      return model.inputModalities.includes("image");
    }

    // Default to true for models that don't explicitly specify their modalities.
    return true;
  }, [settings?.selectedModel, modelsByProviders, chatId, chat?.chatMode, settings?.selectedChatMode, inputValue, customAgents]);
}

/**
 * Returns `true` when the current chat mode is plan or ask.
 * These modes use the same selectedModel but have different agent behavior
 * (restricted tools, read-only, etc.).
 */
export function useIsStrategistMode(): boolean {
  const { settings } = useSettings();
  const mode = settings?.selectedChatMode || "agent";
  return mode === "plan" || mode === "ask";
}
