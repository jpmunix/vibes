import { useCallback, useMemo } from "react";
import { useSettings } from "./useSettings";
import { useShortcut } from "./useShortcut";

import { ChatModeSchema } from "../lib/schemas";

export function useChatModeToggle() {
  const { settings, updateSettings } = useSettings();

  // Detect if user is on mac
  const isMac = useIsMac();

  // Memoize the modifiers object to prevent re-registration
  const modifiers = useMemo(
    () => ({
      ctrl: !isMac,
      meta: isMac,
    }),
    [isMac],
  );

  // Function to toggle between visible chat modes (skipping deprecated build/agent)
  const toggleChatMode = useCallback(() => {
    if (!settings || !settings.selectedChatMode) return;

    const currentMode = settings.selectedChatMode;
    // Only cycle through active modes
    const visibleModes = ["agent", "plan", "ask"] as const;
    const currentIndex = visibleModes.indexOf(currentMode as typeof visibleModes[number]);
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % visibleModes.length;
    const newMode = visibleModes[nextIndex];

    updateSettings({ selectedChatMode: newMode });
  }, [settings, updateSettings]);

  // Add keyboard shortcut with memoized modifiers
  useShortcut(
    ".",
    modifiers,
    toggleChatMode,
    true, // Always enabled since we're not dependent on component selector
  );

  return { toggleChatMode, isMac };
}

// Add this function at the top
type NavigatorWithUserAgentData = Navigator & {
  userAgentData?: {
    platform?: string;
  };
};

export function detectIsMac(): boolean {
  const nav = navigator as NavigatorWithUserAgentData;
  // Try modern API first
  if ("userAgentData" in nav && nav.userAgentData?.platform) {
    return nav.userAgentData.platform.toLowerCase().includes("mac");
  }

  // Fallback to user agent check
  return /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
}
// Export the utility function and hook for use elsewhere
export function useIsMac(): boolean {
  return useMemo(() => detectIsMac(), []);
}
