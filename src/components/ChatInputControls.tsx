import { ContextFilesPicker } from "./ContextFilesPicker";
import { ModelPicker } from "./ModelPicker";
import { ChatModeSelector } from "./ChatModeSelector";
import { McpToolsPicker } from "@/components/McpToolsPicker";
import { useSettings } from "@/hooks/useSettings";

export function ChatInputControls({
  showContextFilesPicker = false,
}: {
  showContextFilesPicker?: boolean;
}) {
  const { settings } = useSettings();

  return (
    <div className="flex items-center gap-2">
      <ChatModeSelector />
      {settings?.selectedChatMode === "agent" && (
        <McpToolsPicker />
      )}
      <ModelPicker />
      {showContextFilesPicker && (
        <>
          <ContextFilesPicker />
        </>
      )}
    </div>
  );
}
