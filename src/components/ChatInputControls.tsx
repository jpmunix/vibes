import { ContextFilesPicker } from "./ContextFilesPicker";
import { ModelPicker } from "./ModelPicker";
import { ChatModeSelector } from "./ChatModeSelector";
import { ReasoningEffortSelector } from "./ReasoningEffortSelector";
import { TemplatePicker } from "./TemplatePicker";
import { useSettings } from "@/hooks/useSettings";

export function ChatInputControls({
  showContextFilesPicker = false,
  showTemplatePicker = false,
}: {
  showContextFilesPicker?: boolean;
  showTemplatePicker?: boolean;
}) {
  const { settings } = useSettings();
  const isTurboMode = settings?.selectedChatMode === "mockup";

  return (
    <div className="flex items-center gap-2">
      <ChatModeSelector />
      <ModelPicker />
      {!isTurboMode && <ReasoningEffortSelector variant="compact" />}
      {showTemplatePicker && (
        <TemplatePicker variant="compact" />
      )}
      {showContextFilesPicker && (
        <>
          <ContextFilesPicker />
        </>
      )}
    </div>
  );
}
