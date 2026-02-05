import { useNavigate } from "@tanstack/react-router";
import { useAtomValue } from "jotai";
import { selectedChatIdAtom } from "@/atoms/chatAtoms";
import { selectedAppIdAtom, userSettingsAtom } from "@/atoms/appAtoms";
import { useStreamChat } from "@/hooks/useStreamChat";
import { ipc } from "@/ipc/types";
import { showError } from "@/lib/toast";
import { SUMMARY_SYSTEM_PROMPT_LANGS } from "@/prompts/summarize_chat_system_prompt.ts";

export function useSummarizeInNewChat() {
  const chatId = useAtomValue(selectedChatIdAtom);
  const appId = useAtomValue(selectedAppIdAtom);
  const settings = useAtomValue(userSettingsAtom);
  const lang = settings?.chatLanguage || "es";
  const { streamMessage } = useStreamChat();
  const navigate = useNavigate();

  const handleSummarize = async () => {
    if (!appId) {
      console.error("No app id found");
      return;
    }
    if (!chatId) {
      console.error("No chat id found");
      return;
    }
    try {
      const newChatId = await ipc.chat.createChat(appId);
      // navigate to new chat
      await navigate({ to: "/chat", search: { id: newChatId } });
      await streamMessage({
        prompt:
          (SUMMARY_SYSTEM_PROMPT_LANGS[
            lang as keyof typeof SUMMARY_SYSTEM_PROMPT_LANGS
          ] || SUMMARY_SYSTEM_PROMPT_LANGS.es) + chatId,
        chatId: newChatId,
        isSystemPrompt: true,
      });
    } catch (err) {
      showError(err);
    }
  };

  return { handleSummarize };
}
