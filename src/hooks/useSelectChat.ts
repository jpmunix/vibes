import { useSetAtom } from "jotai";
import { selectedChatIdAtom } from "@/atoms/chatAtoms";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { useSettings } from "./useSettings";
import { getEffectiveDefaultChatMode } from "@/lib/schemas";
import { useFreeAgentQuota } from "./useFreeAgentQuota";
import { ipc } from "@/ipc/types";
import { useTheme } from "@/contexts/ThemeContext";

export function useSelectChat() {
  const setSelectedChatId = useSetAtom(selectedChatIdAtom);
  const setSelectedAppId = useSetAtom(selectedAppIdAtom);
  const { settings, updateSettings, envVars } = useSettings();
  const { isQuotaExceeded, isLoading: isQuotaLoading } = useFreeAgentQuota();
  const { theme, intensity } = useTheme();

  return {
    selectChat: ({ chatId, appId }: { chatId: number; appId: number }) => {
      setSelectedChatId(chatId);
      setSelectedAppId(appId);

      // When entering an existing chat, reset mode to user's default
      // (plan mode is only the default on the Home screen for new apps)
      if (settings?.selectedChatMode === "plan") {
        const freeAgentQuotaAvailable = !isQuotaLoading && !isQuotaExceeded;
        const effectiveDefault = getEffectiveDefaultChatMode(
          settings,
          envVars,
          freeAgentQuotaAvailable,
        );
        if (effectiveDefault !== "plan") {
          updateSettings({ selectedChatMode: effectiveDefault });
        }
      }

      // Open chat in a dedicated window
      ipc.system.openChatWindow({ appId, chatId, theme, themeIntensity: intensity });
    },
  };
}
