import { SendHorizontalIcon, StopCircleIcon } from "@/components/ui/icons";

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
      <style>{`
        /* ── Animated gradient border ── */
        @property --home-input-angle {
          syntax: "<angle>";
          initial-value: 0deg;
          inherits: false;
        }
        @keyframes home-input-border-spin {
          to { --home-input-angle: 360deg; }
        }
        .home-input-border-wrap {
          --_border-w: 1.5px;
          position: relative;
          border-radius: 14px;
          padding: var(--_border-w);
          background: conic-gradient(
            from var(--home-input-angle),
            color-mix(in oklch, var(--primary) 40%, transparent) 0%,
            color-mix(in oklch, var(--primary) 15%, transparent) 25%,
            var(--border) 50%,
            color-mix(in oklch, var(--primary) 15%, transparent) 75%,
            color-mix(in oklch, var(--primary) 40%, transparent) 100%
          );
          animation: home-input-border-spin 4s linear infinite;
          transition: box-shadow 0.3s ease;
        }
        .home-input-border-wrap:hover,
        .home-input-border-wrap:focus-within {
          box-shadow: 0 0 32px -8px color-mix(in oklch, var(--primary) 30%, transparent);
        }

        /* ── Inner glassmorphism container ── */
        .home-input-inner {
          border-radius: 12.5px;
          backdrop-filter: blur(20px) saturate(1.5);
          -webkit-backdrop-filter: blur(20px) saturate(1.5);
          background: color-mix(in oklch, var(--background) 85%, transparent);
        }

        /* ── Send button glow ── */
        .home-send-btn {
          position: relative;
          overflow: hidden;
        }
        .home-send-btn::after {
          content: "";
          position: absolute;
          inset: -2px;
          border-radius: inherit;
          background: var(--primary);
          opacity: 0;
          filter: blur(8px);
          z-index: -1;
          transition: opacity 0.25s ease;
        }
        .home-send-btn:not(:disabled):hover::after {
          opacity: 0.4;
        }
      `}</style>

      <div className="px-4 pb-4" data-testid="home-chat-input-container">
        <div className="max-w-3xl mx-auto">
          <div className="home-input-border-wrap">
            <div
              className={`home-input-inner relative flex flex-col overflow-hidden ${isDraggingOver ? "ring-2 ring-blue-500" : ""
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
              <div className="px-3 py-5 flex items-center border-t border-border/30">
                <AuxiliaryActionsMenu
                  onFileSelect={handleFileSelect}
                  hideContextFilesPicker
                />
                <div className="flex items-center ml-2.5">
                  <ChatInputControls showContextFilesPicker={false} showTemplatePicker={true} showDesignPicker={true} />
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
                      className="home-send-btn p-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full disabled:opacity-30 transition-colors shadow-sm cursor-pointer"
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

