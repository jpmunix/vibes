/**
 * Admin — List Applications panel.
 * Shows all apps grouped by user, with expandable chats and inline message viewer.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { useSettings } from "@/hooks/useSettings";
import { ipc } from "@/ipc/types";
import type { AdminUser } from "@/ipc/types/admin";
import { LanguageBadge } from "@/components/LanguageBadge";
import {
  Loader2,
  ChevronRight,
  MessageSquare,
  Share2,
  Copy,
  Check,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { buildShareMarkdown } from "@/lib/markdown_share_cleaner";
import {
  VibesMarkdownParser,
  VanillaMarkdownParser,
} from "@/components/chat/VibesMarkdownParser";
import { UserMessageContent } from "@/components/chat/UserMessageContent";
import { format, formatDistanceToNow, type Locale } from "date-fns";
import { useI18n } from "@/lib/i18n";
import { safeDate } from "@/lib/safeDate";

interface AdminApp {
  id: number;
  userId: string;
  name: string;
  path: string;
  createdAt: number;
  updatedAt: number;
  primaryLanguage: string | null;
  projectType: string | null;
  githubOrg: string | null;
  githubRepo: string | null;
  lastMessageAt: number | null;
}

type ViewMode = "completo" | "zen" | "flow";

/** Minimal user info for avatar rendering */
interface UserInfo {
  photoUrl?: string | null;
  displayName?: string;
  email?: string;
}

// ── Chat list per app ───────────────────────────────────────────────────────

interface ChatSummary {
  id: number;
  title: string | null;
  createdAt: string;
  messageCount: number;
}

function AppChats({ appId, user }: { appId: number; user?: UserInfo }) {
  const { dateLocale, t } = useI18n();
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChat, setSelectedChat] = useState<ChatSummary | null>(null);

  useEffect(() => {
    setLoading(true);
    ipc.admin
      .getAppChats({ appId })
      .then(setChats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [appId]);

  if (loading)
    return (
      <div className="flex items-center gap-2 p-4 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="typo-caption">{t("adminApps.loadingChats")}</span>
      </div>
    );
  if (chats.length === 0)
    return (
      <div className="p-4">
        <p className="typo-caption text-muted-foreground">{t("adminApps.noChats")}</p>
      </div>
    );

  return (
    <>
      <div className="space-y-1.5 mt-2">
        {chats.map((chat) => (
          <div
            key={chat.id}
            className="flex items-center gap-3 p-3 rounded-xl border border-border/40 hover:bg-muted/50 transition-colors cursor-pointer"
            onClick={() => setSelectedChat(chat)}
          >
            <MessageSquare className="size-3.5 text-muted-foreground/40 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="typo-label truncate block">
                {chat.title || t("workspace.noTitle")}
              </span>
            </div>
            <span className="typo-micro text-muted-foreground shrink-0">
              {chat.messageCount}{" "}
              {chat.messageCount === 1 ? "mensaje" : "mensajes"}
            </span>
            <span className="typo-micro text-muted-foreground shrink-0">
              {formatDate(chat.createdAt, dateLocale())}
            </span>
            <button
              type="button"
              title={t("adminApps.share")}
              className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer transition-colors shrink-0"
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  const fullChat = await ipc.admin.getAdminChat({
                    chatId: chat.id,
                  });
                  const markdown = buildShareMarkdown(
                    chat.title || t("workspace.noTitle"),
                    fullChat.messages,
                  );
                  const result = await ipc.markdownShare.uploadDocument({
                    title: chat.title || t("workspace.noTitle"),
                    content: markdown,
                    format: "md",
                  });
                  await navigator.clipboard.writeText(result.data.share_url);
                  toast.success(t("adminApps.urlCopied"));
                } catch (err: any) {
                  toast.error(err.message || t("adminApps.shareError"));
                }
              }}
            >
              <Share2 size={13} />
            </button>
          </div>
        ))}
      </div>
      {/* Chat modal */}
      {selectedChat && (
        <ChatModal
          chatId={selectedChat.id}
          title={selectedChat.title || t("workspace.noTitle")}
          user={user}
          onClose={() => setSelectedChat(null)}
        />
      )}
    </>
  );
}

// ── Chat modal (near fullscreen) ────────────────────────────────────────────

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface AdminMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  model?: string | null;
  createdAt?: string | null;
  durationMs?: number | null;
  totalTokens?: number | null;
  /** Raw AI SDK message JSON — contains embedded image URLs (Bunny CDN). */
  aiMessagesJson?: string | null;
}

function ChatModal({
  chatId,
  title,
  user,
  onClose,
}: {
  chatId: number;
  title: string;
  user?: UserInfo;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { settings } = useSettings();
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [loading, setLoading] = useState(true);
  // Default to user's global chatRenderMode — but local-only, never writes back
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const mode = settings?.chatRenderMode;
    if (mode === "zen") return "zen";
    if (mode === "flow") return "flow";
    return "completo"; // "full" or undefined → "completo"
  });

  useEffect(() => {
    setLoading(true);
    ipc.admin
      .getAdminChat({ chatId })
      .then((chat) => setMessages(chat.messages))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [chatId]);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="!max-w-[95vw] !sm:max-w-[95vw] w-full h-[90vh] flex flex-col p-0 gap-0">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b border-border/40 shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="size-4 text-muted-foreground" />
              <span className="truncate">{title}</span>
              {!loading && (
                <span className="typo-caption text-muted-foreground font-normal ml-2">
                  {messages.length} mensajes
                </span>
              )}
            </DialogTitle>
            <div className="flex gap-1 mr-6">
              {(["completo", "zen", "flow"] as ViewMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg typo-body font-medium transition-colors cursor-pointer",
                    viewMode === mode
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted",
                  )}
                >
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </DialogHeader>
        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-8 font-chat">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="typo-caption text-muted-foreground">{t("adminApps.emptyChat")}</p>
            </div>
          ) : (
            <div className="py-4">
              {messages.map((msg) => (
                <AdminMessageRow
                  key={msg.id}
                  message={msg}
                  viewMode={viewMode}
                  user={user}
                />
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Single message — exact clone of ChatMessage layout ──────────────────────

import { SimpleAvatar } from "@/components/ui/SimpleAvatar";
import { VibesAvatar } from "@/components/ui/VibesAvatar";
import { Bot, Clock } from "@/components/ui/icons";

function AdminMessageRow({
  message,
  viewMode,
  user,
}: {
  message: AdminMessage;
  viewMode: ViewMode;
  user?: UserInfo;
}) {
  const isUser = message.role === "user";
  const { dateLocale, t } = useI18n();
  const isAssistant = message.role === "assistant";
  const isZen = viewMode === "zen";
  const forceFullMode = viewMode === "completo";
  const [userCopied, setUserCopied] = useState(false);

  // In zen mode, strip tool blocks from assistant messages
  const zenContent = useMemo(() => {
    if (!isZen || isUser) return message.content;
    return message.content
      .replace(
        /<(vibes-[\w-]+|think|thought|vibes-think)[^>]*>[\s\S]*?<\/\1>/g,
        "",
      )
      .replace(/<\/?[^>]+>/g, "")
      .replace(/[ \t]*\n[ \t]*/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }, [message.content, isZen, isUser]);

  // Copy user message content (hook de portapapeles local al panel admin, sin quote)
  const handleCopyUserMessage = useCallback(async () => {
    let text = message.content ?? "";
    const m1 = text.indexOf("\n\nAttachments:\n");
    if (m1 !== -1) text = text.substring(0, m1);
    const m2 = text.indexOf("\n\nSelected components:\n");
    if (m2 !== -1) text = text.substring(0, m2);
    const m3 = text.indexOf("\n\nFile to upload to codebase:");
    if (m3 !== -1) text = text.substring(0, m3);
    try {
      await navigator.clipboard.writeText(text.trim());
      setUserCopied(true);
      setTimeout(() => setUserCopied(false), 2000);
    } catch {
      toast.error("No se pudo copiar");
    }
  }, [message.content]);

  if (isZen && !isUser && !zenContent) return null;

  const isFixError = isUser && message.content?.startsWith("Fix error:");

  const cardClass = isUser
    ? isFixError
      ? "rounded-xl w-full px-4 py-3 bg-rose-500/8 dark:bg-rose-500/10 border border-rose-400/25"
      : "rounded-xl w-full px-4 py-3 bg-primary/15 dark:bg-primary/15 border border-primary/25 dark:border-primary/20"
    : "w-full";

  const content = isUser ? (
    <UserMessageContent
      content={message.content}
      aiMessagesJson={message.aiMessagesJson ?? null}
    />
  ) : isZen ? (
    <VanillaMarkdownParser content={zenContent!} />
  ) : (
    <VibesMarkdownParser
      content={message.content}
      forceFullMode={forceFullMode}
    />
  );

  return (
    <div className="flex justify-center">
      <div
        className={`mt-4 mb-4 w-full mx-auto group ${
          isUser ? "px-4" : ""
        }`}
      >
        <div className="relative flex flex-col items-stretch w-full">
          {/* User message hover actions (top-right) */}
          {isUser && message.content && (
            <div className="absolute right-4 -top-2 -translate-y-full flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 bg-background border border-border/40 shadow-sm px-2 py-1 rounded-lg z-10">
              <button
                onClick={handleCopyUserMessage}
                title={userCopied ? "¡Copiado!" : "Copiar"}
                className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                aria-label={t("chatActions.copyMessage")}
              >
                {userCopied ? (
                  <Check size={13} className="text-primary" />
                ) : (
                  <Copy size={13} />
                )}
              </button>
            </div>
          )}

          <div className={cardClass}>
            <div className="prose prose-sm dark:prose-invert prose-headings:mb-2 prose-p:my-1 prose-pre:my-0 max-w-none break-words">
              {content}
            </div>
          </div>

          {/* Footer — model + time (assistant only) */}
          {isAssistant && (
            <div className="mt-2 flex items-center gap-2 text-xs px-1">
              {message.model && (
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Bot className="h-4 w-4 flex-shrink-0 text-primary" />
                  <span className="typo-micro">{message.model}</span>
                </div>
              )}
              {message.createdAt && (
                <span className="typo-micro text-muted-foreground flex items-center gap-1">
                  <Clock size={10} />
                  {message.durationMs != null && message.durationMs > 0
                    ? `${formatDuration(message.durationMs)} · ${formatDate(message.createdAt, dateLocale())}`
                    : formatDate(message.createdAt, dateLocale())}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | number, locale: Locale) {
  try {
    const d = new Date(typeof iso === "number" ? iso : iso);
    return format(d, "d MMM, H:mm", { locale });
  } catch {
    return "—";
  }
}
function formatRelativeDate(ts: number | null, locale: Locale) {
  if (!ts) return "—";
  try {
    return formatDistanceToNow(safeDate(ts), { addSuffix: true, locale });
  } catch {
    return "—";
  }
}
function formatDuration(ms: number) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

// ── Main component ──────────────────────────────────────────────────────────

export function AdminListApps() {
  const { dateLocale, t } = useI18n();
  const [apps, setApps] = useState<AdminApp[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [expandedAppId, setExpandedAppId] = useState<number | null>(null);

  const fetchApps = useCallback(async () => {
    setLoading(true);
    try {
      const result = await ipc.admin.listApps({});
      setApps(result.apps);
      setUsers(result.users);
    } catch (err: any) {
      toast.error(err.message || t("adminApps.loadError"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchApps();
  }, [fetchApps]);

  const toggleUser = (userId: string) => {
    setExpandedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
        setExpandedAppId(null);
      } else next.add(userId);
      return next;
    });
  };

  const userMap = new Map<string, AdminUser>();
  for (const u of users) userMap.set(u.id, u);
  const appsByUser = new Map<string, AdminApp[]>();
  for (const app of apps) {
    const list = appsByUser.get(app.userId) ?? [];
    list.push(app);
    appsByUser.set(app.userId, list);
  }
  // Sort apps within each user by lastMessageAt descending (most recent first)
  for (const [, userApps] of appsByUser) {
    userApps.sort((a, b) => (b.lastMessageAt ?? 0) - (a.lastMessageAt ?? 0));
  }
  // Compute per-user latest activity = max lastMessageAt across all their apps
  const userLatestActivity = new Map<string, number>();
  for (const [userId, userApps] of appsByUser) {
    const latest = Math.max(...userApps.map((a) => a.lastMessageAt ?? 0));
    if (latest > 0) userLatestActivity.set(userId, latest);
  }
  // Sort users by most recent activity descending
  const sortedUserIds = [...appsByUser.keys()].sort(
    (a, b) =>
      (userLatestActivity.get(b) ?? 0) - (userLatestActivity.get(a) ?? 0),
  );
  const usersWithoutApps = users.filter((u) => !appsByUser.has(u.id));

  if (loading)
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );

  return (
    <div className="p-8 w-full mx-auto space-y-8">
      <div className="bg-card rounded-2xl shadow-sm p-8 border border-border">
        <div className="mb-8">
          <h2 className="typo-section-title">Aplicaciones</h2>
          <p className="typo-caption mt-1">
            {apps.length} aplicación{apps.length !== 1 ? "es" : ""} registrada
            {apps.length !== 1 ? "s" : ""} en la plataforma
          </p>
        </div>
        <div className="space-y-4">
          {sortedUserIds.map((userId) => {
            const user = userMap.get(userId);
            const userApps = appsByUser.get(userId) ?? [];
            const isExpanded = expandedUsers.has(userId);
            return (
              <div key={userId}>
                <div
                  className="flex items-center justify-between gap-8 p-4 rounded-xl border border-border hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => toggleUser(userId)}
                >
                  <div className="flex-1 min-w-0">
                    <h3 className="typo-label truncate">
                      {user?.displayName ?? userId}
                    </h3>
                    <p className="typo-caption mt-0.5">
                      {userApps.length} aplicación
                      {userApps.length !== 1 ? "es" : ""}
                      {userLatestActivity.has(userId) && (
                        <span className="ml-2 text-muted-foreground/70">
                          · última actividad{" "}
                          {formatRelativeDate(userLatestActivity.get(userId)!, dateLocale())}
                        </span>
                      )}
                    </p>
                  </div>
                  <ChevronRight
                    className={cn(
                      "size-5 text-muted-foreground/50 transition-transform duration-200 shrink-0",
                      isExpanded && "rotate-90",
                    )}
                  />
                </div>
                {isExpanded && (
                  <div className="pl-8 mt-2 space-y-2">
                    {userApps.map((app) => {
                      const isAppOpen = expandedAppId === app.id;
                      return (
                        <div key={app.id}>
                          <div
                            className="flex items-center justify-between gap-8 p-4 rounded-xl border border-border hover:bg-muted/50 transition-colors cursor-pointer"
                            onClick={() =>
                              setExpandedAppId(isAppOpen ? null : app.id)
                            }
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <h4 className="typo-label truncate">
                                  {app.name}
                                </h4>
                                <LanguageBadge language={app.primaryLanguage} />
                              </div>
                              {app.lastMessageAt && (
                                <p className="typo-micro text-muted-foreground mt-0.5">
                                  {formatRelativeDate(app.lastMessageAt, dateLocale())}
                                </p>
                              )}
                            </div>
                            <ChevronRight
                              className={cn(
                                "size-4 text-muted-foreground/50 transition-transform duration-200 shrink-0",
                                isAppOpen && "rotate-90",
                              )}
                            />
                          </div>
                          {isAppOpen && (
                            <div className="pl-4">
                              <AppChats
                                appId={app.id}
                                user={
                                  user
                                    ? {
                                        photoUrl: user.photoUrl,
                                        displayName: user.displayName,
                                        email: user.email,
                                      }
                                    : undefined
                                }
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {usersWithoutApps.length > 0 && (
            <div className="p-4 rounded-xl border border-border/50 opacity-60">
              <p className="typo-label">{t("adminApps.noApps")}</p>
              <p className="typo-caption mt-0.5">
                {usersWithoutApps.map((u) => u.displayName).join(", ")}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
