import type { Message } from "@/ipc/types";
import {
  DyadMarkdownParser,
} from "./DyadMarkdownParser";
import { UserMessageContent } from "./UserMessageContent";
import { useStreamChat } from "@/hooks/useStreamChat";
import { StreamingLoadingAnimation } from "./StreamingLoadingAnimation";
import {
  CheckCircle,
  XCircle,
  Clock,
  GitCommit,
  Copy,
  Check,
  Info,
  Bot,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { useVersions } from "@/hooks/useVersions";
import { useAtomValue } from "jotai";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { userAtom } from "@/atoms/authAtoms";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import {
  selectedChatIdAtom,
  autoRouterModelInfoByChatIdAtom,
  isSelectingModelByIdAtom,
  collapseAllMessagesAtom,
} from "@/atoms/chatAtoms";
import { AutoRouterModelBadge } from "./AutoRouterModelBadge";
import { SimpleAvatar } from "@/components/ui/SimpleAvatar";

interface ChatMessageProps {
  message: Message;
  isLastMessage: boolean;
}
// Hoisted to module level — pure function, no component state needed
const formatTimestamp = (timestamp: string | Date) => {
  const now = new Date();
  const messageTime = new Date(timestamp);
  const diffInHours =
    (now.getTime() - messageTime.getTime()) / (1000 * 60 * 60);
  if (diffInHours < 24) {
    return formatDistanceToNow(messageTime, { addSuffix: true });
  } else {
    return format(messageTime, "MMM d, yyyy 'at' h:mm a");
  }
};

const ChatMessage = ({ message, isLastMessage }: ChatMessageProps) => {
  const { isStreaming } = useStreamChat();
  const collapseAll = useAtomValue(collapseAllMessagesAtom);
  const [isCollapsedLocal, setIsCollapsedLocal] = useState(false);
  // Sync with global toggle
  useEffect(() => {
    setIsCollapsedLocal(collapseAll);
  }, [collapseAll]);
  const isCollapsed = isCollapsedLocal;
  const setIsCollapsed = setIsCollapsedLocal;
  const appId = useAtomValue(selectedAppIdAtom);
  const { versions: liveVersions } = useVersions(appId);
  const selectedChatId = useAtomValue(selectedChatIdAtom);
  const autoRouterModelInfo = useAtomValue(autoRouterModelInfoByChatIdAtom);
  const isSelectingModelById = useAtomValue(isSelectingModelByIdAtom);
  const isSelectingModel = selectedChatId
    ? (isSelectingModelById.get(selectedChatId) ?? false)
    : false;
  const user = useAtomValue(userAtom);

  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  //handle copy chat
  const { copyMessageContent, copied } = useCopyToClipboard();
  const handleCopyFormatted = useCallback(async () => {
    await copyMessageContent(message.content);
  }, [copyMessageContent, message.content]);
  const loadingPhrases = useMemo(
    () => [
      "Analizando contexto",
      "Consultando archivos",
      "Solicitando a la IA",
      "Preparando respuesta",
    ],
    [],
  );
  const [loadingPhraseIndex, setLoadingPhraseIndex] = useState(0);
  useEffect(() => {
    if (
      message.role === "assistant" &&
      !message.content &&
      isStreaming &&
      isLastMessage &&
      !isSelectingModel
    ) {
      const interval = setInterval(() => {
        setLoadingPhraseIndex((prev) => (prev + 1) % loadingPhrases.length);
      }, 1800);
      return () => clearInterval(interval);
    }
  }, [
    isLastMessage,
    isStreaming,
    isSelectingModel,
    loadingPhrases.length,
    message.content,
    message.role,
  ]);
  // Find the version that was active when this message was sent
  const messageVersion = useMemo(() => {
    if (
      message.role === "assistant" &&
      message.commitHash &&
      liveVersions.length
    ) {
      return (
        liveVersions.find(
          (version: any) =>
            message.commitHash &&
            version.oid.slice(0, 7) === message.commitHash.slice(0, 7),
        ) || null
      );
    }
    return null;
  }, [message.commitHash, message.role, liveVersions]);

  // handle copy request id
  const [copiedRequestId, setCopiedRequestId] = useState(false);
  const copiedRequestIdTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    return () => {
      if (copiedRequestIdTimeoutRef.current) {
        clearTimeout(copiedRequestIdTimeoutRef.current);
      }
    };
  }, []);



  return (
    <div className="flex justify-center">
      <div className="mt-4 mb-4 w-full max-w-4xl mx-auto group">
        <div className={`flex items-start gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
          {/* Avatar */}
          <div className="flex-shrink-0 mt-1">
            {isUser ? (
              <SimpleAvatar
                src={user?.photoURL || undefined}
                className="h-7 w-7"
                fallbackText={
                  user
                    ? (user.displayName?.[0] || user.email?.[0] || "U").toUpperCase()
                    : "Yo"
                }
              />
            ) : (
              <img
                src="../../assets/icon/logo.png"
                alt="AI"
                className="h-7 w-7 rounded-full object-cover"
              />
            )}
          </div>

          {/* Message bubble */}
          <div className={isAssistant ? "flex-1 min-w-0" : "flex-shrink min-w-0"}>
            <div
              className={`rounded-2xl ${isAssistant
                ? "px-4 py-3 bg-secondary/50 dark:bg-secondary/30 border border-secondary/40"
                : "px-4 py-3 bg-primary/10 dark:bg-primary/15 border border-primary/20 w-fit"
                }`}
            >
              {isAssistant &&
                !message.content &&
                isStreaming &&
                isLastMessage &&
                !isSelectingModel ? (
                <StreamingLoadingAnimation
                  variant="initial"
                  label={loadingPhrases[loadingPhraseIndex]}
                />
              ) : !isSelectingModel ? (
                <div
                  className={`prose dark:prose-invert prose-headings:mb-2 prose-p:my-1 prose-pre:my-0 max-w-none break-words ${isCollapsed ? "hidden" : ""}`}
                  suppressHydrationWarning
                >
                  {isAssistant ? (
                    <>
                      <DyadMarkdownParser content={message.content} />
                      {isLastMessage && isStreaming && !isSelectingModel && (
                        <StreamingLoadingAnimation
                          variant="streaming"
                          label={loadingPhrases[loadingPhraseIndex]}
                        />
                      )}
                    </>
                  ) : (
                    <UserMessageContent
                      content={message.content}
                      aiMessagesJson={message.aiMessagesJson}
                    />
                  )}
                </div>
              ) : null}
              {(isAssistant && message.content && !isStreaming) ||
                message.approvalState ? (
                <div
                  className={`mt-2 flex items-center ${isAssistant && message.content && !isStreaming
                    ? "justify-between"
                    : ""
                    } text-xs`}
                >
                  {isAssistant &&
                    message.content &&
                    !isStreaming &&
                    !isCollapsed && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              data-testid="copy-message-button"
                              onClick={handleCopyFormatted}
                              className="flex items-center space-x-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded cursor-pointer"
                            >
                              {copied ? (
                                <Check className="h-4 w-4 text-green-500" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                              <span className="hidden sm:inline"></span>
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {copied ? "¡Copiado!" : "Copiar"}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  <div className="flex flex-wrap gap-2">
                    {isAssistant && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => setIsCollapsed(!isCollapsed)}
                              className="flex items-center justify-center p-1 text-muted-foreground hover:text-foreground hover:bg-accent rounded cursor-pointer"
                            >
                              {isCollapsed ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronUp className="h-4 w-4" />
                              )}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {isCollapsed ? "Expandir respuesta" : "Colapsar respuesta"}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    {message.approvalState && (
                      <div className="flex items-center space-x-1">
                        {message.approvalState === "approved" ? (
                          <>
                            <CheckCircle className="h-4 w-4 text-green-500" />
                            <span>Aprobado</span>
                          </>
                        ) : message.approvalState === "rejected" ? (
                          <>
                            <XCircle className="h-4 w-4 text-red-500" />
                            <span>Rechazado</span>
                          </>
                        ) : null}
                      </div>
                    )}
                    {isAssistant && message.model && (
                      <>
                        {selectedChatId &&
                          autoRouterModelInfo.get(selectedChatId) ? (
                          <AutoRouterModelBadge
                            modelInfo={autoRouterModelInfo.get(selectedChatId)!}
                            showInline={false}
                          />
                        ) : (
                          <div className="flex items-center gap-1 text-muted-foreground w-full sm:w-auto">
                            <Bot className="h-4 w-4 flex-shrink-0" />
                            <span>{message.model}</span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        {/* Timestamp and commit info for assistant messages - only visible on hover */}
        {isAssistant && message.createdAt && (
          <div className="mt-3 flex flex-wrap items-center justify-start space-x-2 text-xs text-muted-foreground ">
            <div className="flex items-center space-x-1 ml-10">
              <Clock className="h-3 w-3" />
              <span>{formatTimestamp(message.createdAt)}</span>
            </div>
            {messageVersion && messageVersion.message && (
              <div className="flex items-center space-x-1">
                <GitCommit className="h-3 w-3" />
                {messageVersion && messageVersion.message && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="max-w-50 truncate font-medium">
                        {
                          messageVersion.message
                            .replace(/^\[(dyad|vibes)\]\s*/i, "")
                            .split("\n")[0]
                        }
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{messageVersion.message}</TooltipContent>
                  </Tooltip>
                )}
              </div>
            )}
            {message.requestId && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => {
                        if (!message.requestId) return;
                        navigator.clipboard
                          .writeText(message.requestId)
                          .then(() => {
                            setCopiedRequestId(true);
                            if (copiedRequestIdTimeoutRef.current) {
                              clearTimeout(copiedRequestIdTimeoutRef.current);
                            }
                            copiedRequestIdTimeoutRef.current = setTimeout(
                              () => setCopiedRequestId(false),
                              2000,
                            );
                          })
                          .catch(() => {
                            // noop
                          });
                      }}
                      className="flex items-center space-x-1 px-1 py-0.5 hover:bg-accent rounded cursor-pointer"
                    >
                      {copiedRequestId ? (
                        <Check className="h-3 w-3 text-green-500" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                      <span className="text-xs">
                        {copiedRequestId ? "Copiado" : "ID de solicitud"}
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {copiedRequestId
                      ? "¡Copiado!"
                      : `Copiar ID de solicitud: ${message.requestId.slice(0, 8)}...`}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {isLastMessage && message.totalTokens && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center space-x-1 px-1 py-0.5">
                      <Info className="h-3 w-3" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    Máximo de tokens usados:{" "}
                    {message.totalTokens.toLocaleString()}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatMessage;
