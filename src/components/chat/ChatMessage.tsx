import React from "react";
import type { Message } from "@/ipc/types";
import { ipc } from "@/ipc/types";
import { PERSISTED_ERROR_PREFIX } from "@/shared/texts";
import { MemoryBadge } from "./MemoryBadge";
import {
  VibesMarkdownParser,
} from "./VibesMarkdownParser";
import { UserMessageContent, extractImagesFromAiMessages } from "./UserMessageContent";
import { useStreamChat } from "@/hooks/useStreamChat";
import { StreamingLoadingAnimation } from "./StreamingLoadingAnimation";
import { TOOL_META, getToolDetail, getBgColorClass } from "./CompactToolBadge";
import { normalizeLegacyTags } from "../../../shared/normalizeLegacyTags";
import { ErrorBubble } from "./ErrorBubble";
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
  Share2,
  Image as ImageIcon,
  type LucideIcon,
} from "@/components/ui/icons";
import { formatDistanceToNow, format } from "date-fns";
import { es } from "date-fns/locale";
import { useVersions } from "@/hooks/useVersions";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { userAtom, type VibesUser } from "@/atoms/authAtoms";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from "react";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";

import { showSuccess, showError } from "@/lib/toast";
import { cleanAssistantContent, cleanUserContent, extractImageUrls } from "@/lib/markdown_share_cleaner";
import {
  selectedChatIdAtom,
  autoRouterModelInfoByChatIdAtom,
  isSelectingModelByIdAtom,
  chatErrorByIdAtom,
  chatMessagesByIdAtom,
  quotedMessagesAtom,
  isZenModeAtom,
  pendingAskUsersAtom,
  selectedMemoriesByChatIdAtom,
  messagePreviewAtom,
} from "@/atoms/chatAtoms";
import { AutoRouterModelBadge } from "./AutoRouterModelBadge";
import { SimpleAvatar } from "@/components/ui/SimpleAvatar";
import { VibesAvatar } from "@/components/ui/VibesAvatar";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/hooks/useSettings";

/** Height threshold (px) above which user messages collapse (~6 lines of text) */
const USER_COLLAPSE_HEIGHT = 120;

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
    .replace(/^Sorry, there was an error processing your request:\s*/i, "")
    .replace(/^Session Error:\s*/i, "")
    .replace(/^\[req:[^\]]*\]\s*/i, "")
    .replace(/^AI error:\s*/i, "")
    .replace(/^Error de la IA:\s*/i, "")
    .replace(/^❌\s*(Error:?\s*)?/i, "")
    .trim();

  // --- Irrecuperables: "Parece que..." ---
  if (/insufficient.*(credit|fund|balance)|ExceededBudget|exceeded.*budget/i.test(msg)) {
    return "Parece que se agotaron los creditos de IA de tu cuenta.";
  }
  if (/API key|unauthorized|authentication|forbidden|401|403/i.test(msg)) {
    return "Parece que hay un problema con tu clave API. Revisala en ajustes.";
  }
  if (/model.*not.*found|does not exist|invalid.*model|No endpoints found/i.test(msg)) {
    return "Parece que el modelo seleccionado no esta disponible. Prueba con otro.";
  }
  if (/context.*(too long|exceeded|limit)|max.*tokens|token.*limit|context_length/i.test(msg)) {
    return "Parece que el chat es demasiado largo para el modelo. Abre un nuevo chat o cambia a un modelo con mayor ventana de contexto.";
  }
  if (/content.*filter|safety|blocked|moderation|content_policy/i.test(msg)) {
    return "Parece que el contenido fue bloqueado por los filtros de seguridad del modelo.";
  }
  if (/spawn.*ENOENT|opencode.*not found|binary not found/i.test(msg)) {
    return "Parece que no se encontro el agente de IA. Reinicia Vibes para resolverlo.";
  }
  if (/ENOSPC|no space left/i.test(msg)) {
    return "Parece que no queda espacio en disco. Libera espacio e intentalo de nuevo.";
  }

  // --- Recuperables ---
  if (/rate.?limit|resource.*(exhausted|exceeded)|too many requests|429/i.test(msg)) {
    return "Se ha superado el limite de solicitudes. Espera un momento e intentalo de nuevo.";
  }
  if (/provider returned error/i.test(msg)) {
    return "El proveedor de IA devolvio un error. Intentalo de nuevo.";
  }
  if (/no.?output.?generated|empty.*response|zero.*tokens/i.test(msg)) {
    return "La IA no genero ninguna respuesta. Intentalo de nuevo.";
  }
  if (/network|ECONNREFUSED|ETIMEDOUT|fetch failed|socket|APIConnectionError/i.test(msg)) {
    return "Error de conexion con el proveedor de IA. Comprueba tu conexion a internet.";
  }
  if (/timeout|timed?\s*out|APIConnectionTimeoutError/i.test(msg)) {
    return "La solicitud tardo demasiado. Intentalo de nuevo.";
  }
  if (/server.*error|internal.*error|500|502|503/i.test(msg)) {
    return "Error del servidor de IA. Intentalo de nuevo en unos segundos.";
  }
  if (/session.*busy|SessionBusy/i.test(msg)) {
    return "El agente esta ocupado con otra tarea. Espera a que termine.";
  }
  if (/Session creation returned no data/i.test(msg)) {
    return "No se pudo crear la sesion del agente. Intentalo de nuevo.";
  }
  if (/cannot access.*before initialization|ReferenceError/i.test(msg)) {
    return "Error interno de la aplicacion. Reinicia Vibes para resolverlo.";
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
  const messagesById = useAtomValue(chatMessagesByIdAtom);
  const userAtomValue = useAtomValue(userAtom);
  const isZenModeAtomValue = useAtomValue(isZenModeAtom);
  const isZenMode = forceFullMode ? false : isZenModeAtomValue;
  const selectedMemoriesMap = useAtomValue(selectedMemoriesByChatIdAtom);
  const selectedMemories = selectedChatId ? selectedMemoriesMap.get(selectedChatId) : undefined;

  const { settings: chatMsgSettings } = useSettings();

  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const isSystem = message.role === "system";

  // --- User message collapse state ---
  const userContentRef = useRef<HTMLDivElement>(null);
  const [isUserExpanded, setIsUserExpanded] = useState(false);
  const [isUserLongMessage, setIsUserLongMessage] = useState(false);

  // Measure natural height to decide if collapse is needed (runs before paint to avoid flash)
  useLayoutEffect(() => {
    if (!isUser || !userContentRef.current) return;
    const natural = userContentRef.current.scrollHeight;
    setIsUserLongMessage(natural > USER_COLLAPSE_HEIGHT);
  }, [message.content, isUser]);

  // Count images for the compact badge shown when collapsed
  const userImageCount = useMemo(() => {
    if (!isUser || !message.aiMessagesJson) return 0;
    return extractImagesFromAiMessages(message.aiMessagesJson).length;
  }, [isUser, message.aiMessagesJson]);

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

  // Share individual message via md.mnstatic.com
  const [isSharing, setIsSharing] = useState(false);
  const handleShareMessage = useCallback(async () => {
    if (isSharing) return;
    setIsSharing(true);
    try {
      const cleaned = isUser
        ? cleanUserContent(message.content ?? "")
        : cleanAssistantContent(message.content ?? "");
      // Extract CDN image URLs for user messages (same as full-chat share)
      const imageUrls = isUser ? extractImageUrls((message as any).aiMessagesJson) : [];
      if (!cleaned && imageUrls.length === 0) { setIsSharing(false); return; }
      const role = isUser ? "Usuario" : "Asistente";
      const ts = message.createdAt
        ? new Date(message.createdAt).toLocaleString("es-ES")
        : "";
      const parts: string[] = [`## ${role}${ts ? ` — ${ts}` : ""}\n`];
      if (cleaned) parts.push(cleaned);
      if (imageUrls.length > 0) {
        parts.push("");
        imageUrls.forEach((url, i) => parts.push(`![Captura ${i + 1}](${url})`));
      }
      const md = parts.join("\n");
      const title = `Mensaje ${role}${ts ? ` ${ts}` : ""}`;
      const result = await ipc.markdownShare.uploadDocument({
        title,
        content: md,
        format: "md",
      });
      await navigator.clipboard.writeText(result.data.share_url);
      showSuccess("URL del mensaje copiada al portapapeles");
    } catch (e) {
      showError(e);
    } finally {
      setIsSharing(false);
    }
  }, [isSharing, isUser, message]);

  // Open single message preview modal (in-app)
  const setMessagePreview = useSetAtom(messagePreviewAtom);
  const openDebugMessage = useCallback(() => {
    if (isStreaming && isLastMessage) return; // Prevent opening dead/empty modal during generation
    if (!selectedChatId || !message.id) return;
    setMessagePreview({ chatId: selectedChatId, messageId: message.id });
  }, [selectedChatId, message.id, isStreaming, isLastMessage, setMessagePreview]);

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
        // Extract a short excerpt from the ongoing tool/thinking content
        if (lastOpenIndex !== -1) {
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




  const isFixError = isUser && message.content?.startsWith("Fix error:");

  return (
    <div className="flex justify-center">
      <div className="mt-4 mb-4 w-full mx-auto group" style={{ maxWidth: "var(--bubble-width, 65%)" }}>
        <div className={`flex items-start gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`} style={isUser ? { marginLeft: '100px' } : undefined}>
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
              <VibesAvatar className="h-7 w-7" />
            )}
          </div>
          )}

          {/* Message bubble */}
          <div className={isSystem ? "flex-1 w-full flex justify-center" : isAssistant ? "flex-1 min-w-0" : "flex-shrink min-w-0"}>
            {/* Wrapper relative only for user, so the copy button can float outside */}
            <div className={isUser ? "relative" : ""}>
            {isUser && !isSelectingModel && message.content && (
              <div className="absolute -left-24 bottom-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
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
                    <Check size={13} className="text-primary" />
                  ) : (
                    <Copy size={13} />
                  )}
                </button>
                <button
                  onClick={handleShareMessage}
                  title="Compartir mensaje"
                  className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                  aria-label="Compartir mensaje"
                  disabled={isSharing}
                >
                  <Share2 size={13} className={isSharing ? "animate-pulse text-primary" : ""} />
                </button>
              </div>
            )}
            <div
              onClick={undefined}
              className={`rounded-lg ${isSystem
                ? "px-4 py-2 bg-muted/30 border border-muted/50 text-xs text-muted-foreground w-fit max-w-[80%]"
                : isAssistant
                ? isErrorMessage
                  ? "px-4 py-3 bg-rose-500/8 dark:bg-rose-500/10 border border-rose-400/25"
                  : `px-4 py-3 bg-background-lightest dark:bg-secondary/30 border border-border/60 dark:border-secondary/40`
                : isFixError
                  ? "px-4 pt-2 pb-3 bg-rose-500/8 dark:bg-rose-500/10 border border-rose-400/25 w-fit cursor-pointer"
                  : "px-4 pt-2 pb-3 bg-primary/15 dark:bg-primary/15 border border-primary/25 dark:border-primary/20 w-fit"
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
                    /* Error state: ErrorBubble with actions */
                    <ErrorBubble
                      rawError={effectiveError!}
                      onRetry={() => {
                        // Encontrar el ultimo mensaje del usuario para restaurarlo
                        const msgs = messagesById.get(selectedChatId!);
                        const lastUserMsg = msgs?.slice().reverse().find((m: any) => m.role === "user");
                        if (lastUserMsg?.content) {
                          window.dispatchEvent(new CustomEvent("vibes:restore-chat-input", {
                            detail: { prompt: lastUserMsg.content },
                          }));
                        }
                      }}
                      onNewChat={() => {
                        if (appId) {
                          ipc.chat.createChat(appId).then((newChatId: number) => {
                            window.location.hash = `/chat?id=${newChatId}`;
                          });
                        }
                      }}
                    />
                  ) : (
                    <>
                      <div
                        className={`prose prose-sm dark:prose-invert prose-headings:mb-2 prose-p:my-1 prose-pre:my-0 max-w-none break-words`}
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
                <>
                  <div style={{ position: 'relative' }}>
                  <div
                    ref={userContentRef}
                    className="prose prose-sm dark:prose-invert prose-headings:mb-2 prose-p:my-1 prose-pre:my-0 max-w-none break-words"
                    style={{
                      maxHeight: !isUserExpanded && isUserLongMessage ? `${USER_COLLAPSE_HEIGHT}px` : undefined,
                      overflow: !isUserExpanded && isUserLongMessage ? 'hidden' : undefined,
                      WebkitMaskImage: !isUserExpanded && isUserLongMessage
                        ? 'linear-gradient(to bottom, black calc(100% - 36px), transparent 100%)'
                        : undefined,
                      maskImage: !isUserExpanded && isUserLongMessage
                        ? 'linear-gradient(to bottom, black calc(100% - 36px), transparent 100%)'
                        : undefined,
                    }}
                    suppressHydrationWarning
                  >
                    <UserMessageContent
                      content={message.content}
                      aiMessagesJson={message.aiMessagesJson}
                      hideImages={isUserLongMessage && !isUserExpanded}
                    />
                  </div>
                  </div>
                  {/* Toggle + image count badge for long user messages */}
                  {isUserLongMessage && (
                    <div className="flex items-center gap-2 mt-1.5 not-prose">
                      <button
                        onClick={() => setIsUserExpanded(!isUserExpanded)}
                        className="flex items-center gap-1 text-xs text-primary/60 hover:text-primary transition-colors cursor-pointer"
                      >
                        {isUserExpanded ? (
                          <><ChevronUp size={12} /><span>Ver menos</span></>
                        ) : (
                          <><ChevronDown size={12} /><span>Ver más</span></>
                        )}
                      </button>
                      {!isUserExpanded && userImageCount > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs text-primary/50">
                          <ImageIcon size={12} />
                          <span>{userImageCount}</span>
                        </span>
                      )}
                    </div>
                  )}
                </>
              )}

              {(isAssistant && message.content && !isZenMode) ? (
                <div
                  className="mt-2 flex items-center justify-between text-xs px-1 py-1 -mx-1"
                >
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {message.content && (
                      <>
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
                          {copied ? <Check size={12} className="text-primary" /> : <Copy size={12} />}
                        </button>
                        <button
                          onClick={handleShareMessage}
                          title="Compartir mensaje"
                          className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                          aria-label="Compartir mensaje"
                          disabled={isSharing}
                        >
                          <Share2 size={12} className={isSharing ? "animate-pulse text-primary" : ""} />
                        </button>

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
                      </>
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
                              onClick={message.model === "vibes/git-assistant" ? () => {
                                const theme = localStorage.getItem("theme");
                                const intensity = localStorage.getItem("theme-intensity");
                                ipc.system.openGitWindow({ 
                                  appId: appId!, 
                                  theme: (theme === "light" || theme === "dark" || theme === "system") ? theme : undefined, 
                                  themeIntensity: intensity ? parseFloat(intensity) : undefined 
                                });
                              } : (isStreaming && isLastMessage ? undefined : openDebugMessage)}
                            >
                              {message.model === "vibes/git-assistant" ? (
                                <GitCommit className="h-4 w-4 flex-shrink-0 text-primary" />
                              ) : (
                                <Bot className="h-4 w-4 flex-shrink-0 text-primary" />
                              )}
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
                      {copied ? <Check size={12} className="text-primary" /> : <Copy size={12} />}
                    </button>
                    <button
                      onClick={handleShareMessage}
                      title="Compartir mensaje"
                      className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                      aria-label="Compartir mensaje"
                      disabled={isSharing}
                    >
                      <Share2 size={12} className={isSharing ? "animate-pulse text-primary" : ""} />
                    </button>

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
                              onClick={message.model === "vibes/git-assistant" ? () => {
                                const theme = localStorage.getItem("theme");
                                const intensity = localStorage.getItem("theme-intensity");
                                ipc.system.openGitWindow({ 
                                  appId: appId!, 
                                  theme: (theme === "light" || theme === "dark" || theme === "system") ? theme : undefined, 
                                  themeIntensity: intensity ? parseFloat(intensity) : undefined 
                                });
                              } : (isStreaming && isLastMessage ? undefined : openDebugMessage)}
                            >
                              {message.model === "vibes/git-assistant" ? (
                                <GitCommit className="h-4 w-4 flex-shrink-0 text-primary" />
                              ) : (
                                <Bot className="h-4 w-4 flex-shrink-0 text-primary" />
                              )}
                              <span className="typo-micro">{message.model}</span>
                            </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ) : null}

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
