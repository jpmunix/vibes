import { ContextFilesPicker } from "./ContextFilesPicker";
import { ModelPicker } from "./ModelPicker";
import { ChatModeSelector } from "./ChatModeSelector";
import { InferenceTunerPicker } from "./InferenceTunerPicker";
import { TemplatePicker } from "./TemplatePicker";
import { DesignPicker } from "./DesignPicker";

export function ChatInputControls({
  showContextFilesPicker = false,
  showTemplatePicker = false,
  showDesignPicker = false,
}: {
  showContextFilesPicker?: boolean;
  showTemplatePicker?: boolean;
  showDesignPicker?: boolean;
}) {

  return (
    <div className="flex items-center gap-2">
      <ChatModeSelector />
      <ModelPicker />
      <InferenceTunerPicker />
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
