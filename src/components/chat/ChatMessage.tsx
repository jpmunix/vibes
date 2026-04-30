import React from "react";
import type { Message } from "@/ipc/types";
import { ipc } from "@/ipc/types";
import { PERSISTED_ERROR_PREFIX } from "@/shared/texts";
import { MemoryBadge } from "./MemoryBadge";
import {
  VibesMarkdownParser,
} from "./VibesMarkdownParser";
import { UserMessageContent } from "./UserMessageContent";
import { useStreamChat } from "@/hooks/useStreamChat";
import { StreamingLoadingAnimation } from "./StreamingLoadingAnimation";
import { TOOL_META, getToolDetail, getBgColorClass, formatPriceCost } from "./CompactToolBadge";
import { normalizeLegacyTags } from "../../../shared/normalizeLegacyTags";
import { AlertTriangle } from "@/components/ui/icons";
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
  Quote,
  type LucideIcon,
} from "@/components/ui/icons";
import { formatDistanceToNow, format } from "date-fns";
import { es } from "date-fns/locale";
import { useVersions } from "@/hooks/useVersions";
import { useAtom, useAtomValue } from "jotai";
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
  quotedMessagesAtom,
  isZenModeAtom,
  pendingAskUsersAtom,
  selectedMemoriesByChatIdAtom,
} from "@/atoms/chatAtoms";
import { AutoRouterModelBadge } from "./AutoRouterModelBadge";
import { SimpleAvatar } from "@/components/ui/SimpleAvatar";
import logoSrc from "../../../assets/icon/logo.png";

interface ChatMessageProps {
  message: Message;
  isLastMessage: boolean;
  user?: VibesUser | null;
  forceFullMode?: boolean;
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

/** Compact relative time: "2h", "15min", "3d", or full date if > 7d */
const formatTimestamp = (timestamp: string | Date) => {
  const now = new Date();
  const messageTime = new Date(timestamp);
  const diffMs = now.getTime() - messageTime.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMin / 60);
  const diffD = Math.floor(diffH / 24);
  if (diffMin < 1) return "ahora";
  if (diffMin < 60) return `${diffMin}min`;
  if (diffH < 24) return `${diffH}h`;
  if (diffD <= 7) return `${diffD}d`;
  return format(messageTime, "d MMM, H:mm", { locale: es });
};

/** Format milliseconds into a human-readable duration (e.g. "23s", "1m 23s") */
const formatDurationMs = (ms: number): string => {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
};
const ChatMessage = ({ message, isLastMessage, user, forceFullMode }: ChatMessageProps) => {
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
  const isZenModeAtomValue = useAtomValue(isZenModeAtom);
  const isZenMode = forceFullMode ? false : isZenModeAtomValue;
  const selectedMemoriesMap = useAtomValue(selectedMemoriesByChatIdAtom);
  const selectedMemories = selectedChatId ? selectedMemoriesMap.get(selectedChatId) : undefined;

  // Resolve memories: prefer live atom (streaming) for last message, fall back to persisted DB data
  const resolvedMemories = useMemo(() => {
    if (isLastMessage && selectedMemories && selectedMemories.length > 0) {
      return selectedMemories;
    }
    if (message.role === "assistant" && (message as any).injectedMemories) {
      const raw = (message as any).injectedMemories;
      if (typeof raw === "string") {
        try { return JSON.parse(raw); } catch { return undefined; }
      }
      if (Array.isArray(raw)) return raw;
    }
    return undefined;
  }, [isLastMessage, selectedMemories, message]);

  const activeUser = user || userAtomValue;

  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const isSystem = message.role === "system";

  // System messages are completely hidden from the user interface
  // They only exist in the DB to provide context to the LLM
  if (isSystem) return null;

  // Detect persisted errors (content starts with $$VIBES_ERROR$$)
  const persistedError = isAssistant && message.content?.startsWith(PERSISTED_ERROR_PREFIX)
    ? message.content.slice(PERSISTED_ERROR_PREFIX.length)
    : null;

  // Error from in-memory atom (current session) OR from persisted content
  const effectiveError = (isLastMessage && chatError) || persistedError;

  // Is this an error message? (assistant, not streaming, error exists)
  const isErrorMessage = isAssistant && !isStreaming && !!effectiveError;
  //handle copy chat (assistant) — strips tool calls, keeps only prose
  const { copyMessageContent, copied } = useCopyToClipboard();
  const handleCopyFormatted = useCallback(async () => {
    let text = message.content ?? "";
    text = text
      .replace(/<(vibes-[\w-]+|think|thought|vibes-think)[^>]*>[\s\S]*?<\/\1>/g, "")
      .replace(/<\/?[^>]+>/g, "")
      .replace(/[ \t]*\n[ \t]*/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    await copyMessageContent(text);
  }, [copyMessageContent, message.content]);

  // handle copy for user messages (strips attachment metadata)
  const [userCopied, setUserCopied] = useState(false);
  const handleCopyUserMessage = useCallback(async () => {
    let text = message.content ?? "";
    // Strip attachment / component / upload metadata
    const attachmentMarker = text.indexOf("\n\nAttachments:\n");
    if (attachmentMarker !== -1) text = text.substring(0, attachmentMarker);
    const componentMarker = text.indexOf("\n\nSelected components:\n");
    if (componentMarker !== -1) text = text.substring(0, componentMarker);
    const uploadMarker = text.indexOf("\n\nFile to upload to codebase:");
    if (uploadMarker !== -1) text = text.substring(0, uploadMarker);
    await copyMessageContent(text.trim());
    setUserCopied(true);
    setTimeout(() => setUserCopied(false), 2000);
  }, [copyMessageContent, message.content]);

  // Quote / cite message
  const [, setQuotedMessages] = useAtom(quotedMessagesAtom);
  const handleQuote = useCallback(() => {
    let text = message.content ?? "";
    if (isUser) {
      // Strip metadata like copy does
      const m1 = text.indexOf("\n\nAttachments:\n");
      if (m1 !== -1) text = text.substring(0, m1);
      const m2 = text.indexOf("\n\nSelected components:\n");
      if (m2 !== -1) text = text.substring(0, m2);
      const m3 = text.indexOf("\n\nFile to upload to codebase:");
      if (m3 !== -1) text = text.substring(0, m3);
    } else {
      // For assistant: remove ALL vibes tool blocks + think blocks, keep only prose
      text = text
        .replace(/<(vibes-[\w-]+|think|thought|vibes-think)[^>]*>[\s\S]*?<\/\1>/g, "")
        .replace(/<\/?[^>]+>/g, "")   // strip any remaining tags
        .replace(/[ \t]*\n[ \t]*/g, "\n") // normalize lines
        .replace(/\n{3,}/g, "\n\n")   // collapse excessive blank lines
        .trim();
    }
    const newQuote = {
      id: message.id,
      role: message.role as "user" | "assistant",
      content: text,
    };
    setQuotedMessages((prev) => {
      // Avoid duplicates
      if (prev.some((q) => q.id === message.id)) return prev;
      return [...prev, newQuote];
    });
  }, [message.id, message.role, message.content, isUser, setQuotedMessages]);

  // Open single message debug window
  const openDebugMessage = useCallback(() => {
    if (isStreaming && isLastMessage) return; // Prevent opening dead/empty modal during generation
    if (!appId || !selectedChatId || !message.id) return;
    const theme = localStorage.getItem("theme");
    const intensity = localStorage.getItem("theme-intensity");
    ipc.system.openMessageWindow({
      appId,
      chatId: selectedChatId,
      messageId: message.id,
      theme: (theme === "light" || theme === "dark" || theme === "system") ? theme : undefined,
      themeIntensity: intensity ? parseFloat(intensity) : undefined,
    });
  }, [appId, selectedChatId, message.id, isStreaming, isLastMessage]);

  // Memoize the normalized content at the TOP to prevent breaking PureComponent/React.memo
  // downstream in VibesMarkdownParser, and to share this single allocation across all hooks
  const normalizedMessageContent = useMemo(() => {
    if (!message.content) return "";
    return normalizeLegacyTags(message.content);
  }, [message.content]);

  // Extract the real current action from the streaming content
  const streamingInfo = useMemo(() => {
    const defaultInfo = { label: "Trabajando", dotColorClass: "bg-purple-500" as string | undefined, labelColorClass: "text-purple-500" as string | undefined, contentExcerpt: undefined as string | undefined };
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
            // Get roughly the last ~20 words for a more generous peek
            const words = cleanText.split(" ");
            const excerpt = words.slice(-20).join(" ");
            contentExcerpt = words.length > 20 ? `...${excerpt}` : excerpt;
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

    // No open tag — show generic "Trabajando" in consistent purple.
    // This covers both the initial state (before any tags) and the prose
    // streaming state (after a tool tag was closed).
    return defaultInfo;
  }, [message.content, isStreaming, isLastMessage]);

  // Override streaming indicator when agent is waiting for user answer
  const pendingAskUsers = useAtomValue(pendingAskUsersAtom);
  const hasPendingQuestion = isStreaming && isLastMessage && selectedChatId != null
    && pendingAskUsers.some((p) => p.chatId === selectedChatId);

  const effectiveStreamingInfo = hasPendingQuestion
    ? { label: "Esperando respuesta", dotColorClass: "bg-violet-400", labelColorClass: "text-violet-400", contentExcerpt: undefined }
    : streamingInfo;

  // Plain-text excerpt for collapsed view (~80 chars)
  // Skipped in zen mode — no collapse feature.
  const plainTextExcerpt = useMemo(() => {
    if (isZenMode) return "";
    if (!normalizedMessageContent || !isAssistant) return "";
    const stripped = normalizedMessageContent
      .replace(/<(vibes-[\w-]+|think|vibes-think)[^>]*>[\s\S]*?<\/\1>/g, "")
      .replace(/<[^>]+>/g, "")
      .replace(/[#*_`~>\-|]/g, "")
      .replace(/\n+/g, " ")
      .trim();
    return stripped.length > 80 ? stripped.slice(0, 80) + "…" : stripped;
  }, [normalizedMessageContent, isAssistant, isZenMode]);

  // Tool usage summary grouped by icon (for collapsed badges)
  // Skipped in zen mode — no badges, no collapse summary.
  const toolSummary = useMemo(() => {
    if (isZenMode) return [];
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
  }, [message.content, isAssistant, isZenMode]);

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

  // Extract total message cost from vibes-token-usage tags
  const messageCost = useMemo(() => {
    if (!normalizedMessageContent || !isAssistant) return null;
    const tokenTagPattern = /<vibes-token-usage\s([^>]*)>[\s\S]*?<\/vibes-token-usage>/g;
    let totalCost = 0;
    let hasCost = false;
    let match;
    while ((match = tokenTagPattern.exec(normalizedMessageContent)) !== null) {
      const attrsStr = match[1];
      const getAttr = (name: string) => {
        const m = new RegExp(`${name}="([^"]*)"`).exec(attrsStr);
        return m ? m[1] : "";
      };

      // Path 1: direct cost from OpenCode (ground truth)
      const directCostStr = getAttr("cost");
      if (directCostStr) {
        const directCost = parseFloat(directCostStr);
        if (!isNaN(directCost)) {
          hasCost = true;
          totalCost += directCost;
          continue;
        }
      }

      // Path 2: legacy — compute from token counts × price
      const inp = parseInt(getAttr("input"), 10);
      const out = parseInt(getAttr("output"), 10);
      const cached = parseInt(getAttr("cached"), 10);
      const webSearches = parseInt(getAttr("web-searches"), 10);
      const priceIn = parseFloat(getAttr("price-input"));
      const priceOut = parseFloat(getAttr("price-output"));
      if (priceIn > 0 || priceOut > 0 || webSearches > 0) {
        hasCost = true;
        totalCost += (inp - cached) * priceIn + cached * priceIn * 0.5 + out * priceOut + webSearches * 0.02;
      }
    }
    return hasCost ? formatPriceCost(totalCost) : null;
  }, [normalizedMessageContent, isAssistant]);


  const isFixError = isUser && message.content?.startsWith("Fix error:");

  return (
    <div className="flex justify-center">
      <div className="mt-4 mb-4 w-full mx-auto group" style={{ maxWidth: "var(--bubble-width, 65%)" }}>
        <div className={`flex items-start gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
          {/* Avatar (hidden for system messages) */}
          {!isSystem && (
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
          )}

          {/* Message bubble */}
          <div className={isSystem ? "flex-1 w-full flex justify-center" : isAssistant ? "flex-1 min-w-0" : "flex-shrink min-w-0 max-w-[92%]"}>
            {/* Wrapper relative only for user, so the copy button can float outside */}
            <div className={isUser ? "relative" : ""}>
            {isUser && !isSelectingModel && message.content && (
              <div className="absolute -left-16 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                <button
                  onClick={handleQuote}
                  title="Citar"
                  className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                  aria-label="Citar mensaje"
                >
                  <Quote size={13} />
                </button>
                <button
                  onClick={handleCopyUserMessage}
                  title={userCopied ? "¡Copiado!" : "Copiar"}
                  className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                  aria-label="Copiar mensaje"
                >
                  {userCopied ? (
                    <Check size={13} className="text-green-500" />
                  ) : (
                    <Copy size={13} />
                  )}
                </button>
              </div>
            )}
            <div
              onClick={isCollapsed && isAssistant ? () => setIsCollapsed(false) : undefined}
              className={`rounded-lg ${isSystem
                ? "px-4 py-2 bg-muted/30 border border-muted/50 text-xs text-muted-foreground w-fit max-w-[80%]"
                : isAssistant
                ? isErrorMessage
                  ? "px-4 py-3 bg-rose-500/8 dark:bg-rose-500/10 border border-rose-400/25"
                  : `px-4 ${isCollapsed ? "py-2 cursor-pointer hover:bg-secondary/60 dark:hover:bg-secondary/40 transition-colors" : "py-3"} bg-secondary/50 dark:bg-secondary/30 border border-secondary/40`
                : isFixError
                  ? "px-4 pt-2 pb-3 bg-rose-500/8 dark:bg-rose-500/10 border border-rose-400/25 w-fit cursor-pointer"
                  : "px-4 pt-2 pb-3 bg-primary/10 dark:bg-primary/15 border border-primary/20 w-fit"
                }`}
            >
              {/* === System messages === */}
              {isSystem && !isSelectingModel && (
                <div
                  className="prose prose-xs dark:prose-invert prose-p:my-1 prose-pre:my-0 max-w-none break-words text-center"
                  suppressHydrationWarning
                >
                  <VibesMarkdownParser content={message.content} forceFullMode={forceFullMode} />
                </div>
              )}
              {/* === Assistant messages === */}
              {isAssistant && !isSelectingModel && (
                <>
                  {isErrorMessage ? (
                    /* Error state: show translated error inline */
                    <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
                       <AlertTriangle size={16} className="flex-shrink-0" />
                       <span className="typo-label">{translateError(effectiveError!)}</span>
                    </div>
                  ) : (
                    <>
                      <div
                        className={`prose prose-sm dark:prose-invert prose-headings:mb-2 prose-p:my-1 prose-pre:my-0 max-w-none break-words ${isCollapsed ? "hidden" : ""}`}
                        suppressHydrationWarning
                      >
                         <VibesMarkdownParser content={message.content} forceFullMode={forceFullMode} />
                      </div>
                      {/* Streaming loader: visible while streaming, hidden on error */}
                      {isLastMessage && isStreaming && (
                         <StreamingLoadingAnimation
                            variant="initial"
                            label={effectiveStreamingInfo.label}
                            dotColorClass={effectiveStreamingInfo.dotColorClass}
                            labelColorClass={effectiveStreamingInfo.labelColorClass}
                            contentExcerpt={effectiveStreamingInfo.contentExcerpt}
                         />
                      )}
                    </>
                  )}
                </>
              )}
              {/* === User messages === */}
              {isUser && !isSelectingModel && (
                <div
                  className="prose prose-sm dark:prose-invert prose-headings:mb-2 prose-p:my-1 prose-pre:my-0 max-w-none break-words"
                  suppressHydrationWarning
                >
                  <UserMessageContent
                    content={message.content}
                    aiMessagesJson={message.aiMessagesJson}
                  />
                </div>
              )}

              {(isAssistant && message.content && !isZenMode) ? (
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
                    {/* Quote + Copy buttons for assistant — stop propagation to avoid collapsing */}
                    {!isCollapsed && message.content && (
                      <div className="flex items-center gap-0.5 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleQuote(); }}
                          title="Citar"
                          className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                          aria-label="Citar respuesta"
                        >
                          <Quote size={12} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleCopyFormatted(); }}
                          title={copied ? "¡Copiado!" : "Copiar"}
                          className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                          aria-label="Copiar respuesta"
                        >
                          {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                        </button>
                        {messageCost && (
                          <span className="typo-micro ml-1">{messageCost}</span>
                        )}
                        {resolvedMemories && resolvedMemories.length > 0 && (
                          <div onClick={(e) => e.stopPropagation()}>
                            <MemoryBadge memories={resolvedMemories} />
                          </div>
                        )}
                        {message.createdAt && (
                          <span className="typo-micro ml-1 flex items-center gap-1">
                            <Clock size={10} />
                            {message.durationMs != null && message.durationMs > 0
                              ? `${formatDurationMs(message.durationMs)} · ${formatTimestamp(message.createdAt)}`
                              : formatTimestamp(message.createdAt)
                            }
                          </span>
                        )}
                      </div>
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
                            onClick={isStreaming && isLastMessage ? undefined : openDebugMessage}
                          />
                        ) : (
                          <div
                            className={`flex items-center gap-1 text-muted-foreground w-full sm:w-auto transition-colors ${!(isStreaming && isLastMessage) ? 'cursor-pointer hover:text-foreground' : ''}`}
                            onClick={isStreaming && isLastMessage ? undefined : openDebugMessage}
                          >
                            <Bot className="h-4 w-4 flex-shrink-0 text-primary" />
                            <span className="typo-micro">{message.model}</span>
                          </div>
                        )}
                      </>
                    )}

                  </div>
                </div>
              ) : isAssistant && message.content && isZenMode ? (
                /* Zen mode: minimal footer with just quote/copy + model — no collapse */
                <div className="mt-2 flex items-center justify-between text-xs px-1 py-1 -mx-1">
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={handleQuote}
                      title="Citar"
                      className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                      aria-label="Citar respuesta"
                    >
                      <Quote size={12} />
                    </button>
                    <button
                      onClick={handleCopyFormatted}
                      title={copied ? "¡Copiado!" : "Copiar"}
                      className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                      aria-label="Copiar respuesta"
                    >
                      {copied ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
                    </button>
                    {messageCost && (
                      <span className="typo-micro ml-1">{messageCost}</span>
                    )}
                    {resolvedMemories && resolvedMemories.length > 0 && (
                      <MemoryBadge memories={resolvedMemories} />
                    )}
                    {message.createdAt && (
                      <span className="typo-micro ml-1 flex items-center gap-1">
                        <Clock size={10} />
                        {message.durationMs != null && message.durationMs > 0
                          ? `${formatDurationMs(message.durationMs)} · ${formatTimestamp(message.createdAt)}`
                          : formatTimestamp(message.createdAt)
                        }
                      </span>
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
                            onClick={isStreaming && isLastMessage ? undefined : openDebugMessage}
                          />
                        ) : (
                          <div
                            className={`flex items-center gap-1 text-muted-foreground w-full sm:w-auto transition-colors ${!(isStreaming && isLastMessage) ? 'cursor-pointer hover:text-foreground' : ''}`}
                            onClick={isStreaming && isLastMessage ? undefined : openDebugMessage}
                          >
                            <Bot className="h-4 w-4 flex-shrink-0 text-primary" />
                            <span className="typo-micro">{message.model}</span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ) : null}

              {/* === Compact collapsed summary (full mode only) === */}
              {!isZenMode && isAssistant && isCollapsed && message.content && (
                <div className="flex items-center gap-2 min-w-0">
                  <span className="typo-caption truncate flex-1 min-w-0">
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
                              <span className="typo-micro">
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
            </div>{/* end relative wrapper */}
          </div>
          {/* Invisible spacer to balance avatar width — keeps content centered */}
          {!isSystem && <div className="w-7 flex-shrink-0" />}
        </div>
      </div>
    </div>
  );
};

export default React.memo(ChatMessage);
