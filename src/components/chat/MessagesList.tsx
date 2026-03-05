import React from "react";
import type { Message } from "@/ipc/types";
import { forwardRef, useState, useCallback, useMemo, Suspense } from "react";
import { Virtuoso } from "react-virtuoso";
import ChatMessage from "./ChatMessage";
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
import { CheckCircle2 } from "lucide-react";
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
  onScrollerRef?: (ref: HTMLElement | Window | null) => void | (() => void);
  distanceFromBottomRef?: React.MutableRefObject<number>;
  isUserScrolling?: boolean;
  onAtBottomStateChange?: (atBottom: boolean) => void;
}

// Memoize ChatMessage at module level to prevent recreation on every render
const MemoizedChatMessage = React.memo(ChatMessage);

// Context type for Virtuoso
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
}


// Footer component for Virtuoso - receives context via props (memoized to skip unnecessary renders)
const FooterComponent = React.memo(function FooterComponent({ context }: { context?: FooterContext }) {
  if (!context) return null;

  const {
    messages,
    messagesEndRef,
    isStreaming,
    tokenCountResult,
    appId,
    settings,
    userBudget,
    renderSetupBanner,
    todoId,
  } = context;

  const [isTodoCompleted, setIsTodoCompleted] = useState(false);

  // Fetch todo completion status
  React.useEffect(() => {
    if (todoId) {
      ipc.todo
        .getTodosByApp(appId ?? 0)
        .then((todos) => {
          const todo = todos.find((t) => t.id === todoId);
          if (todo) {
            setIsTodoCompleted(todo.completed);
          }
        })
        .catch((error) => {
          console.error("Error fetching todo:", error);
        });
    }
  }, [todoId, appId]);

  return (
    <>
      {/* Show context limit banner when close to token limit */}
      {!isStreaming && tokenCountResult && (
        <ContextLimitBanner
          totalTokens={tokenCountResult.actualMaxTokens}
          contextWindow={tokenCountResult.contextWindow}
        />
      )}

      {!isStreaming && (
        <div className="flex max-w-3xl mx-auto gap-2 pt-6 pb-4">
          {!!messages.length && todoId && (
            <Button
              variant="outline"
              size="sm"
              disabled={isTodoCompleted}
              className={
                isTodoCompleted
                  ? "bg-green-500/20 border-green-500/30 text-white hover:bg-green-500/20"
                  : ""
              }
              onClick={async () => {
                if (!todoId) return;
                try {
                  await ipc.todo.updateTodo({ todoId, completed: true });
                  setIsTodoCompleted(true);
                  // Generate development summary
                  await ipc.todo.generateTodoSummary(todoId);
                  showSuccess("Tarea marcada como completada y resumen generado");
                } catch (error) {
                  showError(
                    `Error al marcar tarea: ${(error as Error).message}`,
                  );
                }
              }}
            >
              <CheckCircle2 size={16} className="mr-1" />
              {isTodoCompleted ? "Completada" : "Marcar como completada"}
            </Button>
          )}
        </div>
      )}

      {renderSetupBanner()}

      {/* Spacer to push content above the floating ChatInput */}
      <div className="h-32 w-full" />

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
      onScrollerRef,
      distanceFromBottomRef,
      isUserScrolling,
      onAtBottomStateChange,
    },
    ref,
  ) {
    const appId = useAtomValue(selectedAppIdAtom);
    const { isStreaming } = useStreamChat();
    const { isAnyProviderSetup, isProviderSetup } = useLanguageModelProviders();
    const { settings } = useSettings();
    const [todoId, setTodoId] = useState<number | null>(null);
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

    // Virtualization only renders visible DOM elements, which creates issues for E2E tests:
    // 1. Off-screen logs don't exist in the DOM and can't be queried by test selectors
    // 2. Tests would need complex scrolling logic to bring elements into view before interaction
    // 3. Race conditions and timing issues occur when waiting for virtualized elements to render after scrolling
    const isTestMode = settings?.isTestMode;
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

    // Memoized item renderer for virtualized list
    const itemContent = useCallback(
      (index: number, message: Message) => {
        const isLastMessage = index === messages.length - 1;
        const messageKey = message.id;

        // Check if we should show auto-router card after this message
        // Show it only after the last user message when:
        // 1. Model is being selected (isSelectingModel = true), OR
        // 2. Model was selected but assistant hasn't responded yet (no assistant message after this user message)
        const isLastUserMessage = message.role === "user" && isLastMessage;
        const hasAssistantResponseAfter =
          isLastMessage &&
          messages.length > index + 1 &&
          messages[index + 1]?.role === "assistant";
        const shouldShowAutoRouter =
          isLastUserMessage &&
          !hasAssistantResponseAfter &&
          (isSelectingModel || autoRouterModelInfo.get(selectedChatId ?? 0));
        const currentAutoRouterInfo = selectedChatId
          ? autoRouterModelInfo.get(selectedChatId)
          : undefined;

        return (
          <div key={messageKey}>
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
      },
      [
        messages.length,
        isSelectingModel,
        autoRouterModelInfo,
        selectedChatId,
        messages,
        user,
      ],
    );

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
      ],
    );

    // Render empty state or setup banner
    if (messages.length === 0) {
      const setupBanner = renderSetupBanner();
      if (setupBanner) {
        return (
          <div
            className="absolute inset-0 overflow-y-auto p-4"
            ref={ref}
            data-testid="messages-list"
          >
            {setupBanner}
          </div>
        );
      }
      return (
        <div
          className="absolute inset-0 overflow-y-auto p-4"
          ref={ref}
          data-testid="messages-list"
        >
          <div className="flex flex-col items-center justify-center h-full max-w-2xl mx-auto">
            <div className="flex flex-1 items-center justify-center text-gray-500">
              Aún no hay mensajes
            </div>
          </div>
        </div>
      );
    }

    // In test mode, render all messages without virtualization
    // so E2E tests can query all messages in the DOM
    if (isTestMode) {
      return (
        <div
          className="absolute inset-0 p-4 overflow-y-auto"
          ref={ref}
          data-testid="messages-list"
        >
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
              <div key={message.id}>
                <div className="px-4">
                  <ChatMessage
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
      );
    }

    return (
      <div
        className="absolute inset-0 overflow-y-auto px-4 pt-4 pb-8"
        ref={ref}
        data-testid="messages-list"
      >
        <Virtuoso
          data={messages}
          increaseViewportBy={{ top: 1000, bottom: 500 }}
          initialTopMostItemIndex={messages.length - 1}
          itemContent={itemContent}
          components={{ Footer: FooterComponent }}
          context={footerContext}
          scrollerRef={onScrollerRef}
          atBottomStateChange={onAtBottomStateChange}
          atBottomThreshold={300}
          followOutput={(isAtBottom) => {
            // During streaming, auto-scroll smoothly but keep up
            if (isStreaming) {
              const distanceFromBottom = distanceFromBottomRef?.current ?? 0;
              // If we are within 1500px, auto-scroll
              if (distanceFromBottom <= 1500) {
                return "smooth";
              }
            }
            return false;
          }}
        />
      </div>
    );
  },
);
