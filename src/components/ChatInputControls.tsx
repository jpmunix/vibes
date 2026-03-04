import { ContextFilesPicker } from "./ContextFilesPicker";
import { ModelPicker } from "./ModelPicker";
import { ChatModeSelector } from "./ChatModeSelector";
import { ReasoningEffortSelector } from "./ReasoningEffortSelector";
import { TemplatePicker } from "./TemplatePicker";

export function ChatInputControls({
  showContextFilesPicker = false,
  showTemplatePicker = false,
}: {
  showContextFilesPicker?: boolean;
  showTemplatePicker?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <ChatModeSelector />
      <ModelPicker />
      <ReasoningEffortSelector variant="compact" />
      {showTemplatePicker && (
        <>
          <span className="text-muted-foreground/40">·</span>
          <TemplatePicker variant="compact" />
        </>
      )}
      {showContextFilesPicker && (
        <>
          <ContextFilesPicker />
        </>
      )}
    </div>
  );
}
