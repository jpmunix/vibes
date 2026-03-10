import type { Message } from "@/ipc/types";
import { ipc } from "@/ipc/types";
import { PERSISTED_ERROR_PREFIX } from "@/shared/texts";
import {
  VibesMarkdownParser,
} from "./VibesMarkdownParser";
import { UserMessageContent } from "./UserMessageContent";
import { useStreamChat } from "@/hooks/useStreamChat";
import { StreamingLoadingAnimation } from "./StreamingLoadingAnimation";
import { TOOL_META, getToolDetail, getBgColorClass } from "./CompactToolBadge";
import { normalizeLegacyTags } from "../../../shared/normalizeLegacyTags";
import { AlertTriangle } from "lucide-react";
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
  type LucideIcon,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { es } from "date-fns/locale";
import { useVersions } from "@/hooks/useVersions";
import { useAtomValue } from "jotai";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { userAtom, type VibesUser } from "@/atoms/authAtoms";
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
  chatErrorByIdAtom,
} from "@/atoms/chatAtoms";
import { AutoRouterModelBadge } from "./AutoRouterModelBadge";
import { SimpleAvatar } from "@/components/ui/SimpleAvatar";
import logoSrc from "../../../assets/icon/logo.png";

interface ChatMessageProps {
  message: Message;
  isLastMessage: boolean;
  user?: VibesUser | null;
}
// Hoisted to module level — pure function, no component state needed

/** Translate common AI error messages to user-friendly Spanish */
function translateError(raw: string): string {
  // Strip common prefixes
  let msg = raw
    .replace(/^Sorry, there was an error from the AI:\s*/i, "")
    .replace(/^\[req:[^\]]*\]\s*/i, "")
    .replace(/^AI error:\s*/i, "")
    .trim();

  // Map common patterns
  if (/rate.?limit|resource.*(exhausted|exceeded)|too many requests|429/i.test(msg)) {
    return "Se ha superado el límite de solicitudes. Espera un momento e inténtalo de nuevo.";
  }
  if (/provider returned error/i.test(msg)) {
    return "El proveedor de IA devolvió un error. Inténtalo de nuevo.";
  }
  if (/exceeded.*budget|ExceededBudget/i.test(msg)) {
    return "Se han agotado los créditos de IA de este mes.";
  }
  if (/no.?output.?generated|empty.*response|zero.*tokens/i.test(msg)) {
    return "La IA no generó ninguna respuesta. Inténtalo de nuevo.";
  }
  if (/API key|unauthorized|authentication|forbidden|401|403/i.test(msg)) {
    return "Error de autenticación con el proveedor de IA. Revisa tu clave API en ajustes.";
  }
  if (/network|ECONNREFUSED|ETIMEDOUT|fetch failed|socket/i.test(msg)) {
    return "Error de conexión con el proveedor de IA. Comprueba tu conexión a internet.";
  }
  if (/context.*(too long|exceeded|limit)|max.*tokens|token.*limit/i.test(msg)) {
    return "El mensaje es demasiado largo para el modelo. Intenta resumir o abrir un nuevo chat.";
  }
  if (/model.*not.*found|does not exist|invalid.*model/i.test(msg)) {
    return "El modelo seleccionado no está disponible. Prueba con otro modelo.";
  }
  if (/timeout|timed?\s*out/i.test(msg)) {
    return "La solicitud tardó demasiado. Inténtalo de nuevo.";
  }
  if (/server.*error|internal.*error|500|502|503/i.test(msg)) {
    return "Error del servidor de IA. Inténtalo de nuevo en unos segundos.";
  }
  if (/content.*filter|safety|blocked|moderation/i.test(msg)) {
    return "El contenido fue bloqueado por los filtros de seguridad del modelo.";
  }

  // Fallback: return stripped message as-is
  return msg || "Ha ocurrido un error inesperado.";
}

const formatTimestamp = (timestamp: string | Date) => {
  const now = new Date();
  const messageTime = new Date(timestamp);
  const diffInHours =
    (now.getTime() - messageTime.getTime()) / (1000 * 60 * 60);
  if (diffInHours < 24) {
    return formatDistanceToNow(messageTime, { addSuffix: true, locale: es });
  } else {
    return format(messageTime, "d 'de' MMM yyyy, H:mm", { locale: es });
  }
};

/** Format milliseconds into a human-readable duration (e.g. "23s", "1m 23s") */
const formatDurationMs = (ms: number): string => {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
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

  // Error state for this chat
  const errorById = useAtomValue(chatErrorByIdAtom);
  const chatError = selectedChatId ? (errorById.get(selectedChatId) ?? null) : null;
  const userAtomValue = useAtomValue(userAtom);

  const activeUser = user || userAtomValue;

  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";

  // Detect persisted errors (content starts with $$VIBES_ERROR$$)
  const persistedError = isAssistant && message.content?.startsWith(PERSISTED_ERROR_PREFIX)
    ? message.content.slice(PERSISTED_ERROR_PREFIX.length)
    : null;

  // Error from in-memory atom (current session) OR from persisted content
  const effectiveError = (isLastMessage && chatError) || persistedError;

  // Is this an error message? (assistant, not streaming, error exists)
  const isErrorMessage = isAssistant && !isStreaming && !!effectiveError;
  //handle copy chat
  const { copyMessageContent, copied } = useCopyToClipboard();
  const handleCopyFormatted = useCallback(async () => {
    await copyMessageContent(message.content);
  }, [copyMessageContent, message.content]);

  // Memoize the normalized content at the TOP to prevent breaking PureComponent/React.memo
  // downstream in VibesMarkdownParser, and to share this single allocation across all hooks
  const normalizedMessageContent = useMemo(() => {
    if (!message.content) return "";
    return normalizeLegacyTags(message.content);
  }, [message.content]);

  // Extract the real current action from the streaming content
  const streamingInfo = useMemo(() => {
    const defaultInfo = { label: "Pensando", dotColorClass: "bg-purple-500" as string | undefined, labelColorClass: "text-purple-500" as string | undefined, contentExcerpt: undefined as string | undefined };
    if (!isStreaming || !isLastMessage) return defaultInfo;
    if (!normalizedMessageContent || !normalizedMessageContent.trim()) return defaultInfo;

    const VIBES_CUSTOM_TAGS = [
      "vibes-write", "vibes-rename", "vibes-delete", "vibes-add-dependency",
      "vibes-execute-sql", "vibes-read-logs", "vibes-add-integration",
      "vibes-edit", "vibes-grep", "vibes-search-replace", "vibes-codebase-context",
      "vibes-web-crawl", "vibes-code-search", "vibes-read", "think", "thought",
      "vibes-mcp-tool-call", "vibes-list-files", "vibes-database-schema",
      "vibes-supabase-table-schema", "vibes-supabase-project-info", "vibes-status",
      "vibes-think", "vibes-git", "vibes-ask-user", "vibes-patch", "vibes-run-command",
      "vibes-start-process", "vibes-stop-process", "vibes-list-processes",
      "vibes-wait-http", "vibes-typecheck-summary", "vibes-token-usage"
    ];

    let lastOpenTag: string | null = null;
    let lastOpenIndex: number = -1;
    let lastAttrs: string = "";

    // Iterate through all tags to find the one that was opened last and is still open
    for (const tagName of VIBES_CUSTOM_TAGS) {
      const openTagPattern = new RegExp(`<${tagName}\\b([^>]*)>`, "g");
      const closeTagPattern = new RegExp(`</${tagName}>`, "g");

      let match;
      const openings: { index: number, attrs: string, fullMatchLength: number }[] = [];
      while ((match = openTagPattern.exec(normalizedMessageContent)) !== null) {
        openings.push({ index: match.index, attrs: match[1], fullMatchLength: match[0].length });
      }

      const openCount = openings.length;
      const closeCount = (normalizedMessageContent.match(closeTagPattern) || []).length;

      // If we have more opening tags than closing tags, this tag is in progress
      if (openCount > closeCount) {
        // Find the specific opening tag that is unclosed
        // We assume the unclosed tags are the LAST ONES (e.g., if there are 3 open and 2 closed, the 3rd is unclosed)
        const unclosedOpening = openings[openCount - 1]; // Simply pick the last opening of this type

        if (unclosedOpening && unclosedOpening.index > lastOpenIndex) {
          lastOpenIndex = unclosedOpening.index;
          lastOpenTag = tagName;
          lastAttrs = unclosedOpening.attrs;
          // Offset the index to point to the inner content for thought extraction
          lastOpenIndex += unclosedOpening.fullMatchLength;
        }
      }
    }

    if (lastOpenTag !== null && lastOpenTag !== undefined) {
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
        const activeLabel = meta.pendingLabel ?? meta.label;

        let contentExcerpt: string | undefined = undefined;
        // If it's a thinking tag, extract a short, clean snippet of the ongoing thought
        if (["think", "thought", "vibes-think"].includes(lastOpenTag) && lastOpenIndex !== -1) {
          const ongoingContent = normalizedMessageContent.slice(lastOpenIndex);
          // Strip basic markdown to get clean text for the excerpt
          const cleanText = ongoingContent
            .replace(/<[^>]+>/g, "") // remove inner tags if any
            .replace(/[#*_`~>\-|]/g, "") // remove basic markdown chars
            .replace(/\s+/g, " ") // normalize spacing
            .trim();

          if (cleanText) {
            // Get roughly the last 5-8 words, or up to ~50 characters
            const words = cleanText.split(" ");
            const excerpt = words.slice(-8).join(" ");
            contentExcerpt = words.length > 8 ? `...${excerpt}` : excerpt;
          } else {
            contentExcerpt = "...";
          }
        }

        // For ask-user, don't append the (potentially very long) question as detail
        const skipDetail = lastOpenTag === "vibes-ask-user";

        return {
          label: (!skipDetail && detail) ? `${activeLabel} ${detail}` : activeLabel,
          dotColorClass: getBgColorClass(meta.color),
          labelColorClass: meta.color,
          contentExcerpt,
        };
      }
    }

    // Fallback: check if the last completed tool was git
    const lastGitTag = normalizedMessageContent.lastIndexOf("<vibes-git ");
    if (lastGitTag !== -1) {
      return { label: "Consultando repositorio", dotColorClass: "bg-orange-500", labelColorClass: "text-orange-500", contentExcerpt: undefined };
    }

    // Generic fallback
    return defaultInfo;
  }, [message.content, isStreaming, isLastMessage]);

  // Plain-text excerpt for collapsed view (~80 chars)
  const plainTextExcerpt = useMemo(() => {
    if (!normalizedMessageContent || !isAssistant) return "";
    const stripped = normalizedMessageContent
      .replace(/<(vibes-[\w-]+|think|vibes-think)[^>]*>[\s\S]*?<\/\1>/g, "")
      .replace(/<[^>]+>/g, "")
      .replace(/[#*_`~>\-|]/g, "")
      .replace(/\n+/g, " ")
      .trim();
    return stripped.length > 80 ? stripped.slice(0, 80) + "…" : stripped;
  }, [normalizedMessageContent, isAssistant]);

  // Tool usage summary grouped by icon (for collapsed badges)
  const toolSummary = useMemo(() => {
    if (!normalizedMessageContent || !isAssistant) return [];
    const tagPattern = /<(vibes-[\w-]+)\s[^>]*>[\s\S]*?<\/\1>/g;
    const counts = new Map<string, number>();
    let match;
    while ((match = tagPattern.exec(normalizedMessageContent)) !== null) {
      const tag = match[1];
      if (TOOL_META[tag]) {
        counts.set(tag, (counts.get(tag) || 0) + 1);
      }
    }
    const byIcon = new Map<string, { icon: LucideIcon; color: string; count: number }>();
    for (const [tag, count] of counts) {
      const meta = TOOL_META[tag];
      const key = meta.icon.displayName || meta.icon.name || tag;
      if (byIcon.has(key)) {
        byIcon.get(key)!.count += count;
      } else {
        byIcon.set(key, { icon: meta.icon, color: meta.color, count });
      }
    }
    return Array.from(byIcon.values());
  }, [message.content, isAssistant]);

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
                src={activeUser?.photoUrl || (activeUser as any)?.photoURL || undefined}
                className="h-7 w-7"
                fallbackText={(
                  activeUser?.displayName?.[0] ||
                  activeUser?.email?.[0] ||
                  "U"
                ).toUpperCase()}
              />
            ) : (
              <img
                src={logoSrc}
                alt="AI"
                className="h-7 w-7 rounded-full object-cover"
              />
            )}
          </div>

          {/* Message bubble */}
          <div className={isAssistant ? "flex-1 min-w-0" : "flex-shrink min-w-0"}>
            <div
              onClick={isCollapsed && isAssistant ? () => setIsCollapsed(false) : undefined}
              className={`rounded-lg ${isAssistant
                ? isErrorMessage
                  ? "px-4 py-3 bg-rose-500/8 dark:bg-rose-500/10 border border-rose-400/25"
                  : `px-4 ${isCollapsed ? "py-2 cursor-pointer hover:bg-secondary/60 dark:hover:bg-secondary/40 transition-colors" : "py-3"} bg-secondary/50 dark:bg-secondary/30 border border-secondary/40`
                : isFixError
                  ? "px-4 py-3 bg-rose-500/8 dark:bg-rose-500/10 border border-rose-400/25 w-fit cursor-pointer"
                  : "px-4 py-3 bg-primary/10 dark:bg-primary/15 border border-primary/20 w-fit"
                }`}
            >
              {/* === Assistant messages === */}
              {isAssistant && !isSelectingModel && (
                <>
                  {isErrorMessage ? (
                    /* Error state: show translated error inline */
                    <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
                      <AlertTriangle size={16} className="flex-shrink-0" />
                      <span className="text-sm font-medium">{translateError(effectiveError!)}</span>
                    </div>
                  ) : (
                    <>
                      <div
                        className={`prose dark:prose-invert prose-headings:mb-2 prose-p:my-1 prose-pre:my-0 max-w-none break-words ${isCollapsed ? "hidden" : ""}`}
                        suppressHydrationWarning
                      >
                        <VibesMarkdownParser content={message.content} />
                      </div>
                      {/* Streaming loader: visible while streaming, hidden on error */}
                      {isLastMessage && isStreaming && (
                        <StreamingLoadingAnimation
                          variant="initial"
                          label={streamingInfo.label}
                          dotColorClass={streamingInfo.dotColorClass}
                          labelColorClass={streamingInfo.labelColorClass}
                          contentExcerpt={streamingInfo.contentExcerpt}
                        />
                      )}
                    </>
                  )}
                </>
              )}
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
                  onClick={() => setIsCollapsed(!isCollapsed)}
                  className="mt-2 flex items-center justify-between text-xs cursor-pointer hover:bg-accent/50 rounded-lg px-1 py-1 -mx-1 transition-colors"
                >
                  <div className="flex items-center gap-1 text-muted-foreground">
                    {isCollapsed ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronUp className="h-4 w-4" />
                    )}
                  </div>
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
              {/* === Compact collapsed summary === */}
              {isAssistant && isCollapsed && message.content && (
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm text-muted-foreground truncate flex-1 min-w-0">
                    {plainTextExcerpt}
                  </span>
                  {toolSummary.length > 0 && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {toolSummary.map((g, i) => {
                        const Icon = g.icon;
                        return (
                          <div key={i} className="inline-flex items-center gap-0.5 text-xs">
                            <Icon size={12} className={g.color} />
                            {g.count > 1 && (
                              <span className="text-[10px] text-muted-foreground">
                                ×{g.count}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                </div>
              )}
            </div>
          </div>
        </div>
        {/* Timestamp and commit info for assistant messages - only visible on hover */}
        {isAssistant && message.createdAt && (
          <div className="mt-3 flex flex-wrap items-center justify-start space-x-2 text-xs text-muted-foreground ">
            <div className="flex items-center space-x-1 ml-10">
              <Clock className="h-3 w-3" />
              <span>
                {message.durationMs != null && message.durationMs > 0
                  ? `Ha demorado ${formatDurationMs(message.durationMs)} · ${formatTimestamp(message.createdAt)}`
                  : formatTimestamp(message.createdAt)
                }
              </span>
            </div>
            {messageVersion && messageVersion.message && (
              <div className="flex items-center space-x-1">
                <GitCommit className="h-3 w-3" />
                {messageVersion && messageVersion.message && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        className="max-w-50 truncate font-medium cursor-pointer hover:text-foreground hover:underline transition-colors"
                        onClick={() => {
                          if (appId != null) {
                            ipc.system.openGitWindow({
                              appId,
                              commitHash: message.commitHash ?? undefined,
                              theme: (localStorage.getItem("theme") as "light" | "dark" | "system") ?? undefined,
                              themeIntensity: parseFloat(localStorage.getItem("theme-intensity") ?? "") || undefined,
                            });
                          }
                        }}
                      >
                        {
                          messageVersion.message
                            .replace(/^\[(dyad|vibes)\]\s*/i, "")
                            .split("\n")[0]
                        }
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Ver en Control de Git</TooltipContent>
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
            {message.totalTokens && (
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
