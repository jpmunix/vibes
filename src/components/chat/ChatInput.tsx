import { useNavigate } from "@tanstack/react-router";
import {
  StopCircleIcon,
  X,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  AlertOctagon,
  FileText,
  Check,
  Loader2,
  Package,
  FileX,
  SendToBack,
  Database,
  ChevronsUpDown,
  ChevronsDownUp,
  SendHorizontalIcon,
  Lock,
  Undo,
} from "@/components/ui/icons";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useSettings } from "@/hooks/useSettings";
import { showError, showWarning } from "@/lib/toast";
import { ipc } from "@/ipc/types";
import {
  chatInputValueAtom,
  chatMessagesByIdAtom,
  selectedChatIdAtom,
  pendingAgentConsentsAtom,
  agentTodosByChatIdAtom,
} from "@/atoms/chatAtoms";
import { useAtom, useSetAtom, useAtomValue } from "jotai";
import { useStreamChat } from "@/hooks/useStreamChat";

import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { Button } from "@/components/ui/button";
import { useProposal } from "@/hooks/useProposal";
import { Proposal, SuggestedAction, FileChange, SqlQuery } from "@/lib/schemas";

import { isPreviewOpenAtom } from "@/atoms/viewAtoms";
import { useRunApp } from "@/hooks/useRunApp";
import { AutoApproveSwitch } from "../AutoApproveSwitch";
import { usePostHog } from "posthog-js/react";
import { CodeHighlight } from "./CodeHighlight";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";

import { useVersions } from "@/hooks/useVersions";
import { useAttachments } from "@/hooks/useAttachments";
import { AttachmentsList } from "./AttachmentsList";
import { DragDropOverlay } from "./DragDropOverlay";
import { showExtraFilesToast } from "@/lib/toast";
import { ChatInputControls } from "../ChatInputControls";

import { AgentConsentBanner } from "./AgentConsentBanner";
import { TodoList } from "./TodoList";
import {
  selectedComponentsPreviewAtom,
  previewIframeRefAtom,
  visualEditingSelectedComponentAtom,
  currentComponentCoordinatesAtom,
  pendingVisualChangesAtom,
} from "@/atoms/previewAtoms";
import { SelectedComponentsDisplay } from "./SelectedComponentDisplay";
import { useCheckProblems } from "@/hooks/useCheckProblems";
import { LexicalChatInput } from "./LexicalChatInput";
import { AuxiliaryActionsMenu } from "./AuxiliaryActionsMenu";
import { useChatModeToggle } from "@/hooks/useChatModeToggle";
import { VisualEditingChangesDialog } from "@/components/preview_panel/VisualEditingChangesDialog";
import { useUserBudgetInfo } from "@/hooks/useUserBudgetInfo";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { QuotePreview } from "./QuotePreview";
import { quotedMessagesAtom } from "@/atoms/chatAtoms";

export function ChatInput({
  chatId,
  autoStart,
  isPlanMode,
  workspaceMode,
}: {
  chatId?: number;
  autoStart?: boolean;
  isPlanMode?: boolean;
  workspaceMode?: boolean;
}) {
  const posthog = usePostHog();
  const [inputValue, setInputValue] = useAtom(chatInputValueAtom);
  const [quotedMessages, setQuotedMessages] = useAtom(quotedMessagesAtom);
  const { settings, updateSettings } = useSettings();
  const appId = useAtomValue(selectedAppIdAtom);
  const { versions, revertVersion, refreshVersions } = useVersions(appId);
  const { streamMessage, isStreaming, setIsStreaming, error, setError } =
    useStreamChat();

  const [isApproving, setIsApproving] = useState(false); // State for approving
  const navigate = useNavigate();
  const setChatIdAtom = useSetAtom(selectedChatIdAtom);
  const [isRejecting, setIsRejecting] = useState(false); // State for rejecting
  const hasAutoStartedRef = useRef(false);
  const messagesById = useAtomValue(chatMessagesByIdAtom);
  const setMessagesById = useSetAtom(chatMessagesByIdAtom);
  const [isUndoLoading, setIsUndoLoading] = useState(false);

  const currentMessages = chatId ? (messagesById.get(chatId) ?? []) : [];
  const setIsPreviewOpen = useSetAtom(isPreviewOpenAtom);

  const [selectedComponents, setSelectedComponents] = useAtom(
    selectedComponentsPreviewAtom,
  );
  const previewIframeRef = useAtomValue(previewIframeRefAtom);
  const setVisualEditingSelectedComponent = useSetAtom(
    visualEditingSelectedComponentAtom,
  );
  const setCurrentComponentCoordinates = useSetAtom(
    currentComponentCoordinatesAtom,
  );
  const setPendingVisualChanges = useSetAtom(pendingVisualChangesAtom);
  const [pendingAgentConsents, setPendingAgentConsents] = useAtom(
    pendingAgentConsentsAtom,
  );
  // Get the first consent in the queue for this chat (if any)
  const consentsForThisChat = pendingAgentConsents.filter(
    (c) => c.chatId === chatId,
  );
  const pendingAgentConsent = consentsForThisChat[0] ?? null;



  // Get todos for this chat
  const [agentTodosByChatId, setAgentTodosByChatId] = useAtom(agentTodosByChatIdAtom);
  const chatTodos = chatId ? (agentTodosByChatId.get(chatId) ?? []) : [];
  const { checkProblems } = useCheckProblems(appId);
  const { refreshAppIframe } = useRunApp();
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
    addAttachments,
  } = useAttachments();

  // Listen for restoring chat input (undo functionality)
  useEffect(() => {
    const handleRestoreInput = (
      e: CustomEvent<{ prompt: string; attachments?: File[] }>,
    ) => {
      setInputValue(e.detail.prompt);
      clearAttachments();
      if (e.detail.attachments && e.detail.attachments.length > 0) {
        addAttachments(e.detail.attachments, "chat-context");
      }
    };

    window.addEventListener(
      "vibes:restore-chat-input" as any,
      handleRestoreInput,
    );
    return () => {
      window.removeEventListener(
        "vibes:restore-chat-input" as any,
        handleRestoreInput,
      );
    };
  }, [setInputValue, addAttachments, clearAttachments]);

  // Use the hook to fetch the proposal
  const {
    proposalResult,
    isLoading: isProposalLoading,
    error: proposalError,
    refreshProposal,
  } = useProposal(chatId);
  const { proposal, messageId } = proposalResult ?? {};
  useChatModeToggle();

  const lastMessage = (chatId ? (messagesById.get(chatId) ?? []) : []).at(-1);
  const disableSendButton = false;

  const { userBudget } = useUserBudgetInfo();



  // Reset hasAutoStartedRef when chatId changes
  useEffect(() => {
    hasAutoStartedRef.current = false;
  }, [chatId]);

  // Auto-start the chat when autoStart is true
  useEffect(() => {
    if (autoStart && chatId && !isStreaming && !hasAutoStartedRef.current) {
      const messages = messagesById.get(chatId) ?? [];

      // Only proceed if messages are loaded
      if (messages.length === 0) {
        return;
      }

      // Check if the last message is from user and has no assistant response
      const lastMessage = messages[messages.length - 1];

      if (lastMessage && lastMessage.role === "user") {
        // Only auto-start if there's no assistant response after the user message
        // Use redo: true to avoid creating a duplicate message
        hasAutoStartedRef.current = true;
        streamMessage({
          prompt: lastMessage.content,
          chatId,
          redo: true,
        });
      }
    }
  }, [autoStart, chatId, messagesById, isStreaming, streamMessage]);

  const fetchChatMessages = useCallback(async () => {
    if (!chatId) {
      return;
    }
    const chat = await ipc.chat.getChat(chatId);
    setMessagesById((prev) => {
      const next = new Map(prev);
      next.set(chatId, chat.messages);
      return next;
    });
  }, [chatId, setMessagesById]);

  const handleSubmit = async () => {
    if (
      (!inputValue.trim() && attachments.length === 0) ||
      isStreaming ||
      !chatId
    ) {
      return;
    }

    // Prepend quoted messages as context block if any are set
    let currentInput = inputValue;
    if (quotedMessages.length > 0) {
      const quoteBlock = quotedMessages
        .map((q) => {
          const roleLabel = q.role === "user" ? "Usuario" : "IA";
          // Prefix EVERY line with > to form a proper markdown blockquote
          const quotedLines = q.content
            .split("\n")
            .map((line) => `> ${line}`)
            .join("\n");
          return `> **[${roleLabel}]:**\n${quotedLines}`;
        })
        .join("\n\n");
      currentInput = `${quoteBlock}\n\n${currentInput}`;
      setQuotedMessages([]);
    }

    // Scroll to bottom immediately so the user sees the new message
    window.dispatchEvent(new CustomEvent("vibes:scroll-to-bottom"));

    setInputValue("");

    let currentChatId = chatId;

    // Use all selected components for multi-component editing
    const componentsToSend =
      selectedComponents && selectedComponents.length > 0
        ? selectedComponents
        : [];
    setSelectedComponents([]);
    setVisualEditingSelectedComponent(null);
    // Clear overlays in the preview iframe
    if (previewIframeRef?.contentWindow) {
      previewIframeRef.contentWindow.postMessage(
        { type: "clear-vibes-component-overlays" },
        "*",
      );
    }

    // Send message with attachments and clear them after sending
    await streamMessage({
      prompt: currentInput,
      chatId: currentChatId!,
      attachments,
      redo: false,
      selectedComponents: componentsToSend,
    });
    clearAttachments();
    posthog?.capture("chat:submit", { chatMode: settings?.selectedChatMode });
  };

  const handleCancel = () => {
    if (chatId) {
      ipc.chat.cancelStream(chatId);
    }
    setIsStreaming(false);
  };



  const handleApprove = async () => {
    if (!chatId || !messageId || isApproving || isRejecting || isStreaming)
      return;
    console.log(
      `Approving proposal for chatId: ${chatId}, messageId: ${messageId}`,
    );
    setIsApproving(true);
    posthog?.capture("chat:approve");
    try {
      const result = await ipc.proposal.approveProposal({
        chatId,
        messageId,
      });
      if (result.extraFiles) {
        showExtraFilesToast({
          files: result.extraFiles,
          error: result.extraFilesError,
          posthog,
        });
      }
    } catch (err) {
      console.error("Error approving proposal:", err);
      setError((err as Error)?.message || "An error occurred while approving");
    } finally {
      setIsApproving(false);
      if (settings?.autoExpandPreviewPanel) {
        setIsPreviewOpen(true);
      }
      refreshVersions();
      checkProblems();

      // Keep same as handleReject
      refreshProposal();
      fetchChatMessages();
    }
  };

  const handleReject = async () => {
    if (!chatId || !messageId || isApproving || isRejecting || isStreaming)
      return;
    console.log(
      `Rejecting proposal for chatId: ${chatId}, messageId: ${messageId}`,
    );
    setIsRejecting(true);
    posthog?.capture("chat:reject");
    try {
      await ipc.proposal.rejectProposal({
        chatId,
        messageId,
      });
    } catch (err) {
      console.error("Error rejecting proposal:", err);
      setError((err as Error)?.message || "An error occurred while rejecting");
    } finally {
      setIsRejecting(false);
      // Keep same as handleApprove
      refreshProposal();
      fetchChatMessages();
    }
  };

  if (!settings) {
    return null; // Or loading state
  }

  return (
    <>

      {/* Display loading or error state for proposal */}
      {isProposalLoading &&
        settings.selectedChatMode !== "ask" &&
        settings.selectedChatMode !== "agent" &&
        settings.selectedChatMode !== "mockup" &&
        !isPlanMode && (
          <div className="p-4 text-sm text-muted-foreground">
            Cargando propuesta...
          </div>
        )}
      {proposalError && (
        <div className="p-4 text-sm text-red-600">
          Error al cargar la propuesta: {proposalError.message}
        </div>
      )}
      <div className="px-4 pb-4" data-testid="chat-input-container">
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
              {/* Show todo list if there are todos for this chat */}
              {chatTodos.length > 0 && <TodoList todos={chatTodos} />}
              {/* Show agent consent banner if there's a pending consent request */}
              {pendingAgentConsent && (
                <AgentConsentBanner
                  consent={pendingAgentConsent}
                  queueTotal={consentsForThisChat.length}
                  onDecision={(decision) => {
                    ipc.agent.respondToConsent({
                      requestId: pendingAgentConsent.requestId,
                      decision,
                    });
                    setPendingAgentConsents((prev) =>
                      prev.filter(
                        (c) => c.requestId !== pendingAgentConsent.requestId,
                      ),
                    );
                  }}
                  onClose={() => {
                    ipc.agent.respondToConsent({
                      requestId: pendingAgentConsent.requestId,
                      decision: "decline",
                    });
                    setPendingAgentConsents((prev) =>
                      prev.filter(
                        (c) => c.requestId !== pendingAgentConsent.requestId,
                      ),
                    );
                  }}
                />
              )}
              {/* Only render ChatInputActions if proposal is loaded and no pending consent */}
              {!pendingAgentConsent &&
                proposal &&
                proposalResult?.chatId === chatId &&
                settings.selectedChatMode !== "ask" &&
                !isPlanMode &&
                settings.selectedChatMode !== "agent" &&
                settings.selectedChatMode !== "mockup" && (
                  <ChatInputActions
                    proposal={proposal}
                    onApprove={handleApprove}
                    onReject={handleReject}
                    isApprovable={
                      !isProposalLoading &&
                      !!proposal &&
                      !!messageId &&
                      !isApproving &&
                      !isRejecting &&
                      !isStreaming
                    }
                    isApproving={isApproving}
                    isRejecting={isRejecting}
                  />
                )}

              <VisualEditingChangesDialog
                iframeRef={
                  previewIframeRef
                    ? { current: previewIframeRef }
                    : { current: null }
                }
                onReset={() => {
                  setSelectedComponents([]);
                  setVisualEditingSelectedComponent(null);
                  setCurrentComponentCoordinates(null);
                  setPendingVisualChanges(new Map());
                  refreshAppIframe();
                  if (previewIframeRef?.contentWindow) {
                    previewIframeRef.contentWindow.postMessage(
                      { type: "deactivate-vibes-component-selector" },
                      "*",
                    );
                  }
                }}
              />

              {/* Quote preview card — shown when a message is cited */}
              <QuotePreview />

              {/* Use the AttachmentsList component */}
              <AttachmentsList
                attachments={attachments}
                onRemove={removeAttachment}
              />

              {/* Use the DragDropOverlay component */}
              <DragDropOverlay isDraggingOver={isDraggingOver} />

              <LexicalChatInput
                value={inputValue}
                onChange={setInputValue}
                onSubmit={handleSubmit}
                onPaste={handlePaste}
                placeholder="Pídele a vibes que haga..."
                excludeCurrentApp={true}
                disableSendButton={disableSendButton}
                compact={workspaceMode}
              />

              {/* Bottom controls bar */}
              <div className="px-3 py-5 flex items-center border-t border-border/50">
                <AuxiliaryActionsMenu
                  onFileSelect={handleFileSelect}
                  appId={appId ?? undefined}
                />
                <div className="flex items-center ml-2.5">
                  <ChatInputControls showContextFilesPicker={false} />
                </div>

                <div className="ml-auto flex items-center gap-1.5">
                  {/* Undo button — circular, icon-only */}
                  {!isStreaming &&
                    !!currentMessages.length &&
                    currentMessages[currentMessages.length - 1].role === "assistant" && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              disabled={isUndoLoading}
                              onClick={async () => {
                                if (!chatId || !appId) return;
                                setIsUndoLoading(true);
                                try {
                                  const currentMessage = currentMessages[currentMessages.length - 1];
                                  const userMessage = currentMessages[currentMessages.length - 2];
                                  if (userMessage) {
                                    let prompt = userMessage.content;
                                    const idx = prompt.indexOf("\n\nAttachments:\n");
                                    if (idx !== -1) prompt = prompt.substring(0, idx);
                                    const attachmentsToRestore: File[] = [];
                                    let aiMessagesJson = userMessage.aiMessagesJson;
                                    if (aiMessagesJson) {
                                      let parsed = aiMessagesJson;
                                      if (typeof parsed === "string") {
                                        try {
                                          parsed = JSON.parse(parsed);
                                        } catch {
                                          parsed = null;
                                        }
                                      }
                                      const aiMessages = Array.isArray(parsed) ? parsed : parsed?.messages;
                                      if (aiMessages && Array.isArray(aiMessages)) {
                                        const userMsg = aiMessages.find((m: any) => m.role === "user");
                                        if (userMsg && Array.isArray(userMsg.content)) {
                                          userMsg.content.forEach((part: any, i: number) => {
                                            if (part.type === "image" && part.image) {
                                              const mimeType = part.mediaType || part.mimeType || "image/png";
                                              const ext = mimeType.split("/")[1] || "png";
                                              try {
                                                let base64 = part.image;
                                                if (base64.startsWith("data:")) {
                                                  base64 = base64.split(",")[1] || "";
                                                }
                                                const byteChars = atob(base64);
                                                const byteArr = new Uint8Array(byteChars.length);
                                                for (let j = 0; j < byteChars.length; j++) byteArr[j] = byteChars.charCodeAt(j);
                                                attachmentsToRestore.push(new File([new Blob([byteArr], { type: mimeType })], `restored-${Date.now()}-${i}.${ext}`, { type: mimeType }));
                                              } catch { /* skip */ }
                                            }
                                          });
                                        }
                                      }
                                    }
                                    window.dispatchEvent(new CustomEvent("vibes:restore-chat-input", { detail: { prompt, attachments: attachmentsToRestore } }));
                                  }
                                  const targetHash = currentMessage?.sourceCommitHash || "NONE";
                                  if (targetHash !== "NONE") {
                                    // Normal undo: revert to the commit before this chat turn
                                    await revertVersion({
                                      versionId: targetHash,
                                      currentChatMessageId: userMessage ? { chatId, messageId: userMessage.id } : undefined,
                                      silent: true,
                                    });
                                  } else {
                                    // Stream was stopped before any commit — discard uncommitted changes
                                    try {
                                      await ipc.git.discardAllChanges({ appId });
                                    } catch { /* no uncommitted changes to discard */ }
                                    // Still delete the messages from this turn
                                    if (userMessage) {
                                      await revertVersion({
                                        versionId: "NONE",
                                        currentChatMessageId: { chatId, messageId: userMessage.id },
                                        silent: true,
                                      });
                                    }
                                  }
                                  // Clear agent todos for this chat
                                  setAgentTodosByChatId((prev) => {
                                    const next = new Map(prev);
                                    next.delete(chatId);
                                    return next;
                                  });
                                  const chat = await ipc.chat.getChat(chatId);
                                  setMessagesById((prev) => { const next = new Map(prev); next.set(chatId, chat.messages); return next; });
                                } catch (error) {
                                  console.error("Error during undo:", error);
                                  showError("Failed to undo changes");
                                } finally {
                                  setIsUndoLoading(false);
                                }
                              }}
                              className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-30 cursor-pointer"
                              title="Deshacer"
                            >
                              {isUndoLoading ? <Loader2 size={16} className="animate-spin" /> : <Undo size={16} />}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Deshacer</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}



                  {isStreaming ? (
                    <button
                      onClick={handleCancel}
                      className="p-2.5 bg-destructive hover:bg-destructive/90 text-white rounded-full transition-colors cursor-pointer"
                      title="Cancelar generación"
                    >
                      <StopCircleIcon size={18} />
                    </button>
                  ) : (
                    <button
                      onClick={handleSubmit}
                      disabled={
                        (!inputValue.trim() && attachments.length === 0) ||
                        disableSendButton
                      }
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

function SuggestionButton({
  children,
  onClick,
  tooltipText,
}: {
  onClick: (e: React.MouseEvent) => void;
  children: React.ReactNode;
  tooltipText: string;
}) {
  const { isStreaming } = useStreamChat();
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            disabled={isStreaming}
            variant="outline"
            size="sm"
            onClick={onClick}
          >
            {children}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{tooltipText}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}


function RefactorFileButton({ path }: { path: string }) {
  const chatId = useAtomValue(selectedChatIdAtom);
  const { streamMessage } = useStreamChat();
  const onClick = () => {
    if (!chatId) {
      console.error("No chat id found");
      return;
    }
    streamMessage({
      prompt: `Refactoriza ${path} y hazlo más modular`,
      chatId,
      redo: false,
    });
  };
  return (
    <SuggestionButton
      onClick={onClick}
      tooltipText="Refactoriza el archivo para mejorar su mantenimiento"
    >
      <span className="max-w-[180px] overflow-hidden whitespace-nowrap text-ellipsis">
        Refactorizar {path.split("/").slice(-2).join("/")}
      </span>
    </SuggestionButton>
  );
}

function WriteCodeProperlyButton() {
  const chatId = useAtomValue(selectedChatIdAtom);
  const { streamMessage } = useStreamChat();
  const onClick = () => {
    if (!chatId) {
      console.error("No chat id found");
      return;
    }
    streamMessage({
      prompt: `¡Escribe el código del mensaje anterior en el formato correcto usando etiquetas \`<vibes-write>\`!`,
      chatId,
      redo: false,
    });
  };
  return (
    <SuggestionButton
      onClick={onClick}
      tooltipText="Escribe el código correctamente (útil cuando la IA genera el código en el formato incorrecto)"
    >
      Escribir código correctamente
    </SuggestionButton>
  );
}

function KeepGoingButton() {
  const { streamMessage } = useStreamChat();
  const chatId = useAtomValue(selectedChatIdAtom);
  const onClick = () => {
    if (!chatId) {
      console.error("No chat id found");
      return;
    }
    streamMessage({
      prompt: "Keep going",
      chatId,
    });
  };
  return (
    <SuggestionButton onClick={onClick} tooltipText="Continuar">
      Continuar
    </SuggestionButton>
  );
}

export function mapActionToButton(action: SuggestedAction) {
  switch (action.id) {
    case "summarize-in-new-chat":
      return null;
    case "refactor-file":
      return <RefactorFileButton path={action.path} />;
    case "write-code-properly":
      return <WriteCodeProperlyButton />;
    case "keep-going":
      return <KeepGoingButton />;
    default:
      console.error(`Unsupported action: ${action.id}`);
      return (
        <Button variant="outline" size="sm" disabled key={action.id}>
          No soportado: {action.id}
        </Button>
      );
  }
}

// Deshabilitado: Botones de sugerencias (Resumir en un nuevo chat, Continuar)
// function ActionProposalActions({proposal}: {proposal: ActionProposal }) {
//   return (
//     <div className="border-b border-border p-2 pb-0 flex items-center justify-between">
//       <div className="flex items-center space-x-2 overflow-x-auto pb-2">
//         {proposal.actions.map((action) => mapActionToButton(action))}
//       </div>
//     </div>
//   );
// }

interface ChatInputActionsProps {
  proposal: Proposal;
  onApprove: () => void;
  onReject: () => void;
  isApprovable: boolean; // Can be used to enable/disable buttons
  isApproving: boolean; // State for approving
  isRejecting: boolean; // State for rejecting
}

// Update ChatInputActions to accept props
function ChatInputActions({
  proposal,
  onApprove,
  onReject,
  isApprovable,
  isApproving,
  isRejecting,
}: ChatInputActionsProps) {
  const [isDetailsVisible, setIsDetailsVisible] = useState(false);

  if (proposal.type === "tip-proposal") {
    return <div>Propuesta de consejo</div>;
  }
  if (proposal.type === "action-proposal") {
    // Botones de sugerencias (Resumir en un nuevo chat, Continuar) deshabilitados
    return null;
  }

  // Split files into server functions and other files - only for CodeProposal
  const serverFunctions =
    proposal.filesChanged?.filter((f: FileChange) => f.isServerFunction) ?? [];
  const otherFilesChanged =
    proposal.filesChanged?.filter((f: FileChange) => !f.isServerFunction) ?? [];

  function formatTitle({
    title,
    isDetailsVisible,
  }: {
    title: string;
    isDetailsVisible: boolean;
  }) {
    if (isDetailsVisible) {
      return title;
    }
    return title.slice(0, 60) + "...";
  }

  return (
    <div className="border-b border-border">
      <div className="p-2">
        {/* Row 1: Title, Expand Icon, and Security Chip */}
        <div className="flex items-center gap-2 mb-1">
          <button
            className="flex flex-col text-left text-sm hover:bg-muted p-1 rounded justify-start w-full"
            onClick={() => setIsDetailsVisible(!isDetailsVisible)}
          >
            <div className="flex items-center">
              {isDetailsVisible ? (
                <ChevronUp size={16} className="mr-1 flex-shrink-0" />
              ) : (
                <ChevronDown size={16} className="mr-1 flex-shrink-0" />
              )}
              <span className="font-medium">
                {formatTitle({ title: proposal.title, isDetailsVisible })}
              </span>
            </div>
            <div className="text-xs text-muted-foreground ml-6">
              <ProposalSummary
                sqlQueries={proposal.sqlQueries}
                serverFunctions={serverFunctions}
                packagesAdded={proposal.packagesAdded}
                filesChanged={otherFilesChanged}
              />
            </div>
          </button>
        </div>

        {/* Row 2: Buttons and Toggle */}
        <div className="flex items-center justify-start space-x-2">
          <Button
            className="px-8"
            size="sm"
            variant="outline"
            onClick={onApprove}
            disabled={!isApprovable || isApproving || isRejecting}
            data-testid="approve-proposal-button"
          >
            {isApproving ? (
              <Loader2 size={16} className="mr-1 animate-spin" />
            ) : (
              <Check size={16} className="mr-1" />
            )}
            Aprobar
          </Button>
          <Button
            className="px-8"
            size="sm"
            variant="outline"
            onClick={onReject}
            disabled={!isApprovable || isApproving || isRejecting}
            data-testid="reject-proposal-button"
          >
            {isRejecting ? (
              <Loader2 size={16} className="mr-1 animate-spin" />
            ) : (
              <X size={16} className="mr-1" />
            )}
            Rechazar
          </Button>
          <div className="flex items-center space-x-1 ml-auto">
            <AutoApproveSwitch />
          </div>
        </div>
      </div>

      <div className="overflow-y-auto max-h-[calc(100vh-300px)]">
        {isDetailsVisible && (
          <div className="p-3 border-t border-border bg-muted/50 text-sm">

            {proposal.sqlQueries?.length > 0 && (
              <div className="mb-3">
                <h4 className="font-semibold mb-1">Consultas SQL</h4>
                <ul className="space-y-2">
                  {proposal.sqlQueries.map((query, index) => (
                    <SqlQueryItem key={index} query={query} />
                  ))}
                </ul>
              </div>
            )}

            {proposal.packagesAdded?.length > 0 && (
              <div className="mb-3">
                <h4 className="font-semibold mb-1">Paquetes añadidos</h4>
                <ul className="space-y-1">
                  {proposal.packagesAdded.map((pkg, index) => (
                    <li
                      key={index}
                      className="flex items-center space-x-2"
                      onClick={() => {
                        ipc.system.openExternalUrl(
                          `https://www.npmjs.com/package/${pkg}`,
                        );
                      }}
                    >
                      <Package
                        size={16}
                        className="text-muted-foreground flex-shrink-0"
                      />
                      <span className="cursor-pointer text-primary hover:text-primary/80">
                        {pkg}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {serverFunctions.length > 0 && (
              <div className="mb-3">
                <h4 className="font-semibold mb-1">
                  Funciones de servidor cambiadas
                </h4>
                <ul className="space-y-1">
                  {serverFunctions.map((file: FileChange, index: number) => (
                    <li key={index} className="flex items-center space-x-2">
                      {getIconForFileChange(file)}
                      <span
                        title={file.path}
                        className="truncate cursor-default"
                      >
                        {file.name}
                      </span>
                      <span className="text-muted-foreground text-xs truncate">
                        - {file.summary}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {otherFilesChanged.length > 0 && (
              <div>
                <h4 className="font-semibold mb-1">Archivos cambiados</h4>
                <ul className="space-y-1">
                  {otherFilesChanged.map((file: FileChange, index: number) => (
                    <li key={index} className="flex items-center space-x-2">
                      {getIconForFileChange(file)}
                      <span
                        title={file.path}
                        className="truncate cursor-default"
                      >
                        {file.name}
                      </span>
                      <span className="text-muted-foreground text-xs truncate">
                        - {file.summary}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function getIconForFileChange(file: FileChange) {
  switch (file.type) {
    case "write":
      return (
        <FileText size={16} className="text-muted-foreground flex-shrink-0" />
      );
    case "rename":
      return (
        <SendToBack size={16} className="text-muted-foreground flex-shrink-0" />
      );
    case "delete":
      return (
        <FileX size={16} className="text-muted-foreground flex-shrink-0" />
      );
  }
}

// Proposal summary component to show counts of changes
function ProposalSummary({
  sqlQueries = [],
  serverFunctions = [],
  packagesAdded = [],
  filesChanged = [],
}: {
  sqlQueries?: Array<SqlQuery>;
  serverFunctions?: FileChange[];
  packagesAdded?: string[];
  filesChanged?: FileChange[];
}) {
  // If no changes, show a simple message
  if (
    !sqlQueries.length &&
    !serverFunctions.length &&
    !packagesAdded.length &&
    !filesChanged.length
  ) {
    return <span>Sin cambios</span>;
  }

  // Build parts array with only the segments that have content
  const parts: string[] = [];

  if (sqlQueries.length) {
    parts.push(
      `${sqlQueries.length} SQL ${sqlQueries.length === 1 ? "consulta" : "consultas"}`,
    );
  }

  if (serverFunctions.length) {
    parts.push(
      `${serverFunctions.length} de servidor ${serverFunctions.length === 1 ? "Función" : "Funciones"}`,
    );
  }

  if (packagesAdded.length) {
    parts.push(
      `${packagesAdded.length} ${packagesAdded.length === 1 ? "paquete" : "paquetes"}`,
    );
  }

  if (filesChanged.length) {
    parts.push(
      `${filesChanged.length} ${filesChanged.length === 1 ? "archivo" : "archivos"}`,
    );
  }

  // Join all parts with separator
  return <span>{parts.join(" | ")}</span>;
}

// SQL Query item with expandable functionality
function SqlQueryItem({ query }: { query: SqlQuery }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const queryContent = query.content;
  const queryDescription = query.description;

  return (
    <li
      className="bg-(--background-lightest) hover:bg-(--background-lighter) rounded-lg px-3 py-2 border border-border cursor-pointer"
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database size={16} className="text-muted-foreground flex-shrink-0" />
          <span className="text-sm font-medium">
            {queryDescription || "Consulta SQL"}
          </span>
        </div>
        <div>
          {isExpanded ? (
            <ChevronsDownUp size={18} className="text-muted-foreground" />
          ) : (
            <ChevronsUpDown size={18} className="text-muted-foreground" />
          )}
        </div>
      </div>
      {isExpanded && (
        <div className="mt-2 text-xs max-h-[200px] overflow-auto">
          <CodeHighlight className="language-sql ">
            {queryContent}
          </CodeHighlight>
        </div>
      )}
    </li>
  );
}
