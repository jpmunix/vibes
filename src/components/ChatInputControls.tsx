import { ContextFilesPicker } from "./ContextFilesPicker";
import { ModelPicker } from "./ModelPicker";
import { ChatModeSelector } from "./ChatModeSelector";
import { ReasoningEffortSelector } from "./ReasoningEffortSelector";

export function ChatInputControls({
  showContextFilesPicker = false,
}: {
  showContextFilesPicker?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <ChatModeSelector />
      <ModelPicker />
      <ReasoningEffortSelector variant="compact" />
      {showContextFilesPicker && (
        <>
          <ContextFilesPicker />
        </>
      )}
    </div>
  );
}
