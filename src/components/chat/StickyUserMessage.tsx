import React, { useMemo } from "react";
import { User as UserIcon, ChevronUp } from "@/components/ui/icons";

interface StickyUserMessageProps {
  /** Raw message content from the user */
  content: string;
  /** Callback when clicked — scrolls to the original message */
  onScrollToMessage?: () => void;
  /** Whether the sticky is entering/leaving (for animation) */
  visible: boolean;
}

/**
 * Compact sticky bar shown at the top of the chat scroll container.
 * Displays a truncated version of the user's message that has scrolled
 * out of view, so the user always knows what prompt they're looking at.
 */
export const StickyUserMessage = React.memo(function StickyUserMessage({
  content,
  onScrollToMessage,
  visible,
}: StickyUserMessageProps) {
  // Clean and truncate the content for display
  const displayText = useMemo(() => {
    let text = content ?? "";

    // Strip attachment metadata
    const attachmentMarker = text.indexOf("\n\nAttachments:\n");
    if (attachmentMarker !== -1) text = text.substring(0, attachmentMarker);
    const componentMarker = text.indexOf("\n\nSelected components:\n");
    if (componentMarker !== -1) text = text.substring(0, componentMarker);
    const uploadMarker = text.indexOf("\n\nFile to upload to codebase:");
    if (uploadMarker !== -1) text = text.substring(0, uploadMarker);

    // Strip slash command prefix
    text = text.replace(/^\/[a-zA-Z0-9_-]+\s*/, "");

    // Normalize whitespace
    text = text.replace(/\n+/g, " ").replace(/\s+/g, " ").trim();

    // Strip "Fix error:" prefix for compact display
    if (text.startsWith("Fix error:")) {
      text = "Solucionar error";
    }

    // Truncate
    if (text.length > 120) {
      text = text.slice(0, 117) + "…";
    }

    return text;
  }, [content]);

  if (!displayText) return null;

  return (
    <div
      className={`sticky-user-message ${visible ? "sticky-user-message--visible" : "sticky-user-message--hidden"}`}
      onClick={onScrollToMessage}
      role="button"
      tabIndex={0}
      aria-label="Ir al mensaje original"
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onScrollToMessage?.();
        }
      }}
    >
      <div className="sticky-user-message__content">
        <UserIcon size={12} className="sticky-user-message__icon" />
        <span className="sticky-user-message__text">{displayText}</span>
        <ChevronUp size={12} className="sticky-user-message__arrow" />
      </div>
    </div>
  );
});
