import { ContextFilesPicker } from "./ContextFilesPicker";
import { ModelPicker } from "./ModelPicker";
import { ChatModeSelector } from "./ChatModeSelector";
import { ReasoningEffortSelector } from "./ReasoningEffortSelector";
import { TemplatePicker } from "./TemplatePicker";
import { DesignPicker } from "./DesignPicker";

export function ChatInputControls({
  showContextFilesPicker = false,
  showTemplatePicker = false,
  showDesignPicker = false,
  chatId,
}: {
  showContextFilesPicker?: boolean;
  showTemplatePicker?: boolean;
  showDesignPicker?: boolean;
  chatId?: number;
}) {

  return (
    <div className="flex items-center gap-2">
      <ChatModeSelector chatId={chatId} />
      <ModelPicker />
      <ReasoningEffortSelector variant="compact" />
      {showTemplatePicker && (
        <TemplatePicker variant="compact" />
      )}
      {showDesignPicker && (
        <DesignPicker />
      )}
      {showContextFilesPicker && (
        <>
          <ContextFilesPicker />
        </>
      )}
    </div>
  );
}
