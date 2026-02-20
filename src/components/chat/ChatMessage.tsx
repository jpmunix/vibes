import type { Message } from "@/ipc/types";
import {
  DyadMarkdownParser,
} from "./DyadMarkdownParser";
import { UserMessageContent } from "./UserMessageContent";
import { useStreamChat } from "@/hooks/useStreamChat";
import { StreamingLoadingAnimation } from "./StreamingLoadingAnimation";
import { TOOL_META, getToolDetail } from "./CompactToolBadge";
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
  User as UserIcon,
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
} from "@/atoms/chatAtoms";
import { AutoRouterModelBadge } from "./AutoRouterModelBadge";
import { SimpleAvatar } from "@/components/ui/SimpleAvatar";
import { auth } from "@/lib/firebase";

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

const ChatMessage = ({ message, isLastMessage, user }: ChatMessageProps) => {
  const { isStreaming } = useStreamChat();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const appId = useAtomValue(selectedAppIdAtom);
  const { versions: liveVersions } = useVersions(appId);
  const selectedChatId = useAtomValue(selectedChatIdAtom);
  const autoRouterModelInfo = useAtomValue(autoRouterModelInfoByChatIdAtom);
  const isSelectingModelById = useAtomValue(isSelectingModelByIdAtom);
  const isSelectingModel = selectedChatId
    ? (isSelectingModelById.get(selectedChatId) ?? false)
    : false;

  const activeUser = user || auth.currentUser;

  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  //handle copy chat
  const { copyMessageContent, copied } = useCopyToClipboard();
  const handleCopyFormatted = useCallback(async () => {
    await copyMessageContent(message.content);
  }, [copyMessageContent, message.content]);
  const loadingPhrases = useMemo(
    () => [
      "Pensando",
      "Analizando contexto",
      "Preparando respuesta",
    ],
    [],
  );
  const [loadingPhraseIndex, setLoadingPhraseIndex] = useState(0);

  // Rotate the "Thinking" phrase while streaming
  useEffect(() => {
    if (
      isAssistant &&
      isStreaming &&
      isLastMessage &&
      !isSelectingModel
    ) {
      const interval = setInterval(() => {
        setLoadingPhraseIndex((prev) => (prev + 1) % loadingPhrases.length);
      }, 2200);
      return () => clearInterval(interval);
    }
  }, [
    isAssistant,
    isLastMessage,
    isStreaming,
    isSelectingModel,
    loadingPhrases.length,
  ]);

  // Extract the real current action from the streaming content
  const streamingLabel = useMemo(() => {
    if (!message.content || !isStreaming || !isLastMessage) return undefined;

    // Find the last unclosed (in-progress) custom tag
    const tagPattern = /<(dyad-write|dyad-edit|dyad-search-replace|dyad-read|dyad-delete|dyad-rename|dyad-grep|dyad-code-search|dyad-web-search|dyad-web-crawl|dyad-add-dependency|dyad-execute-sql|dyad-read-logs|dyad-list-files|dyad-mcp-tool-call|dyad-codebase-context|dyad-git|think|dyad-think)\s*([^>]*)>/g;
    const closePattern = (tag: string) => new RegExp(`</${tag}>`, "g");

    let lastOpenTag: string | null = null;
    let lastAttrs: string = "";
    let match;

    // Collect all opening tags
    const openings: { tag: string; attrs: string; index: number }[] = [];
    while ((match = tagPattern.exec(message.content)) !== null) {
      openings.push({ tag: match[1], attrs: match[2], index: match.index });
    }

    // Find the last tag that has no closing tag after it
    for (let i = openings.length - 1; i >= 0; i--) {
      const { tag, attrs } = openings[i];
      const closes = (message.content.match(closePattern(tag)) || []).length;
      const opens = openings.filter((o) => o.tag === tag).length;
      if (opens > closes) {
        lastOpenTag = tag;
        lastAttrs = attrs;
        break;
      }
    }

    if (lastOpenTag) {
      const meta = TOOL_META[lastOpenTag];
      if (meta) {
        // Parse attributes to get detail
        const attributes: Record<string, string> = {};
        const attrPattern = /([\w-]+)="([^"]*)"/g;
        let attrMatch;
        while ((attrMatch = attrPattern.exec(lastAttrs)) !== null) {
          attributes[attrMatch[1]] = attrMatch[2];
        }
        const detail = getToolDetail(lastOpenTag, attributes);
        return detail ? `${meta.label} ${detail}` : meta.label;
      }
    }

    // Fallback: check if the last completed tool was git (still executing or waiting for model response)
    const lastGitTag = message.content.lastIndexOf("<dyad-git ");
    if (lastGitTag !== -1) {
      return "Consultando repositorio";
    }

    // Generic fallback
    return "Generando respuesta";
  }, [message.content, isStreaming, isLastMessage]);
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


  const isFixError = isUser && message.content?.startsWith("Fix error:");

  return (
    <div className="flex justify-center">
      <div className="mt-4 mb-4 w-full max-w-4xl mx-auto group">
        <div className={`flex items-start gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
          {/* Avatar */}
          <div className="flex-shrink-0 mt-1">
            {isUser ? (
              <SimpleAvatar
                src={activeUser?.photoURL || undefined}
                className="h-7 w-7"
                fallbackText={
                  activeUser
                    ? (activeUser.displayName?.[0] || activeUser.email?.[0] || "U").toUpperCase()
                    : <UserIcon className="h-4 w-4" />
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
                : isFixError
                  ? "px-4 py-3 bg-rose-500/8 dark:bg-rose-500/10 border border-rose-400/25 w-fit cursor-pointer"
                  : "px-4 py-3 bg-primary/10 dark:bg-primary/15 border border-primary/20 w-fit"
                }`}
            >
              {/* === Assistant: ternary — loader OR content === */}
              {isAssistant &&
                !message.content &&
                isStreaming &&
                isLastMessage &&
                !isSelectingModel ? (
                <StreamingLoadingAnimation
                  variant="initial"
                  label={loadingPhrases[loadingPhraseIndex]}
                />
              ) : isAssistant && !isSelectingModel ? (
                <div
                  className={`prose dark:prose-invert prose-headings:mb-2 prose-p:my-1 prose-pre:my-0 max-w-none break-words ${isCollapsed ? "hidden" : ""}`}
                  suppressHydrationWarning
                >
                  <DyadMarkdownParser content={message.content} />
                  {isLastMessage && isStreaming && (
                    <StreamingLoadingAnimation
                      variant="streaming"
                      label={streamingLabel}
                    />
                  )}
                </div>
              ) : null}
              {/* === User messages === */}
              {isUser && !isSelectingModel && (
                <div
                  className="prose dark:prose-invert prose-headings:mb-2 prose-p:my-1 prose-pre:my-0 max-w-none break-words"
                  suppressHydrationWarning
                >
                  <UserMessageContent
                    content={message.content}
                    aiMessagesJson={message.aiMessagesJson}
                  />
                </div>
              )}
              {(isAssistant && message.content && !isStreaming) ? (
                <div
                  className={`mt-2 flex items-center justify-between text-xs`}
                >
                  {isAssistant &&
                    message.content &&
                    !isStreaming && (
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
                  <div className="flex flex-wrap gap-2">
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
                            <Bot className="h-4 w-4 flex-shrink-0 text-primary" />
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
