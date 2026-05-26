import React from "react";
import type { Message } from "@/ipc/types";
import { forwardRef, useState, useCallback, useMemo, Suspense, useRef, useEffect } from "react";
import ChatMessage from "./ChatMessage";
import { StickyUserMessage } from "./StickyUserMessage";
const SetupBanner = React.lazy(() =>
  import("../SetupBanner").then((m) => ({ default: m.SetupBanner }))
);
const OpenRouterSetupBanner = React.lazy(() =>
  import("../SetupBanner").then((m) => ({ default: m.OpenRouterSetupBanner }))
);

import { useStreamChat } from "@/hooks/useStreamChat";
import {
  selectedChatIdAtom,
  autoRouterModelInfoByChatIdAtom,
  isSelectingModelByIdAtom,
} from "@/atoms/chatAtoms";
import { userAtom } from "@/atoms/authAtoms";
import { useAtomValue } from "jotai";
import { CheckCircle2 } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { showError, showSuccess } from "@/lib/toast";
import { ipc } from "@/ipc/types";

import { useLanguageModelProviders } from "@/hooks/useLanguageModelProviders";
import { useSettings } from "@/hooks/useSettings";
import { useUserBudgetInfo } from "@/hooks/useUserBudgetInfo";
import { PromoMessage } from "./PromoMessage";
import { ContextLimitBanner } from "./ContextLimitBanner";
import { useCountTokens } from "@/hooks/useCountTokens";
import { AutoRouterSelectedMessage } from "./AutoRouterSelectedMessage";

interface MessagesListProps {
  messages: Message[];
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  hasMoreMessages?: boolean;
  onLoadMore?: () => void;
}

// Memoize ChatMessage at module level to prevent recreation on every render
const MemoizedChatMessage = React.memo(ChatMessage);

// Context type for Footer component
interface FooterContext {
  messages: Message[];
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  isStreaming: boolean;
  tokenCountResult: ReturnType<typeof useCountTokens>["result"];
  appId: number | null;
  settings: ReturnType<typeof useSettings>["settings"];
  userBudget: ReturnType<typeof useUserBudgetInfo>["userBudget"];
  renderSetupBanner: () => React.ReactNode;
  isSelectingModel: boolean;
  autoRouterModelInfo: ReturnType<
    typeof useAtomValue<typeof autoRouterModelInfoByChatIdAtom>
  >;
  todoId: number | null;
  isTodoCompleted: boolean;
  onMarkTodoCompleted: () => void;
}


// Footer component - receives context via props (memoized to skip unnecessary renders)
// IMPORTANT: This component must NOT use any hooks (useState, useEffect, etc.)
// to avoid conditional hook calls when context is undefined.
const FooterComponent = React.memo(function FooterComponent({ context }: { context?: FooterContext }) {
  if (!context) return null;

  const {
    messages,
    messagesEndRef,
    isStreaming,
    tokenCountResult,
    renderSetupBanner,
    todoId,
    isTodoCompleted,
    onMarkTodoCompleted,
  } = context;

  return (
    <>
      {/* Show context limit banner when close to token limit */}
      {!isStreaming && tokenCountResult && messages.length > 0 && (
        <ContextLimitBanner
          totalTokens={tokenCountResult.actualMaxTokens}
          contextWindow={tokenCountResult.contextWindow}
        />
      )}

      {!isStreaming && messages.length > 0 && (
        <div className="flex max-w-3xl mx-auto gap-2 pt-2 pb-4 justify-end">

          {todoId && (
            <Button
              variant="outline"
              size="sm"
              disabled={isTodoCompleted}
              className={
                isTodoCompleted
                  ? "bg-green-500/20 border-green-500/30 text-white hover:bg-green-500/20"
                  : ""
              }
              onClick={onMarkTodoCompleted}
            >
              <CheckCircle2 size={16} className="mr-1" />
              {isTodoCompleted ? "Completada" : "Marcar como completada"}
            </Button>
          )}
        </div>
      )}

      {messages.length > 0 && renderSetupBanner()}

      {/* Spacer to push content above the floating ChatInput */}
      {messages.length > 0 && <div className="h-32 w-full" />}

      {/* Scroll anchor at the very end to ensure all content above is visible */}
      <div ref={messagesEndRef} />
    </>
  );
});

export const MessagesList = forwardRef<HTMLDivElement, MessagesListProps>(
  function MessagesList(
    {
      messages,
      messagesEndRef,
      hasMoreMessages,
      onLoadMore,
    },
    ref,
  ) {
    const appId = useAtomValue(selectedAppIdAtom);
    const { isStreaming, streamMessage } = useStreamChat();
    const { isAnyProviderSetup, isProviderSetup } = useLanguageModelProviders();
    const { settings, updateSettings } = useSettings();
    const [todoId, setTodoId] = useState<number | null>(null);
    const [isTodoCompleted, setIsTodoCompleted] = useState(false);
    const selectedChatId = useAtomValue(selectedChatIdAtom);
    const { userBudget } = useUserBudgetInfo();
    const autoRouterModelInfo = useAtomValue(autoRouterModelInfoByChatIdAtom);
    const isSelectingModelById = useAtomValue(isSelectingModelByIdAtom);
    const isSelectingModel = selectedChatId
      ? (isSelectingModelById.get(selectedChatId) ?? false)
      : false;
    const user = useAtomValue(userAtom);

    // Fetch todoId from chat
    React.useEffect(() => {
      if (selectedChatId) {
        ipc.chat
          .getChat(selectedChatId)
          .then((chat) => {
            setTodoId(chat.todoId ?? null);
          })
          .catch((error) => {
            console.error("Error fetching chat:", error);
          });
      }
    }, [selectedChatId]);

    // Fetch todo completion status (moved from FooterComponent to avoid hooks-in-conditional)
    React.useEffect(() => {
      if (todoId && appId) {
        ipc.todo
          .getTodosByApp(appId)
          .then((todos) => {
            const todo = todos.find((t) => t.id === todoId);
            if (todo) {
              setIsTodoCompleted(todo.completed);
            }
          })
          .catch((error) => {
            console.error("Error fetching todo:", error);
          });
      } else {
        setIsTodoCompleted(false);
      }
    }, [todoId, appId]);


    // Only fetch token count when not streaming
    const { result: tokenCountResult } = useCountTokens(
      !isStreaming ? selectedChatId : null,
      "",
    );



    // Stabilize renderSetupBanner with proper dependencies
    const renderSetupBanner = useCallback(() => {
      // SetupBanner is only relevant in the main window. In the dedicated
      // chat window (URL contains ?window=chat) it should never render —
      // it pulls in navigation/settings UI that doesn't work in memory router.
      if (window.location.search.includes("window=chat")) {
        return null;
      }

      const selectedModel = settings?.selectedModel;
      if (
        selectedModel?.name === "free" &&
        selectedModel?.provider === "auto" &&
        !isProviderSetup("openrouter")
      ) {
        return (
          <Suspense fallback={null}>
            <OpenRouterSetupBanner className="w-full" />
          </Suspense>
        );
      }
      if (!isAnyProviderSetup()) {
        return (
          <Suspense fallback={null}>
            <SetupBanner />
          </Suspense>
        );
      }
      return null;
    }, [
      settings?.selectedModel?.name,
      settings?.selectedModel?.provider,
      isProviderSetup,
      isAnyProviderSetup,
    ]);

    // Sentinel ref for IntersectionObserver (progressive loading trigger)
    const sentinelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const sentinel = sentinelRef.current;
      if (!hasMoreMessages || !sentinel || !onLoadMore) return;

      const observer = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting) {
            onLoadMore();
          }
        },
        { threshold: 0.1 },
      );

      observer.observe(sentinel);
      return () => observer.disconnect();
    }, [hasMoreMessages, onLoadMore]);

    // ── Sticky user message tracking ────────────────────────────────────
    // Track which user message should be shown as sticky (the last one that
    // scrolled above the viewport while its assistant response is still visible).
    const [stickyUserMessage, setStickyUserMessage] = useState<Message | null>(null);
    const userMessageRefsMap = useRef<Map<number, HTMLDivElement>>(new Map());

    // Register a user message DOM element
    const registerUserMessageRef = useCallback((messageId: number, el: HTMLDivElement | null) => {
      if (el) {
        userMessageRefsMap.current.set(messageId, el);
      } else {
        userMessageRefsMap.current.delete(messageId);
      }
    }, []);

    // Get only user messages for tracking
    const userMessages = useMemo(
      () => messages.filter((m) => m.role === "user"),
      [messages],
    );

    // IntersectionObserver to detect user messages leaving/entering the viewport
    useEffect(() => {
      // We need the scroll container (passed via ref) — it's the parent with overflow-y-auto
      // Since ref is a forwarded ref, we access it via a callback or the parent's ref.
      // We'll use the root: null approach (viewport) and check positions manually.

      if (userMessages.length === 0) {
        setStickyUserMessage(null);
        return;
      }

      const scrollContainer = (ref as React.RefObject<HTMLDivElement | null>)?.current;
      if (!scrollContainer) return;

      const handleScroll = () => {
        const containerRect = scrollContainer.getBoundingClientRect();
        let lastAboveUser: Message | null = null;

        // Find the last user message whose element is above the scroll container's top
        for (const msg of userMessages) {
          const el = userMessageRefsMap.current.get(msg.id);
          if (!el) continue;
          const elRect = el.getBoundingClientRect();
          // The message is "above" if its bottom is above the container's top edge
          // (with a small threshold so it triggers slightly before fully leaving)
          if (elRect.bottom < containerRect.top + 8) {
            lastAboveUser = msg;
          }
        }

        setStickyUserMessage(lastAboveUser);
      };

      // RAF-throttled scroll handler
      let rafId: number | null = null;
      const throttledScroll = () => {
        if (rafId) return;
        rafId = requestAnimationFrame(() => {
          rafId = null;
          handleScroll();
        });
      };

      scrollContainer.addEventListener("scroll", throttledScroll, { passive: true });
      // Run once on mount to set initial state
      handleScroll();

      return () => {
        scrollContainer.removeEventListener("scroll", throttledScroll);
        if (rafId) cancelAnimationFrame(rafId);
      };
    }, [userMessages, ref]);

    // Scroll to the original user message when clicking the sticky bar
    const handleScrollToStickyMessage = useCallback(() => {
      if (!stickyUserMessage) return;
      const el = userMessageRefsMap.current.get(stickyUserMessage.id);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, [stickyUserMessage]);

    // Stable callback for marking todo as completed
    const handleMarkTodoCompleted = useCallback(async () => {
      if (!todoId) return;
      try {
        await ipc.todo.updateTodo({ todoId, completed: true });
        setIsTodoCompleted(true);
        await ipc.todo.generateTodoSummary(todoId);
        showSuccess("Tarea marcada como completada y resumen generado");
      } catch (error) {
        showError(`Error al marcar tarea: ${(error as Error).message}`);
      }
    }, [todoId]);

    // Create context object for Footer component with stable references
    const footerContext = useMemo<FooterContext>(
      () => ({
        messages,
        messagesEndRef,
        isStreaming,
        tokenCountResult,
        appId,
        settings,
        userBudget,
        renderSetupBanner,
        isSelectingModel,
        autoRouterModelInfo,
        todoId,
        isTodoCompleted,
        onMarkTodoCompleted: handleMarkTodoCompleted,
      }),
      [
        messages,
        messagesEndRef,
        isStreaming,
        tokenCountResult,
        appId,
        settings,
        userBudget,
        isSelectingModel,
        autoRouterModelInfo,
        renderSetupBanner,
        todoId,
        isTodoCompleted,
        handleMarkTodoCompleted,
      ],
    );

    // Render empty state or setup banner
    const renderEmptyState = useCallback(() => {
      const setupBanner = renderSetupBanner ? renderSetupBanner() : null;
      if (setupBanner) {
        return <div className="h-full py-4">{setupBanner}</div>;
      }
      return (
        <div className="flex flex-col items-center justify-center h-full min-h-[50vh] max-w-2xl mx-auto">
          <div className="flex flex-1 items-center justify-center typo-body text-muted-foreground">
            Aún no hay mensajes
          </div>
        </div>
      );
    }, [renderSetupBanner]);

    return (
      <div className="relative w-full h-full">
        <div
          className="absolute inset-0 overflow-y-auto flex flex-col-reverse"
          ref={ref}
          data-testid="messages-list"
        >
          {/* Single wrapper child — column-reverse on parent makes scroll start at bottom naturally */}
          <div className="px-4 pt-4 pb-8">
            {/* Sentinel for progressive loading of older messages */}
            {hasMoreMessages && (
              <div ref={sentinelRef} className="flex justify-center py-3">
                <div className="text-xs text-muted-foreground animate-pulse">
                  Cargando mensajes anteriores…
                </div>
              </div>
            )}

            {messages.length === 0 && renderEmptyState()}

            {messages.map((message, index) => {
              const isLastMessage = index === messages.length - 1;
              const isLastUserMessage = message.role === "user" && isLastMessage;
              const hasAssistantResponseAfter =
                isLastMessage &&
                messages.length > index + 1 &&
                messages[index + 1]?.role === "assistant";
              const shouldShowAutoRouter =
                isLastUserMessage &&
                !hasAssistantResponseAfter &&
                (isSelectingModel ||
                  autoRouterModelInfo.get(selectedChatId ?? 0));
              const currentAutoRouterInfo = selectedChatId
                ? autoRouterModelInfo.get(selectedChatId)
                : undefined;

              return (
                <div
                  key={message.id}
                  ref={message.role === "user" ? (el) => registerUserMessageRef(message.id, el) : undefined}
                >
                  <div className="px-4">
                    <MemoizedChatMessage
                      message={message}
                      isLastMessage={isLastMessage}
                      user={user}
                    />
                  </div>
                  {shouldShowAutoRouter && (
                    <AutoRouterSelectedMessage
                      modelInfo={currentAutoRouterInfo}
                      isSelecting={isSelectingModel}
                    />
                  )}
                </div>
              );
            })}

            <FooterComponent context={footerContext} />
          </div>
        </div>

        {/* Sticky user message bar — positioned outside scroll container so it stays fixed at top */}
        <StickyUserMessage
          content={stickyUserMessage?.content ?? ""}
          onScrollToMessage={handleScrollToStickyMessage}
          visible={!!stickyUserMessage}
        />
      </div>
    );
  },
);
