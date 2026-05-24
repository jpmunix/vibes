import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import {
  chatMessagesByIdAtom,
  isStreamingByIdAtom,
} from "../atoms/chatAtoms";
import { ipc } from "@/ipc/types";

import { type ComponentProps } from "react";
import { ChatHeader } from "./chat/ChatHeader";
import { MessagesList } from "./chat/MessagesList";
import { ChatInput } from "./chat/ChatInput";
import { ChatError } from "./chat/ChatError";
import { CrossChatNotification } from "./chat/CrossChatNotification";
import { MessagePreviewModal } from "./chat/MessagePreviewModal";


import { Button } from "@/components/ui/button";
import { ArrowDown, Loader2 } from "@/components/ui/icons";
import { useSettings } from "@/hooks/useSettings";


interface ChatPanelProps {
  chatId?: number;
  autoStart?: boolean;
  isPreviewOpen: boolean;
  onTogglePreview: () => void;
  /** When true, don't reset plan mode to build on first load (used when opening a new app in plan mode) */
  preservePlanMode?: boolean;
  /** When true, hide preview-related controls (workspace mode) */
  workspaceMode?: boolean;
}

export function ChatPanel({
  chatId,
  autoStart,
  isPreviewOpen,
  onTogglePreview,
  preservePlanMode,
  workspaceMode,
}: ChatPanelProps) {
  const messagesById = useAtomValue(chatMessagesByIdAtom);
  const setMessagesById = useSetAtom(chatMessagesByIdAtom);
  const [error, setError] = useState<string | null>(null);
  // Start with loading=true to avoid flashing "Aún no hay mensajes" while chatId resolves
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);

  const isStreamingById = useAtomValue(isStreamingByIdAtom);
  
  // Track streaming state in a ref so we can read it inside fetchChatMessages without causing re-renders
  const isStreamingRef = useRef(false);
  useEffect(() => {
    isStreamingRef.current = chatId ? (isStreamingById.get(chatId) ?? false) : false;
  }, [isStreamingById, chatId]);

  const { settings, updateSettings } = useSettings();




  // When entering a chat that is NOT actively streaming, reset "plan" mode
  // to the user's default. Plan mode is only forced on the Home screen for
  // new app creation; once inside an existing app it should use the user's
  // preferred mode (build / agent).
  const hasResetModeRef = useRef<number | undefined>(undefined);
  const preservePlanModeRef = useRef(preservePlanMode);

  // Clear the preserve flag once streaming starts (plan mode has been "used"),
  // AND mark the chatId as processed so the mode-reset effect won't fire after
  // the stream ends and accidentally switch plan → agent.
  useEffect(() => {
    if (chatId && (isStreamingById.get(chatId) ?? false)) {
      preservePlanModeRef.current = false;
      // Mark as processed — the user actively used this mode in this chat,
      // so we must NOT reset it when streaming finishes.
      hasResetModeRef.current = chatId;
    }
  }, [chatId, isStreamingById]);

  useEffect(() => {
    if (!chatId || !settings) return;
    // Only process once per chatId
    if (hasResetModeRef.current === chatId) return;
    // Don't reset plan mode if explicitly preserved (new app window in plan mode)
    if (preservePlanModeRef.current) return;
    // Don't reset while actively streaming — wait until stream completes to evaluate.
    // (But by then hasResetModeRef will be set by the effect above, so it won't reset.)
    if (isStreamingById.get(chatId) ?? false) return;

    const currentMessages = chatId ? (messagesById.get(chatId) ?? []) : [];
    if (settings.selectedChatMode === "plan" && currentMessages.length > 0) {
      // Plan mode was carried over from a previous session into an existing chat — reset it
      hasResetModeRef.current = chatId;
      const defaultMode = settings.defaultChatMode || "agent";
      const resetTo = defaultMode === "plan" ? "agent" : defaultMode;
      updateSettings({ selectedChatMode: resetTo });
    } else if (settings.selectedChatMode !== "plan") {
      // User entered the chat in agent/build mode — mark as processed so that if they
      // manually switch to plan later, this effect won't fire and revert it.
      hasResetModeRef.current = chatId;
    }
  }, [chatId, settings, isStreamingById, updateSettings, messagesById]);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);



  // Scroll-related state
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isUserScrolling, setIsUserScrolling] = useState(false);


  // Refs for scroll tracking
  const distanceFromBottomRef = useRef<number>(0);
  const userScrollTimeoutRef = useRef<number | null>(null);
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

      // With column-reverse: scrollTop=0 at bottom, negative when scrolled up
      const distanceFromBottom = Math.abs(container.scrollTop);
      distanceFromBottomRef.current = distanceFromBottom;

      const scrollAwayThreshold = 150;

      // Prevent showing the button if there isn't actually enough content to scroll.
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



  const fetchChatMessages = useCallback(async () => {
    if (!chatId) {
      // No chat selected yet — keep skeleton visible while chatId resolves.
      // Don't call setIsLoadingMessages(false) here so the skeleton stays.
      return;
    }
    try {
      const chat = await ipc.chat.getChat(chatId);
      const dbLastAssistantForLog = [...chat.messages].reverse().find(m => m.role === "assistant");
      console.log(`[TRACE:fetchChat] chatId=${chatId} dbMsgs=${chat.messages.length} dbLastAssistant.id=${dbLastAssistantForLog?.id} dbContent=${dbLastAssistantForLog?.content?.length ?? 0}ch isStreaming=${isStreamingRef.current}`);

      setMessagesById((prev) => {
        // Protect against overwriting fresh local state with slightly stale DB state
        if (chatId) {
          const currentMessages = prev.get(chatId) ?? [];
          const localLastAssistantForLog = [...currentMessages].reverse().find(m => m.role === "assistant");
          
          // If we are actively streaming right now, do not overwrite local messages
          if (isStreamingRef.current) {
            console.log(`[TRACE:fetchChat:SKIP] reason=isStreaming localMsgs=${currentMessages.length} localLastAssistant.id=${localLastAssistantForLog?.id} localContent=${localLastAssistantForLog?.content?.length ?? 0}ch`);
            return prev;
          }

          // If we have optimistic messages (negative IDs) or we already have more messages
          // than the DB has, it means our local UI is ahead of what was just fetched.
          const hasOptimisticMessages = currentMessages.some(m => m.id < 0);
          if (hasOptimisticMessages || currentMessages.length > chat.messages.length) {
            console.log(`[TRACE:fetchChat:SKIP] reason=optimistic/ahead hasOptimistic=${hasOptimisticMessages} localMsgs=${currentMessages.length} dbMsgs=${chat.messages.length}`);
            return prev;
          }

          // Guard against race condition: the DB fetch may arrive with an empty placeholder
          // while the stream has already delivered real content to the atom.
          // If the local assistant message has MORE content than the DB version for the
          // same message ID, keep the local (streamed) version.
          const dbLastAssistant = [...chat.messages].reverse().find(m => m.role === "assistant");
          const localLastAssistant = [...currentMessages].reverse().find(m => m.role === "assistant");
          if (
            dbLastAssistant && localLastAssistant &&
            dbLastAssistant.id === localLastAssistant.id &&
            (localLastAssistant.content?.length ?? 0) > (dbLastAssistant.content?.length ?? 0)
          ) {
            console.log(`[TRACE:fetchChat:SKIP] reason=localRicher localContent=${localLastAssistant.content?.length ?? 0}ch dbContent=${dbLastAssistant.content?.length ?? 0}ch id=${dbLastAssistant.id}`);
            // Local atom has richer content → the DB save hasn't caught up yet, keep local
            return prev;
          }

          console.log(`[TRACE:fetchChat:APPLY] overwriting atom with DB. localMsgs=${currentMessages.length} dbMsgs=${chat.messages.length} localLastContent=${localLastAssistantForLog?.content?.length ?? 0}ch dbLastContent=${dbLastAssistantForLog?.content?.length ?? 0}ch`);
        }

        const next = new Map(prev);
        next.set(chatId, chat.messages);
        return next;
      });

      // With column-reverse, content naturally starts at the bottom.
      // Just reveal once messages are set — no scroll needed.
      requestAnimationFrame(() => {
        setIsLoadingMessages(false);
      });
    } catch (err) {
      console.error("Error fetching chat messages:", err);
      // On error, still clear loading so the UI isn't stuck on skeleton
      setIsLoadingMessages(false);
    }
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
  }, [chatId, messagesById]);
  // ── Derived state (needed early for recovery polling effect) ─────────
  const messages = chatId ? (messagesById.get(chatId) ?? []) : [];
  const isStreaming = chatId ? (isStreamingById.get(chatId) ?? false) : false;

  // Use a ref for messagesById to avoid triggering the recovery effect on every single message update (which clears timers)
  const messagesByIdRef = useRef(messagesById);
  useEffect(() => {
    messagesByIdRef.current = messagesById;
  }, [messagesById]);

  // ── A2: Recovery polling for disconnected streams ───────────────────────
  // Detects assistant messages with status="streaming" but no active local
  // stream. This happens when the user disconnected (reload, close browser)
  // while the backend was still processing. We query the stream_task from DB
  // to decide whether to poll (still running) or one-shot refresh (completed).
  useEffect(() => {
    if (!chatId || isStreaming || isLoadingMessages) return;

    const currentMessages = messagesByIdRef.current.get(chatId) ?? [];
    const lastMsg = currentMessages[currentMessages.length - 1];

    // Only trigger if the last message is an assistant message that looks incomplete
    if (!lastMsg || lastMsg.role !== "assistant") return;
    const isStreamingStatus = (lastMsg as any).status === "streaming";
    const isEmpty = !lastMsg.content || lastMsg.content.length === 0;
    if (!isStreamingStatus && !isEmpty) return;

    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    const runPoll = async () => {
      try {
        const task = await ipc.chat.getStreamTask(chatId);
        if (cancelled) return;

        if (task?.status === "running") {
          // Stream is still active in the backend — fetch latest content
          await fetchChatMessages();
        } else {
          // Stream finished (completed/failed/cancelled) — one final DB refresh
          console.log(`[Recovery] Chat ${chatId}: backend stream finished (${task?.status ?? "not found"}) — stopping poll`);
          await fetchChatMessages();
          if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
          }
        }
      } catch (err) {
        console.warn("[Recovery] Polling error:", err);
      }
    };

    const checkStreamTask = async () => {
      try {
        const task = await ipc.chat.getStreamTask(chatId);

        if (cancelled) return;

        if (task?.status === "running") {
          console.log(`[Recovery] Chat ${chatId}: backend stream still running — starting poll`);
          // Fetch immediately once we know it is running, so the user doesn't wait
          await fetchChatMessages();
          if (!cancelled && !pollTimer) {
            pollTimer = setInterval(runPoll, 1_500);
          }
        } else {
          // Stream finished — one-time DB refresh
          console.log(`[Recovery] Chat ${chatId}: backend stream ${task?.status ?? "not found"} — refreshing from DB`);
          await fetchChatMessages();
        }
      } catch (err) {
        console.warn("[Recovery] Failed to check stream task:", err);
      }
    };

    // Small delay to let React state settle, but much shorter than 1s (100ms)
    const initTimer = setTimeout(checkStreamTask, 100);

    return () => {
      cancelled = true;
      clearTimeout(initTimer);
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [chatId, isStreaming, isLoadingMessages, fetchChatMessages]);


  // Progressive loading: start with the last INITIAL_VISIBLE messages,
  // load more in chunks when scrolling up. Prevents render storms on long chats.
  const INITIAL_VISIBLE = 8;
  const LOAD_MORE_COUNT = 20;
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const prevMessageCountRef = useRef(0);

  // Reset visible count when chat changes
  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE);
    prevMessageCountRef.current = 0;
  }, [chatId]);

  // Auto-expand visibleCount when messages are appended at the end (user sends,
  // assistant placeholder added, streaming content). This prevents the progressive
  // slice from shifting and causing a visual jump upward.
  useEffect(() => {
    const prevCount = prevMessageCountRef.current;
    prevMessageCountRef.current = messages.length;

    if (prevCount > 0 && messages.length > prevCount) {
      // Messages were appended — expand visible window by the delta
      const delta = messages.length - prevCount;
      setVisibleCount((prev) => prev + delta);
    }
  }, [messages.length]);

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

    // When streaming transitions from true to false, nudge to bottom
    // so footer buttons become visible
    if (wasStreaming && !isStreaming && distanceFromBottomRef.current < 300) {
      requestAnimationFrame(() => {
        scrollToBottom("smooth");
      });
    }
  }, [isStreaming]);

  // Attach scroll listener to messagesContainerRef
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => handleScrollTracking(container);
    container.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [handleScrollTracking]);

  // Cleanup timeout and RAF on unmount
  useEffect(() => {
    return () => {
      if (userScrollTimeoutRef.current) {
        window.clearTimeout(userScrollTimeoutRef.current);
      }
      if (scrollRafRef.current) {
        cancelAnimationFrame(scrollRafRef.current);
      }
    };
  }, []);

  // Listen for explicit scroll-to-bottom requests (e.g. from ChatInput on submit)
  useEffect(() => {
    const handleScrollRequest = () => {
      setIsUserScrolling(false);
      setShowScrollButton(false);
      scrollToBottom("instant");
    };
    window.addEventListener("vibes:scroll-to-bottom" as any, handleScrollRequest);
    return () => window.removeEventListener("vibes:scroll-to-bottom" as any, handleScrollRequest);
  }, []);

  const isPlanMode = settings?.selectedChatMode === "plan" || preservePlanMode;

  return (
    <>
    <div className="flex flex-col h-full">
      <div className="relative">
        <ChatHeader
          isPreviewOpen={isPreviewOpen}
          onTogglePreview={onTogglePreview}
          workspaceMode={workspaceMode}
        />
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0">
          <div
            className="flex-1 relative overflow-hidden font-chat"
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
            <>
              {/* Mount MessagesList behind the skeleton; it renders natively (no virtualization) */}
              <div className={isLoadingMessages ? "opacity-0" : "opacity-100 animate-in fade-in duration-150"}>
                <MessagesList
                  messages={progressiveMessages}
                  messagesEndRef={messagesEndRef}
                  ref={messagesContainerRef}
                  hasMoreMessages={hasMoreMessages}
                  onLoadMore={handleLoadMore}
                />
              </div>
              {/* Skeleton overlay — covers MessagesList while it renders */}
              {isLoadingMessages && (
                <div className="absolute inset-0 z-10 bg-background">
                  <ChatMessagesSkeleton />
                </div>
              )}
            </>

            {/* Cross-chat notification: alerts when ANOTHER chat has pending questions/permissions */}
            <CrossChatNotification />

            {/* Scroll to bottom button */}
            {showScrollButton && progressiveMessages.length > 0 && (
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


          <ChatInput
            chatId={chatId}
            autoStart={autoStart}
            isPlanMode={isPlanMode}
            workspaceMode={workspaceMode}
          />
        </div>
      </div>
    </div>

    {/* In-app message preview modal (replaces openMessageWindow) */}
    <MessagePreviewModal />
    </>
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
