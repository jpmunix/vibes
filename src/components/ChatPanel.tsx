import React, { useState, useRef, useEffect, useCallback, Suspense, useMemo } from "react";
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
const ChatLogsPanel = React.lazy(() =>
  import("./chat/ChatLogsPanel").then((m) => ({ default: m.ChatLogsPanel }))
);
import { Button } from "@/components/ui/button";
import { ArrowDown, Loader2 } from "lucide-react";
import { useSettings } from "@/hooks/useSettings";
const PlanPanel = React.lazy(() =>
  import("./chat/PlanPanel").then((m) => ({ default: m.PlanPanel }))
);
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
  const [isLoadingMessages, setIsLoadingMessages] = useState(!!chatId);
  const streamCountById = useAtomValue(chatStreamCountByIdAtom);
  const isStreamingById = useAtomValue(isStreamingByIdAtom);
  const { settings, updateSettings } = useSettings();
  const showFreeAgentQuotaBanner = false; // Pro always enabled after acquisition

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

    const currentMessages = chatId ? (messagesById.get(chatId) ?? []) : [];
    if (settings.selectedChatMode === "plan" && currentMessages.length > 0) {
      const isStreaming = isStreamingById.get(chatId) ?? false;
      if (!isStreaming) {
        hasResetModeRef.current = chatId;
        const defaultMode = settings.defaultChatMode || "build";
        const resetTo = defaultMode === "plan" ? "build" : defaultMode;
        updateSettings({ selectedChatMode: resetTo });
      }
    }
  }, [chatId, settings, isStreamingById, updateSettings, messagesById]);

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

  // Keep track of test mode to conditionally use manual scroll math
  const isTestModeRef = useRef(settings?.isTestMode);
  useEffect(() => {
    isTestModeRef.current = settings?.isTestMode;
  }, [settings?.isTestMode]);

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

      if (!isTestModeRef.current) return;

      const scrollAwayThreshold = 150;

      // Prevent showing the button if there isn't actually enough content to scroll.
      // E.g. when app regains focus or resizes and scrollHeight is very close to clientHeight
      const isScrollable = container.scrollHeight - container.clientHeight > 10;

      if (isScrollable && distanceFromBottom > scrollAwayThreshold) {
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

    // Scroll to bottom after messages load, then reveal.
    // Use double-RAF to ensure Virtuoso has measured & painted all items,
    // then one idle callback for late-rendering content (timestamps, avatars, etc.)
    // Only AFTER that, remove the skeleton overlay so the user sees no jumps.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollToBottom("instant");
        const idleCallback = typeof requestIdleCallback === 'function'
          ? requestIdleCallback
          : (cb: () => void) => setTimeout(cb, 200);
        idleCallback(() => {
          scrollToBottom("instant");
          // Reveal messages now that Virtuoso layout is stable
          setIsLoadingMessages(false);
        });
      });
    });
  }, [chatId, setMessagesById]);

  useEffect(() => {
    fetchChatMessages();
  }, [fetchChatMessages]);

  // Reset loading state when chatId changes — ensures skeleton shows
  // even when chatId arrives late (e.g. set via atom after first render)
  useEffect(() => {
    if (chatId && !messagesById.has(chatId)) {
      setIsLoadingMessages(true);
    }
  }, [chatId]);

  const messages = chatId ? (messagesById.get(chatId) ?? []) : [];
  const isStreaming = chatId ? (isStreamingById.get(chatId) ?? false) : false;

  // Progressive loading: start with the last INITIAL_VISIBLE messages,
  // load more in chunks when scrolling up. Prevents render storms on long chats.
  const INITIAL_VISIBLE = 6;
  const LOAD_MORE_COUNT = 6;
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);

  // Reset visible count when chat changes
  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE);
  }, [chatId]);

  // Expand visible count when streaming adds new messages
  useEffect(() => {
    if (isStreaming && messages.length <= visibleCount + 1) {
      setVisibleCount(messages.length);
    }
  }, [isStreaming, messages.length]);

  const progressiveMessages = useMemo(() => {
    if (messages.length <= visibleCount) return messages;
    return messages.slice(messages.length - visibleCount);
  }, [messages, visibleCount]);

  const hasMoreMessages = messages.length > visibleCount;

  const handleLoadMore = useCallback(() => {
    setVisibleCount((prev) => Math.min(prev + LOAD_MORE_COUNT, messages.length));
  }, [messages.length]);

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
          <Suspense fallback={null}>
            <ChatLogsPanel
              chatId={chatId}
              isOpen={isLogsOpen}
              onClose={() => setIsLogsOpen(false)}
            />
          </Suspense>
        )}
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0">
          <div
            className="flex-1 relative overflow-hidden"
            onClick={(e) => {
              // Focus chat input when clicking empty space in the chat panel
              const target = e.target as HTMLElement;
              // Don't steal focus from interactive elements or text selections
              const isInteractive = target.closest('button, a, input, textarea, select, [role="button"], [contenteditable="true"], pre, code, [data-testid="favorite-button"]');
              const hasSelection = window.getSelection()?.toString();
              if (!isInteractive && !hasSelection) {
                const editable = document.querySelector('[data-testid="chat-input-container"] [contenteditable="true"]') as HTMLElement;
                editable?.focus();
              }
            }}
          >
            {!isPlanMode ? (
              <>
                {/* Always mount MessagesList so Virtuoso can measure items
                    while the skeleton is still visible on top */}
                <div className={isLoadingMessages ? "opacity-0" : "opacity-100 animate-in fade-in duration-150"}>
                  <MessagesList
                    messages={progressiveMessages}
                    messagesEndRef={messagesEndRef}
                    ref={messagesContainerRef}
                    onScrollerRef={handleScrollerRef}
                    distanceFromBottomRef={distanceFromBottomRef}
                    isUserScrolling={isUserScrolling}
                    hasMoreMessages={hasMoreMessages}
                    onLoadMore={handleLoadMore}
                    firstItemIndex={messages.length > visibleCount ? messages.length - visibleCount : 0}
                    onAtBottomStateChange={(atBottom) => {
                      if (!settings?.isTestMode) {
                        setShowScrollButton(!atBottom);
                      }
                    }}
                  />
                </div>
                {/* Skeleton overlay — covers MessagesList while it renders */}
                {isLoadingMessages && (
                  <div className="absolute inset-0 z-10 bg-background">
                    <ChatMessagesSkeleton />
                  </div>
                )}
              </>
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
          <Suspense fallback={null}>
            <PlanPanel chatId={chatId} />
          </Suspense>
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

// ─── Skeleton shown while messages load from IPC ────────────────────────
function ChatMessagesSkeleton() {
  return (
    <div className="h-full overflow-hidden px-4 animate-in fade-in duration-200">
      <div className="max-w-3xl mx-auto flex flex-col gap-5 pt-6">
        {/* User message skeleton */}
        <div className="flex justify-end">
          <div className="w-[55%] h-11 rounded-2xl bg-muted/60 animate-pulse" style={{ animationDelay: "0ms" }} />
        </div>

        {/* Assistant message skeleton */}
        <div className="flex flex-col gap-2.5 pl-1">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-7 h-7 rounded-full bg-muted/60 animate-pulse" />
            <div className="w-16 h-3.5 rounded bg-muted/60 animate-pulse" />
          </div>
          <div className="w-[85%] h-3.5 rounded bg-muted/50 animate-pulse" style={{ animationDelay: "75ms" }} />
          <div className="w-[72%] h-3.5 rounded bg-muted/50 animate-pulse" style={{ animationDelay: "150ms" }} />
          <div className="w-[60%] h-3.5 rounded bg-muted/50 animate-pulse" style={{ animationDelay: "225ms" }} />
          <div className="w-[40%] h-3.5 rounded bg-muted/50 animate-pulse" style={{ animationDelay: "300ms" }} />
        </div>

        {/* Second user message skeleton */}
        <div className="flex justify-end">
          <div className="w-[40%] h-11 rounded-2xl bg-muted/60 animate-pulse" style={{ animationDelay: "200ms" }} />
        </div>

        {/* Second assistant message skeleton */}
        <div className="flex flex-col gap-2.5 pl-1">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-7 h-7 rounded-full bg-muted/60 animate-pulse" style={{ animationDelay: "250ms" }} />
            <div className="w-16 h-3.5 rounded bg-muted/60 animate-pulse" style={{ animationDelay: "250ms" }} />
          </div>
          <div className="w-[90%] h-3.5 rounded bg-muted/50 animate-pulse" style={{ animationDelay: "325ms" }} />
          <div className="w-[78%] h-3.5 rounded bg-muted/50 animate-pulse" style={{ animationDelay: "400ms" }} />
          <div className="w-[65%] h-3.5 rounded bg-muted/50 animate-pulse" style={{ animationDelay: "475ms" }} />
        </div>
      </div>
    </div>
  );
}
