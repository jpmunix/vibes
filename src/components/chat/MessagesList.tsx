import React from "react";
import type { Message } from "@/ipc/types";
import { forwardRef, useState, useCallback, useMemo } from "react";
import { Virtuoso } from "react-virtuoso";
import ChatMessage from "./ChatMessage";
import { OpenRouterSetupBanner, SetupBanner } from "../SetupBanner";

import { useStreamChat } from "@/hooks/useStreamChat";
import {
  selectedChatIdAtom,
  autoRouterModelInfoByChatIdAtom,
  isSelectingModelByIdAtom,
} from "@/atoms/chatAtoms";
import { useAtomValue, useSetAtom } from "jotai";
import { CheckCircle2, Loader2, RefreshCw, Undo, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVersions } from "@/hooks/useVersions";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { showError, showSuccess, showWarning } from "@/lib/toast";
import { ipc } from "@/ipc/types";
import { chatMessagesByIdAtom } from "@/atoms/chatAtoms";
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
}

// Memoize ChatMessage at module level to prevent recreation on every render
const MemoizedChatMessage = React.memo(ChatMessage);

// Context type for Virtuoso
interface FooterContext {
  messages: Message[];
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  isStreaming: boolean;
  tokenCountResult: ReturnType<typeof useCountTokens>["result"];
  isUndoLoading: boolean;
  isRetryLoading: boolean;
  setIsUndoLoading: (loading: boolean) => void;
  setIsRetryLoading: (loading: boolean) => void;
  versions: ReturnType<typeof useVersions>["versions"];
  revertVersion: ReturnType<typeof useVersions>["revertVersion"];
  streamMessage: ReturnType<typeof useStreamChat>["streamMessage"];
  selectedChatId: number | null;
  appId: number | null;
  setMessagesById: ReturnType<typeof useSetAtom<typeof chatMessagesByIdAtom>>;
  settings: ReturnType<typeof useSettings>["settings"];
  userBudget: ReturnType<typeof useUserBudgetInfo>["userBudget"];
  renderSetupBanner: () => React.ReactNode;
  isSelectingModel: boolean;
  autoRouterModelInfo: ReturnType<
    typeof useAtomValue<typeof autoRouterModelInfoByChatIdAtom>
  >;
  todoId: number | null;
}

// Footer component for Virtuoso - receives context via props
function FooterComponent({ context }: { context?: FooterContext }) {
  if (!context) return null;

  const {
    messages,
    messagesEndRef,
    isStreaming,
    tokenCountResult,
    isUndoLoading,
    isRetryLoading,
    setIsUndoLoading,
    setIsRetryLoading,
    versions,
    revertVersion,
    streamMessage,
    selectedChatId,
    appId,
    setMessagesById,
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
        <div className="flex max-w-3xl mx-auto gap-2 mt-12 mb-8">
          {!!messages.length && (
            <Button
              variant="outline"
              size="sm"
              className="hover:bg-blue-50 dark:hover:bg-blue-900/20"
              onClick={async () => {
                if (!appId) {
                  showError("No se pudo identificar la aplicación para reiniciar");
                  return;
                }
                try {
                  await ipc.app.restartApp({ appId });
                  showSuccess("Aplicación reiniciada");
                } catch (error) {
                  console.error("Error al reiniciar la aplicación:", error);
                  showError("Error al reiniciar la aplicación");
                }
              }}
            >
              <RotateCcw size={16} className="mr-1" />
              Reiniciar
            </Button>
          )}
          {!!messages.length &&
            messages[messages.length - 1].role === "assistant" && (
              <Button
                variant="outline"
                size="sm"
                disabled={isUndoLoading}
                onClick={async () => {
                  if (!selectedChatId || !appId) {
                    console.error("No chat selected or app ID not available");
                    return;
                  }

                  setIsUndoLoading(true);
                  try {
                    const currentMessage = messages[messages.length - 1];
                    // The user message that triggered this assistant response
                    const userMessage = messages[messages.length - 2];
                    if (currentMessage?.sourceCommitHash) {
                      console.debug(
                        "Reverting to source commit hash",
                        currentMessage.sourceCommitHash,
                      );
                      await revertVersion({
                        versionId: currentMessage.sourceCommitHash,
                        currentChatMessageId: userMessage
                          ? {
                            chatId: selectedChatId,
                            messageId: userMessage.id,
                          }
                          : undefined,
                      });
                      const chat = await ipc.chat.getChat(selectedChatId);
                      setMessagesById((prev) => {
                        const next = new Map(prev);
                        next.set(selectedChatId, chat.messages);
                        return next;
                      });
                    } else {
                      showWarning(
                        "No source commit hash found for message. Need to manually undo code changes",
                      );
                    }
                  } catch (error) {
                    console.error("Error during undo operation:", error);
                    showError("Failed to undo changes");
                  } finally {
                    setIsUndoLoading(false);
                  }
                }}
              >
                {isUndoLoading ? (
                  <Loader2 size={16} className="mr-1 animate-spin" />
                ) : (
                  <Undo size={16} />
                )}
                Deshacer
              </Button>
            )}
          {!!messages.length && (
            <Button
              variant="outline"
              size="sm"
              disabled={isRetryLoading}
              onClick={async () => {
                if (!selectedChatId) {
                  console.error("No chat selected");
                  return;
                }

                setIsRetryLoading(true);
                try {
                  // The last message is usually an assistant, but it might not be.
                  const lastVersion = versions[0];
                  const lastMessage = messages[messages.length - 1];
                  let shouldRedo = true;
                  if (
                    lastVersion.oid === lastMessage.commitHash &&
                    lastMessage.role === "assistant"
                  ) {
                    const previousAssistantMessage =
                      messages[messages.length - 3];
                    if (
                      previousAssistantMessage?.role === "assistant" &&
                      previousAssistantMessage?.commitHash
                    ) {
                      console.debug("Reverting to previous assistant version");
                      await revertVersion({
                        versionId: previousAssistantMessage.commitHash,
                      });
                      shouldRedo = false;
                    } else {
                      const chat = await ipc.chat.getChat(selectedChatId);
                      if (chat.initialCommitHash) {
                        console.debug(
                          "Reverting to initial commit hash",
                          chat.initialCommitHash,
                        );
                        await revertVersion({
                          versionId: chat.initialCommitHash,
                        });
                      } else {
                        showWarning(
                          "No initial commit hash found for chat. Need to manually undo code changes",
                        );
                      }
                    }
                  }

                  // Find the last user message
                  const lastUserMessage = [...messages]
                    .reverse()
                    .find((message) => message.role === "user");
                  if (!lastUserMessage) {
                    console.error("No user message found");
                    return;
                  }
                  // Need to do a redo, if we didn't delete the message from a revert.
                  const redo = shouldRedo;
                  console.debug("Streaming message with redo", redo);

                  streamMessage({
                    prompt: lastUserMessage.content,
                    chatId: selectedChatId,
                    redo,
                  });
                } catch (error) {
                  console.error("Error during retry operation:", error);
                  showError("Failed to retry message");
                } finally {
                  setIsRetryLoading(false);
                }
              }}
            >
              {isRetryLoading ? (
                <Loader2 size={16} className="mr-1 animate-spin" />
              ) : (
                <RefreshCw size={16} />
              )}
              Reintentar
            </Button>
          )}

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

      {isStreaming &&
        !settings?.enableDyadPro &&
        !userBudget &&
        messages.length > 0 && (
          <PromoMessage
            seed={messages.length * (appId ?? 1) * (selectedChatId ?? 1)}
          />
        )}
      <div ref={messagesEndRef} />
      {renderSetupBanner()}
    </>
  );
}

export const MessagesList = forwardRef<HTMLDivElement, MessagesListProps>(
  function MessagesList(
    {
      messages,
      messagesEndRef,
      onScrollerRef,
      distanceFromBottomRef,
      isUserScrolling,
    },
    ref,
  ) {
    const appId = useAtomValue(selectedAppIdAtom);
    const { versions, revertVersion } = useVersions(appId);
    const { streamMessage, isStreaming } = useStreamChat();
    const { isAnyProviderSetup, isProviderSetup } = useLanguageModelProviders();
    const { settings } = useSettings();
    const setMessagesById = useSetAtom(chatMessagesByIdAtom);
    const [isUndoLoading, setIsUndoLoading] = useState(false);
    const [isRetryLoading, setIsRetryLoading] = useState(false);
    const [todoId, setTodoId] = useState<number | null>(null);
    const selectedChatId = useAtomValue(selectedChatIdAtom);
    const { userBudget } = useUserBudgetInfo();
    const autoRouterModelInfo = useAtomValue(autoRouterModelInfoByChatIdAtom);
    const isSelectingModelById = useAtomValue(isSelectingModelByIdAtom);
    const isSelectingModel = selectedChatId
      ? (isSelectingModelById.get(selectedChatId) ?? false)
      : false;

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

    // Wrap state setters in useCallback to stabilize references
    const handleSetIsUndoLoading = useCallback((loading: boolean) => {
      setIsUndoLoading(loading);
    }, []);

    const handleSetIsRetryLoading = useCallback((loading: boolean) => {
      setIsRetryLoading(loading);
    }, []);

    // Stabilize renderSetupBanner with proper dependencies
    const renderSetupBanner = useCallback(() => {
      const selectedModel = settings?.selectedModel;
      if (
        selectedModel?.name === "free" &&
        selectedModel?.provider === "auto" &&
        !isProviderSetup("openrouter")
      ) {
        return <OpenRouterSetupBanner className="w-full" />;
      }
      if (!isAnyProviderSetup()) {
        return <SetupBanner />;
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
      ],
    );

    // Create context object for Footer component with stable references
    const footerContext = useMemo<FooterContext>(
      () => ({
        messages,
        messagesEndRef,
        isStreaming,
        tokenCountResult,
        isUndoLoading,
        isRetryLoading,
        setIsUndoLoading: handleSetIsUndoLoading,
        setIsRetryLoading: handleSetIsRetryLoading,
        versions,
        revertVersion,
        streamMessage,
        selectedChatId,
        appId,
        setMessagesById,
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
        isUndoLoading,
        isRetryLoading,
        handleSetIsUndoLoading,
        handleSetIsRetryLoading,
        versions,
        revertVersion,
        streamMessage,
        selectedChatId,
        appId,
        setMessagesById,
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
        className="absolute inset-0 overflow-y-auto px-4 pt-4 pb-20"
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
          followOutput={() => {
            const shouldAutoScroll =
              !isUserScrolling &&
              isStreaming &&
              distanceFromBottomRef &&
              distanceFromBottomRef.current <= 280;
            return shouldAutoScroll ? "smooth" : false;
          }}
        />
      </div>
    );
  },
);
