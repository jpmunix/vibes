import { SendHorizontalIcon, StopCircleIcon } from "lucide-react";

import { useSettings } from "@/hooks/useSettings";
import { homeChatInputValueAtom } from "@/atoms/chatAtoms"; // Use a different atom for home input
import { useAtom } from "jotai";
import { useStreamChat } from "@/hooks/useStreamChat";
import { useAttachments } from "@/hooks/useAttachments";
import { AttachmentsList } from "./AttachmentsList";
import { DragDropOverlay } from "./DragDropOverlay";
import { usePostHog } from "posthog-js/react";
import { HomeSubmitOptions } from "@/pages/home";
import { ChatInputControls } from "../ChatInputControls";
import { LexicalChatInput } from "./LexicalChatInput";
import { useChatModeToggle } from "@/hooks/useChatModeToggle";
import { useTypingPlaceholder } from "@/hooks/useTypingPlaceholder";
import { AuxiliaryActionsMenu } from "./AuxiliaryActionsMenu";

export function HomeChatInput({
  onSubmit,
}: {
  onSubmit: (options?: HomeSubmitOptions) => void;
}) {
  const posthog = usePostHog();
  const [inputValue, setInputValue] = useAtom(homeChatInputValueAtom);
  const { settings } = useSettings();
  const { isStreaming } = useStreamChat({
    hasChatId: false,
  }); // eslint-disable-line @typescript-eslint/no-unused-vars
  useChatModeToggle();

  const typingText = useTypingPlaceholder([
    "una tienda de ecommerce...",
    "una página de información...",
    "una landing page...",
  ]);
  const placeholder = `Pídele a vibes que haga ${typingText ?? ""}`;

  // Use the attachments hook
  const {
    attachments,
    isDraggingOver,
    handleFileSelect,
    removeAttachment,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    clearAttachments,
    handlePaste,
  } = useAttachments();

  // Custom submit function that wraps the provided onSubmit
  const handleCustomSubmit = () => {
    if ((!inputValue.trim() && attachments.length === 0) || isStreaming) {
      return;
    }

    // Call the parent's onSubmit handler with attachments
    onSubmit({ attachments });

    // Clear attachments as part of submission process
    clearAttachments();
    posthog?.capture("chat:home_submit", {
      chatMode: settings?.selectedChatMode,
    });
  };

  if (!settings) {
    return null; // Or loading state
  }

  return (
    <>
      <div className="px-4 pb-4" data-testid="home-chat-input-container">
        <div className="max-w-3xl mx-auto">
          <div
            className="rounded-lg p-[1.5px]"
            style={{
              background: `linear-gradient(to bottom, oklch(0.58 0.09 260 / 0.4), var(--border) 50%, oklch(0.58 0.09 260 / 0.15))`,
            }}
          >
            <div
              className={`relative flex flex-col rounded-lg bg-(--background-lighter) overflow-hidden ${isDraggingOver ? "ring-2 ring-blue-500" : ""
                }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {/* Attachments list */}
              <AttachmentsList
                attachments={attachments}
                onRemove={removeAttachment}
              />

              {/* Drag and drop overlay */}
              <DragDropOverlay isDraggingOver={isDraggingOver} />

              <LexicalChatInput
                value={inputValue}
                onChange={setInputValue}
                onSubmit={handleCustomSubmit}
                onPaste={handlePaste}
                placeholder={placeholder}
                disabled={isStreaming}
                excludeCurrentApp={false}
                disableSendButton={false}
              />

              {/* Bottom controls bar */}
              <div className="px-3 py-5 flex items-center border-t border-border/50">
                <AuxiliaryActionsMenu
                  onFileSelect={handleFileSelect}
                  hideContextFilesPicker
                />
                <div className="flex items-center ml-2.5">
                  <ChatInputControls showContextFilesPicker={false} showTemplatePicker={true} />
                </div>

                <div className="ml-auto flex items-center gap-1.5">
                  {isStreaming ? (
                    <button
                      className="p-2.5 bg-destructive hover:bg-destructive/90 text-white rounded-full transition-colors cursor-pointer"
                      title="Cancelar generación (no disponible aquí)"
                    >
                      <StopCircleIcon size={18} />
                    </button>
                  ) : (
                    <button
                      onClick={handleCustomSubmit}
                      disabled={!inputValue.trim() && attachments.length === 0}
                      className="p-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full disabled:opacity-30 transition-colors shadow-sm cursor-pointer"
                      title="Enviar mensaje"
                    >
                      <SendHorizontalIcon size={18} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

