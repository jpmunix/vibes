import { useState, useRef, useEffect, useCallback, useDeferredValue } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import {
  chatMessagesByIdAtom,
  chatStreamCountByIdAtom,
  isStreamingByIdAtom,
} from "../atoms/chatAtoms";
import { ipc } from "@/ipc/types";

import { ChatHeader } from "./chat/ChatHeader";
import { MessagesList } from "./chat/MessagesList";
import { ChatInput } from "./chat/ChatInput";
import { ChatError } from "./chat/ChatError";
import { FreeAgentQuotaBanner } from "./chat/FreeAgentQuotaBanner";
import { ChatLogsPanel } from "./chat/ChatLogsPanel";
import { Button } from "@/components/ui/button";
import { ArrowDown, Loader2, ListChecks } from "lucide-react";
import { useSettings } from "@/hooks/useSettings";
import { useFreeAgentQuota } from "@/hooks/useFreeAgentQuota";
import { isBasicAgentMode } from "@/lib/schemas";
import { PlanPanel } from "./chat/PlanPanel";
import { usePlanSync } from "@/hooks/usePlanSync";

interface ChatPanelProps {
  chatId?: number;
  autoStart?: boolean;
  isPreviewOpen: boolean;
  onTogglePreview: () => void;
  /** When true, don't reset plan mode to build on first load (used when opening a new app in plan mode) */
  preservePlanMode?: boolean;
}

export function ChatPanel({
  chatId,
  autoStart,
  isPreviewOpen,
  onTogglePreview,
  preservePlanMode,
}: ChatPanelProps) {
  const messagesById = useAtomValue(chatMessagesByIdAtom);
  const setMessagesById = useSetAtom(chatMessagesByIdAtom);
  const [error, setError] = useState<string | null>(null);
  const streamCountById = useAtomValue(chatStreamCountByIdAtom);
  const isStreamingById = useAtomValue(isStreamingByIdAtom);
  const { settings, updateSettings } = useSettings();
  const { isQuotaExceeded } = useFreeAgentQuota();
  const showFreeAgentQuotaBanner =
    settings && isBasicAgentMode(settings) && isQuotaExceeded;

  // Sync plan state from chat messages (in plan mode)
  usePlanSync(chatId);

  // When entering a chat that is NOT actively streaming, reset "plan" mode
  // to the user's default. Plan mode is only forced on the Home screen for
  // new app creation; once inside an existing app it should use the user's
  // preferred mode (build / agent).
  const hasResetModeRef = useRef<number | undefined>(undefined);
  const preservePlanModeRef = useRef(preservePlanMode);

  // Clear the preserve flag once streaming starts (plan mode has been "used")
  useEffect(() => {
    if (chatId && (isStreamingById.get(chatId) ?? false)) {
      preservePlanModeRef.current = false;
    }
  }, [chatId, isStreamingById]);

  useEffect(() => {
    if (!chatId || !settings) return;
    // Only reset once per chatId
    if (hasResetModeRef.current === chatId) return;
    // Don't reset plan mode if explicitly preserved (new app window in plan mode)
    if (preservePlanModeRef.current) return;

    if (settings.selectedChatMode === "plan") {
      const isStreaming = isStreamingById.get(chatId) ?? false;
      if (!isStreaming) {
        hasResetModeRef.current = chatId;
        const defaultMode = settings.defaultChatMode || "build";
        const resetTo = defaultMode === "plan" ? "build" : defaultMode;
        updateSettings({ selectedChatMode: resetTo });
      }
    }
  }, [chatId, settings, isStreamingById, updateSettings]);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);

  // Scroll-related state
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const [isLogsOpen, setIsLogsOpen] = useState(false);

  // Refs for scroll tracking (both test and Virtuoso modes)
  const distanceFromBottomRef = useRef<number>(0);
  const userScrollTimeoutRef = useRef<number | null>(null);
  // Ref to store cleanup function for Virtuoso scroller event listener
  const scrollerCleanupRef = useRef<(() => void) | null>(null);
  // Ref to track previous streaming state
  const prevIsStreamingRef = useRef(false);
  // Ref to track if we're programmatically scrolling (to avoid triggering user scroll detection)
  const isProgrammaticScrollRef = useRef(false);
  // RAF-based throttle for scroll events
  const scrollRafRef = useRef<number | null>(null);

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    isProgrammaticScrollRef.current = true;
    messagesEndRef.current?.scrollIntoView({ behavior });
    // Reset the flag after a short delay
    setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, 300);
  };

  const handleScrollButtonClick = () => {
    scrollToBottom("smooth");
    // User clicked to go to bottom, so they're no longer scrolling away
    setIsUserScrolling(false);
    setShowScrollButton(false);
  };

  // Unified scroll tracking handler — RAF-throttled to avoid firing setState on every pixel
  const handleScrollTracking = useCallback((container: HTMLElement) => {
    // Ignore scroll events triggered by our own programmatic scrolling
    if (isProgrammaticScrollRef.current) {
      return;
    }

    // Throttle: skip if a RAF is already pending
    if (scrollRafRef.current) return;

    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;

      const distanceFromBottom =
        container.scrollHeight - (container.scrollTop + container.clientHeight);
      distanceFromBottomRef.current = distanceFromBottom;

      const scrollAwayThreshold = 150;

      if (distanceFromBottom > scrollAwayThreshold) {
        setIsUserScrolling(true);
        setShowScrollButton(true);

        if (userScrollTimeoutRef.current) {
          window.clearTimeout(userScrollTimeoutRef.current);
        }

        userScrollTimeoutRef.current = window.setTimeout(() => {
          setIsUserScrolling(false);
        }, 1000);
      } else {
        setIsUserScrolling(false);
        setShowScrollButton(false);
      }
    });
  }, []);

  // Callback to receive scrollerRef from Virtuoso (production mode)
  // scrollerRef is called with the element on mount and null on unmount
  const handleScrollerRef = useCallback(
    (ref: HTMLElement | Window | null) => {
      // Always cleanup previous listener first
      if (scrollerCleanupRef.current) {
        scrollerCleanupRef.current();
        scrollerCleanupRef.current = null;
      }

      // If ref is null or window, nothing to attach to
      if (!ref || ref === window) return;

      const element = ref as HTMLElement;
      const handleScroll = () => handleScrollTracking(element);
      element.addEventListener("scroll", handleScroll, { passive: true });

      // Store cleanup function for later invocation
      scrollerCleanupRef.current = () => {
        element.removeEventListener("scroll", handleScroll);
      };
    },
    [handleScrollTracking],
  );

  useEffect(() => {
    const streamCount = chatId ? (streamCountById.get(chatId) ?? 0) : 0;
    console.log("streamCount - scrolling to bottom", streamCount);
    scrollToBottom();
  }, [chatId, chatId ? (streamCountById.get(chatId) ?? 0) : 0]);

  const fetchChatMessages = useCallback(async () => {
    if (!chatId) {
      // no-op when no chat
      return;
    }
    const chat = await ipc.chat.getChat(chatId);
    setMessagesById((prev) => {
      const next = new Map(prev);
      next.set(chatId, chat.messages);
      return next;
    });

    // Scroll to bottom after messages load
    // Use double-RAF to ensure DOM is painted, then one idle callback for late-rendering content
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollToBottom("instant");
        // Single deferred scroll for async content (timestamps, etc.) instead of 3 nested setTimeouts
        const idleCallback = typeof requestIdleCallback === 'function'
          ? requestIdleCallback
          : (cb: () => void) => setTimeout(cb, 200);
        idleCallback(() => scrollToBottom("instant"));
      });
    });
  }, [chatId, setMessagesById]);

  useEffect(() => {
    fetchChatMessages();
  }, [fetchChatMessages]);

  const rawMessages = chatId ? (messagesById.get(chatId) ?? []) : [];
  // useDeferredValue lets React render a "stale" version of messages while computing the new one,
  // keeping the chat input and scroll responsive during streaming
  const messages = useDeferredValue(rawMessages);
  const isStreaming = chatId ? (isStreamingById.get(chatId) ?? false) : false;

  // Scroll to bottom when streaming completes to ensure footer content is visible
  useEffect(() => {
    const wasStreaming = prevIsStreamingRef.current;
    prevIsStreamingRef.current = isStreaming;

    // When streaming transitions from true to false
    if (wasStreaming && !isStreaming) {
      // Double RAF ensures DOM is fully updated with footer content
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          scrollToBottom("smooth");
          // Add a timeout to ensure scroll happens after layout might have changed
          // due to footer appearing (buttons, etc.)
          setTimeout(() => {
            scrollToBottom("smooth");
          }, 150);
        });
      });
    }
  }, [isStreaming]);

  // Test mode only: Attach scroll listener to messagesContainerRef
  // In production mode, handleScrollerRef attaches to Virtuoso's scroller
  useEffect(() => {
    const isTestMode = settings?.isTestMode;
    if (!isTestMode) return; // Only for test mode

    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => handleScrollTracking(container);
    container.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [handleScrollTracking, settings?.isTestMode]);

  // Test mode: Auto-scroll during streaming (280px threshold)
  // Note: Virtuoso handles this via followOutput in production mode
  useEffect(() => {
    const isTestMode = settings?.isTestMode;
    if (!isTestMode) return; // Only for test mode

    if (
      !isUserScrolling &&
      isStreaming &&
      messagesEndRef.current &&
      distanceFromBottomRef.current <= 280
    ) {
      requestAnimationFrame(() => {
        scrollToBottom("instant");
      });
    }
  }, [messages, isUserScrolling, isStreaming, settings?.isTestMode]);

  // Cleanup timeout, RAF, and scroller listener on unmount
  useEffect(() => {
    return () => {
      if (userScrollTimeoutRef.current) {
        window.clearTimeout(userScrollTimeoutRef.current);
      }
      if (scrollRafRef.current) {
        cancelAnimationFrame(scrollRafRef.current);
      }
      if (scrollerCleanupRef.current) {
        scrollerCleanupRef.current();
        scrollerCleanupRef.current = null;
      }
    };
  }, []);

  const isPlanMode = settings?.selectedChatMode === "plan" || preservePlanMode;

  return (
    <div className="flex flex-col h-full">
      <div className="relative">
        <ChatHeader
          isPreviewOpen={isPreviewOpen}
          onTogglePreview={onTogglePreview}
          isLogsOpen={isLogsOpen}
          onToggleLogs={() => setIsLogsOpen(!isLogsOpen)}
        />
        {chatId && (
          <ChatLogsPanel
            chatId={chatId}
            isOpen={isLogsOpen}
            onClose={() => setIsLogsOpen(false)}
          />
        )}
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 relative overflow-hidden">
            {!isPlanMode ? (
              <MessagesList
                messages={messages}
                messagesEndRef={messagesEndRef}
                ref={messagesContainerRef}
                onScrollerRef={handleScrollerRef}
                distanceFromBottomRef={distanceFromBottomRef}
                isUserScrolling={isUserScrolling}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground animate-in fade-in duration-300">
                {chatId && isStreamingById.get(chatId) ? (
                  <div className="flex flex-col items-center gap-4">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <p className="text-sm font-medium">
                      Diseñando el plan...
                    </p>
                  </div>
                ) : null}
              </div>
            )}

            {/* Scroll to bottom button */}
            {showScrollButton && !isPlanMode && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10">
                <Button
                  onClick={handleScrollButtonClick}
                  size="icon"
                  className="rounded-full shadow-lg hover:shadow-xl transition-[background-color,box-shadow] border border-border/50 bg-background hover:bg-accent"
                  variant="outline"
                  title={"Ir al final"}
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          <ChatError error={error} onDismiss={() => setError(null)} />
          {showFreeAgentQuotaBanner && (
            <FreeAgentQuotaBanner
              onSwitchToBuildMode={() =>
                updateSettings({ selectedChatMode: "build" })
              }
            />
          )}
          <PlanPanel chatId={chatId} />
          <ChatInput
            chatId={chatId}
            autoStart={autoStart}
            isPlanMode={isPlanMode}
          />
        </div>
      </div>
    </div>
  );
}
