import React, { useState, useMemo, useCallback, memo, useEffect, useRef } from "react";
import { LanguageBadge } from "./LanguageBadge";
import { useTheme } from "@/contexts/ThemeContext";
import { createPortal } from "react-dom";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useNavigate } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import {
  ChevronRight,
  ChevronDown,
  Loader2,
  Search,
  Plus,
  FolderOpen,
  FolderPlus,
  FolderX,
  X,
  Trash2,
  MoreVertical,
  BellOff,
  Pencil,
  Archive,
  ArchiveRestore,
  GitBranch,
  Pin,
  PinOff,
  Square,
  Database,
  MessageSquare,
  Code,
  Folder,
  Download,
  Share2,
} from "@/components/ui/icons";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { selectedAppIdAtom, appsListAtom } from "@/atoms/appAtoms";
import { sidebarActionAtom } from "@/atoms/uiAtoms";
import { selectedChatIdAtom, recentStreamChatIdsAtom, isStreamingByIdAtom } from "@/atoms/chatAtoms";
import { ipc } from "@/ipc/types";
import { showError, showSuccess } from "@/lib/toast";
import { buildShareMarkdown } from "@/lib/markdown_share_cleaner";
import { useLoadApps } from "@/hooks/useLoadApps";
import { useChats } from "@/hooks/useChats";
import { useCreateApp } from "@/hooks/useCreateApp";
import { useCheckName } from "@/hooks/useCheckName";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { useUncommittedFiles } from "@/hooks/useUncommittedFiles";
import {
  SidebarGroup,
  SidebarGroupContent,
} from "@/components/ui/sidebar";


// --- Preference keys ---
const PREF_EXPANDED_APPS = "sidebar.expandedApps";
const PREF_LAST_SELECTION = "sidebar.lastSelection";
const MAX_PINNED_CHATS = 10;

// --- App chats sub-list (lazy loaded per app) ---
interface AppChatsProps {
  appId: number;
  onChatClick: (appId: number, chatId: number) => void;
  onDeleteChat: (chatId: number, chatTitle: string) => void;
  onRenameChat: (chatId: number, currentTitle: string) => void;
  onArchiveChat: (chatId: number, chatTitle: string) => void;
  onMarkUnread: (chatId: number) => void;
  onPinChat: (chatId: number, appId: number, chatTitle: string) => void;
  onUnpinChat: (chatId: number) => void;
  pinnedChatIds: Set<number>;
  selectedChatId: number | null;
}

const AppChats = memo(function AppChats({
  appId,
  onChatClick,
  onDeleteChat,
  onRenameChat,
  onArchiveChat,
  onMarkUnread,
  onPinChat,
  onUnpinChat,
  pinnedChatIds,
  selectedChatId,
}: AppChatsProps) {
  const { chats, loading } = useChats(appId);
  const recentStreamChatIds = useAtomValue(recentStreamChatIdsAtom);
  const setRecentStreamChatIds = useSetAtom(recentStreamChatIdsAtom);
  const isStreamingById = useAtomValue(isStreamingByIdAtom);

  // A chat is "unread" if it was recently streamed to and user hasn't viewed it
  const isChatUnread = useCallback((chatId: number) => {
    if (selectedChatId === chatId) return false;
    if (recentStreamChatIds.has(chatId)) return true;
    return false;
  }, [selectedChatId, recentStreamChatIds]);

  const handleChatClickAndMarkRead = useCallback((appId: number, chatId: number) => {
    // Clear from recent stream set
    setRecentStreamChatIds((prev) => {
      if (!prev.has(chatId)) return prev;
      const next = new Set(prev);
      next.delete(chatId);
      return next;
    });
    // Mark as read in DB
    ipc.chat.markChatRead(chatId).catch(() => {});
    onChatClick(appId, chatId);
  }, [setRecentStreamChatIds, onChatClick]);

  const queryClient = useQueryClient();

  const [showAll, setShowAll] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);
  const menuBtnRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  const isSubmittingRename = useRef(false);

  const handleRenameSubmit = useCallback(async (chatId: number) => {
    if (isSubmittingRename.current) return;
    const trimmed = renameValue.trim();
    if (!trimmed) { setRenamingId(null); return; }
    isSubmittingRename.current = true;
    try {
      await ipc.chat.renameChat({ chatId, title: trimmed });
      setRenamingId(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.chats.all });
    } catch (e) {
      showError(e);
    } finally {
      isSubmittingRename.current = false;
    }
  }, [renameValue, queryClient]);

  const openMenu = useCallback((chatId: number) => {
    const btn = menuBtnRefs.current.get(chatId);
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const menuHeight = 110; // Approx height of 3 items popup
    let top = rect.bottom + 4;
    if (top + menuHeight > window.innerHeight) {
      top = rect.top - menuHeight - 4;
    }
    setMenuPos({ top, left: rect.right + 8 });
    setOpenMenuId(chatId);
  }, []);

  const closeMenu = useCallback(() => {
    setOpenMenuId(null);
    setMenuPos(null);
  }, []);

  const allSortedChats = useMemo(() => {
    if (!chats) return [];
    return [...chats]
      .filter(c => !pinnedChatIds.has(c.id))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [chats, pinnedChatIds]);

  const sortedChats = showAll ? allSortedChats : allSortedChats.slice(0, 5);

  if (loading) {
    return (
      <div className="pl-6 py-2">
        <div className="flex items-center gap-2 typo-micro opacity-60">
          <Loader2 size={12} className="animate-spin" />
          <span>Cargando...</span>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="pl-8 flex flex-col gap-1 py-1.5">
      {sortedChats.length === 0 ? (
        <div className="px-2 py-1.5 typo-micro opacity-50">
          Sin chats
        </div>
      ) : (
        <>
          {sortedChats.map((chat) => {
            const unread = isChatUnread(chat.id);
            const streaming = isStreamingById.get(chat.id) ?? false;
            const isMenuOpen = openMenuId === chat.id;
            const isRenaming = renamingId === chat.id;
            return (
              <div
                key={chat.id}
                className={`group/chat-row relative flex items-center rounded-xl transition-colors hover:bg-sidebar-accent/60 ${
                  isMenuOpen ? "bg-sidebar-accent/60" : ""
                }`}
              >
                {isRenaming ? (
                  <form
                    className="flex-1 px-2 py-1"
                    onSubmit={(e) => { e.preventDefault(); handleRenameSubmit(chat.id); }}
                  >
                    <input
                      ref={renameInputRef}
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => handleRenameSubmit(chat.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          e.preventDefault();
                          setRenamingId(null);
                        } else if (e.key === "Enter") {
                          // Prevent blur from double-firing after Enter submit
                          e.preventDefault();
                          handleRenameSubmit(chat.id);
                        }
                      }}
                      autoFocus
                      className="w-full bg-sidebar-accent/60 border border-primary/30 rounded-xl px-2 py-0.5 text-sm outline-none focus:border-primary"
                    />
                  </form>
                ) : (
                  <button
                    type="button"
                    className={`flex items-center gap-2 px-3 py-2 typo-menu-subitem rounded-xl cursor-pointer text-left w-full min-w-0 ${
                      selectedChatId === chat.id
                        ? "text-primary font-medium"
                        : "text-foreground/80"
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleChatClickAndMarkRead(appId, chat.id);
                    }}
                  >
                    <div className="flex items-center min-w-0 flex-1 gap-1.5">
                      {streaming ? (
                        <Loader2 size={12} className="animate-spin text-primary shrink-0" />
                      ) : unread ? (
                        <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0 animate-pulse" />
                      ) : null}
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className={`truncate ${unread ? "font-semibold" : ""}`}>{chat.title || "Nuevo chat"}</span>
                        <span className="typo-micro opacity-60 mt-0.5">
                          {formatDistanceToNow(new Date(chat.createdAt), {
                            addSuffix: false,
                            locale: es,
                          })}
                        </span>
                      </div>
                    </div>
                  </button>
                )}

                {/* Gradient + quick actions + 3-dot menu */}
                {!isRenaming && (
                  <>
                    <div
                      className={`absolute right-0 top-0 bottom-0 w-48 pointer-events-none transition-opacity z-10 rounded-r-md ${isMenuOpen ? "opacity-100" : "opacity-0 group-hover/chat-row:opacity-100"}`}
                      style={{ background: "linear-gradient(to left, var(--sidebar-accent) 55%, transparent)" }}
                    />
                    {/* Pin/Unpin quick action */}
                    <button
                      type="button"
                      className={`absolute right-[4.25rem] top-1/2 -translate-y-1/2 z-20 p-1.5 rounded-md hover:bg-sidebar-accent/80 text-foreground/75 hover:text-foreground transition-all cursor-pointer ${isMenuOpen ? "opacity-100" : "opacity-0 group-hover/chat-row:opacity-100"}`}
                      title={pinnedChatIds.has(chat.id) ? "Desfijar" : "Fijar"}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (pinnedChatIds.has(chat.id)) {
                          onUnpinChat(chat.id);
                        } else {
                          onPinChat(chat.id, appId, chat.title || "Nuevo chat");
                        }
                      }}
                    >
                      {pinnedChatIds.has(chat.id) ? <PinOff size={15} /> : <Pin size={15} />}
                    </button>
                    {/* Archive quick action */}
                    <button
                      type="button"
                      className={`absolute right-9 top-1/2 -translate-y-1/2 z-20 p-1.5 rounded-md hover:bg-sidebar-accent/80 text-foreground/75 hover:text-foreground transition-all cursor-pointer ${isMenuOpen ? "opacity-100" : "opacity-0 group-hover/chat-row:opacity-100"}`}
                      title="Archivar"
                      onClick={(e) => {
                        e.stopPropagation();
                        onArchiveChat(chat.id, chat.title || "Nuevo chat");
                      }}
                    >
                      <Archive size={15} />
                    </button>
                    {/* 3-dot menu */}
                    <button
                      ref={(el) => { if (el) menuBtnRefs.current.set(chat.id, el); else menuBtnRefs.current.delete(chat.id); }}
                      type="button"
                      className={`absolute right-1 top-1/2 -translate-y-1/2 z-20 p-1.5 rounded-md hover:bg-sidebar-accent/80 text-foreground/75 hover:text-foreground transition-all cursor-pointer ${isMenuOpen ? "opacity-100 bg-sidebar-accent/80 text-foreground" : "opacity-0 group-hover/chat-row:opacity-100"}`}
                      title="Opciones"
                      onClick={(e) => {
                        e.stopPropagation();
                        isMenuOpen ? closeMenu() : openMenu(chat.id);
                      }}
                    >
                      <MoreVertical size={15} />
                    </button>
                  </>
                )}
              </div>
            );
          })}
          {allSortedChats.length > 5 && (
            <button
              type="button"
              className="px-2 py-1 typo-micro opacity-60 hover:text-primary transition-colors cursor-pointer text-left"
              onClick={(e) => {
                e.stopPropagation();
                setShowAll(prev => !prev);
              }}
            >
              {showAll ? "Ver menos" : `Ver todos (${allSortedChats.length})`}
            </button>
          )}
        </>
      )}
    </div>

    {/* Portal dropdown — rendered at body level to escape sidebar overflow */}
    {openMenuId !== null && menuPos !== null && createPortal(
      <>
        <div className="fixed inset-0 z-[998]" onClick={closeMenu} />
        <div
          className="fixed z-[999] min-w-[192px] bg-popover border border-border rounded-lg shadow-xl py-1 overflow-hidden"
          style={{ top: menuPos.top, left: menuPos.left }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 px-2 py-1.5 rounded-sm typo-dropdown hover:bg-sidebar-accent hover:text-accent-foreground transition-colors cursor-pointer whitespace-nowrap"
            onClick={() => {
              const chatId = openMenuId;
              closeMenu();
              if (pinnedChatIds.has(chatId)) {
                onUnpinChat(chatId);
              } else {
                const chat = sortedChats.find(c => c.id === chatId);
                if (chat) onPinChat(chat.id, appId, chat.title || "Nuevo chat");
              }
            }}
          >
            {pinnedChatIds.has(openMenuId) ? (
              <><PinOff size={14} className="opacity-60 shrink-0" /> Desfijar</>
            ) : (
              <><Pin size={14} className="opacity-60 shrink-0" /> Fijar</>
            )}
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-2 py-1.5 rounded-sm typo-dropdown hover:bg-sidebar-accent hover:text-accent-foreground transition-colors cursor-pointer whitespace-nowrap"
            onClick={() => { closeMenu(); onMarkUnread(openMenuId); }}
          >
            <BellOff size={14} className="opacity-60 shrink-0" />
            Marcar como no leído
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-2 py-1.5 rounded-sm typo-dropdown hover:bg-sidebar-accent hover:text-accent-foreground transition-colors cursor-pointer whitespace-nowrap"
            onClick={() => {
              const chat = sortedChats.find(c => c.id === openMenuId);
              closeMenu();
              if (chat) {
                setRenamingId(chat.id);
                setRenameValue(chat.title || "");
                setTimeout(() => renameInputRef.current?.focus(), 50);
              }
            }}
          >
            <Pencil size={14} className="opacity-60 shrink-0" />
            Renombrar
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-2 py-1.5 rounded-sm typo-dropdown hover:bg-sidebar-accent hover:text-accent-foreground transition-colors cursor-pointer whitespace-nowrap"
            onClick={async () => {
              const chatId = openMenuId;
              const chat = sortedChats.find(c => c.id === chatId);
              closeMenu();
              if (!chatId || !chat) return;
              try {
                const fullChat = await ipc.chat.getChat(chatId);
                const markdown = buildShareMarkdown(
                  fullChat.title || "Chat sin título",
                  fullChat.messages,
                );
                const result = await ipc.markdownShare.uploadDocument({
                  title: fullChat.title || "Chat sin título",
                  content: markdown,
                  format: "md",
                });
                await navigator.clipboard.writeText(result.data.share_url);
                showSuccess("URL copiada al portapapeles");
              } catch (e) {
                showError(e);
              }
            }}
          >
            <Share2 size={14} className="opacity-60 shrink-0" />
            Compartir markdown
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-2 py-1.5 rounded-sm typo-dropdown hover:bg-destructive/10 text-destructive transition-colors cursor-pointer whitespace-nowrap"
            onClick={() => {
              const chat = sortedChats.find(c => c.id === openMenuId);
              closeMenu();
              if (chat) onDeleteChat(chat.id, chat.title || "Nuevo chat");
            }}
          >
            <Trash2 size={14} className="shrink-0" />
            Eliminar
          </button>
        </div>
      </>,
      document.body
    )}
  </>
  );
});

// --- App Git Data Hook ---
function useAppGitStatus(appId: number) {
  const { hasUncommittedFiles } = useUncommittedFiles(appId);
  const { data: gitState } = useQuery({
    queryKey: ["git-state", appId],
    queryFn: async () => {
      try {
        return await ipc.github.getGitState({ appId });
      } catch {
        return null;
      }
    },
    refetchInterval: 10000,
  });

  const hasUnpushedChanges = hasUncommittedFiles || (gitState?.ahead ?? 0) > 0;
  return { hasUnpushedChanges };
}

// --- App Server Status Hook ---
function useAppServerStatus(appId: number) {
  const { data } = useQuery({
    queryKey: ["server-status", appId],
    queryFn: async () => {
      try {
        return await ipc.app.getAppRunningStatus({ appId });
      } catch {
        return { status: "stopped" as const, url: undefined };
      }
    },
    refetchInterval: 3000,
  });

  const isServerRunning = data?.status === "running";
  return { isServerRunning };
}

// --- App Git Dot Indicator ---
const SidebarGitDot = memo(function SidebarGitDot({ appId }: { appId: number }) {
  const { hasUnpushedChanges } = useAppGitStatus(appId);

  if (!hasUnpushedChanges) return null;

  return (
    <GitBranch className="w-3.5 h-3.5 text-muted-foreground animate-pulse shrink-0 ml-1.5" />
  );
});

// --- App Server Running Indicator ---
const SidebarServerDot = memo(function SidebarServerDot({ appId }: { appId: number }) {
  const { isServerRunning } = useAppServerStatus(appId);

  if (!isServerRunning) return null;

  return (
    <span
      className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 ml-1 animate-pulse"
      style={{ boxShadow: "0 0 6px 1px rgba(16,185,129,0.45)" }}
      title="Servidor activo"
    />
  );
});

// --- Collapsible App Item ---
interface WorkspaceAppItemProps {
  app: { id: number; name: string; createdAt: string; primaryLanguage?: string | null };
  isExpanded: boolean;
  onToggle: (appId: number) => void;
  onChatClick: (appId: number, chatId: number) => void;
  onDeleteChat: (chatId: number, chatTitle: string) => void;
  onRenameChat: (chatId: number, currentTitle: string) => void;
  onArchiveChat: (chatId: number, chatTitle: string) => void;
  onRenameApp: (appId: number, appName: string) => void;
  onMarkUnread: (chatId: number) => void;
  onPinChat: (chatId: number, appId: number, chatTitle: string) => void;
  onUnpinChat: (chatId: number) => void;
  pinnedChatIds: Set<number>;
  onNewChat: (appId: number) => void;
  onCloseApp: (appId: number, appName: string) => void;
  onOpenGit: (appId: number) => void;
  onOpenCode: (appId: number) => void;
  onStopServer: (appId: number) => void;
  onArchiveApp: (appId: number, appName: string) => void;
  selectedChatId: number | null;
  selectedAppId: number | null;
}

const WorkspaceAppItem = memo(function WorkspaceAppItem({
  app,
  isExpanded,
  onToggle,
  onChatClick,
  onDeleteChat,
  onRenameChat,
  onArchiveChat,
  onRenameApp,
  onMarkUnread,
  onPinChat,
  onUnpinChat,
  pinnedChatIds,
  onNewChat,
  onCloseApp,
  onOpenGit,
  onOpenCode,
  onStopServer,
  onArchiveApp,
  selectedChatId,
  selectedAppId,
}: WorkspaceAppItemProps) {
  const isActive = selectedAppId === app.id && (!selectedChatId || !pinnedChatIds.has(selectedChatId));
  const { hasUnpushedChanges } = useAppGitStatus(app.id);
  const { isServerRunning } = useAppServerStatus(app.id);
  const { theme, intensity } = useTheme();
  const queryClient = useQueryClient();

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const [subMenuOpen, setSubMenuOpen] = useState<"chat" | "workspace" | "codigo" | null>(null);

  const [archivePanelOpen, setArchivePanelOpen] = useState(false);
  const [archivePanelPos, setArchivePanelPos] = useState<{ top: number; left: number } | null>(null);
  const [archivedChats, setArchivedChats] = useState<Array<{ id: number; title: string | null; createdAt: Date }>>([]);
  const [loadingArchived, setLoadingArchived] = useState(false);
  const [unarchivingId, setUnarchivingId] = useState<number | null>(null);

  const openMenu = useCallback(() => {
    const btn = menuBtnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const menuHeight = 130; // Approx height of 3 category items
    let top = rect.bottom + 4;
    if (top + menuHeight > window.innerHeight) {
      top = rect.top - menuHeight - 4;
    }
    setMenuPos({ top, left: rect.right + 8 });
    setMenuOpen(true);
  }, []);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    setMenuPos(null);
    setSubMenuOpen(null);
  }, []);

  const loadAndShowArchived = useCallback(async () => {
    closeMenu();
    const btn = menuBtnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    setArchivePanelPos({ top: rect.bottom + 4, left: rect.right + 8 });
    setArchivePanelOpen(true);
    setLoadingArchived(true);
    try {
      const result = await ipc.chat.getArchivedChats(app.id);
      setArchivedChats(result as any);
    } catch (e) {
      showError(e);
    } finally {
      setLoadingArchived(false);
    }
  }, [app.id, closeMenu]);

  const handleUnarchive = useCallback(async (chatId: number) => {
    setUnarchivingId(chatId);
    try {
      await ipc.chat.archiveChat({ chatId, archived: false });
      setArchivedChats(prev => prev.filter(c => c.id !== chatId));
      queryClient.invalidateQueries({ queryKey: queryKeys.chats.all });
    } catch (e) {
      showError(e);
    } finally {
      setUnarchivingId(null);
    }
  }, [queryClient]);

  return (
    <>
    <div className="mb-3">
      <div className={`group/app-row relative flex items-center rounded-xl transition-all duration-150 ${
        isActive ? "bg-primary/8" : "hover:bg-sidebar-accent/60"
      } ${menuOpen ? "bg-sidebar-accent/60" : ""}`}>
        <button
          type="button"
          className={`flex items-center gap-2.5 flex-1 min-w-0 px-3 py-2 cursor-pointer text-left ${
            isActive ? "text-primary" : ""
          }`}
          onClick={() => onToggle(app.id)}
        >
          {isExpanded ? (
            <ChevronDown size={13} className="text-muted-foreground/70 shrink-0" />
          ) : (
            <ChevronRight size={13} className="text-muted-foreground/70 shrink-0" />
          )}
          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="typo-menu-item truncate leading-tight">
                {app.name}
              </span>
              <LanguageBadge language={app.primaryLanguage} />
              <SidebarServerDot appId={app.id} />
              <SidebarGitDot appId={app.id} />
            </div>
            <span className={`typo-micro mt-0.5 ${isActive ? "opacity-90 text-primary" : "opacity-50 text-foreground"}`}>
              {formatDistanceToNow(new Date(app.createdAt), {
                addSuffix: true,
                locale: es,
              })}
            </span>
          </div>
        </button>

        {/* Gradient fade — theme-aware: uses sidebar-accent for idle, inherits active bg tint */}
        <div
          className={`absolute right-0 top-0 bottom-0 w-32 pointer-events-none transition-opacity z-10 rounded-r-lg ${menuOpen ? "opacity-100" : "opacity-0 group-hover/app-row:opacity-100"}`}
          style={{
            background: isActive
              ? "linear-gradient(to left, hsl(var(--primary) / 0.08), hsl(var(--primary) / 0.08) 40%, transparent)"
              : "linear-gradient(to left, var(--sidebar-accent), var(--sidebar-accent) 40%, transparent)",
          }}
        />

        {/* 3-dot menu button */}
        <button
          ref={menuBtnRef}
          type="button"
          className={`absolute right-1 top-1/2 -translate-y-1/2 z-20 p-1.5 rounded-md hover:bg-sidebar-accent/80 text-foreground/75 hover:text-foreground transition-all cursor-pointer ${menuOpen ? "opacity-100 bg-sidebar-accent/80 text-foreground" : "opacity-0 group-hover/app-row:opacity-100"}`}
          title="Opciones"
          onClick={(e) => { e.stopPropagation(); menuOpen ? closeMenu() : openMenu(); }}
        >
          <MoreVertical size={15} />
        </button>

        {/* Archive button */}
        <button
          type="button"
          className={`absolute right-8 top-1/2 -translate-y-1/2 z-20 p-1.5 rounded-md hover:bg-sidebar-accent/80 text-foreground/75 hover:text-foreground transition-all cursor-pointer ${menuOpen ? "opacity-100" : "opacity-0 group-hover/app-row:opacity-100"}`}
          title="Archivar"
          onClick={(e) => { e.stopPropagation(); onArchiveApp(app.id, app.name); }}
        >
          <Archive size={15} />
        </button>

        {/* New chat (Plus) button */}
        <button
          type="button"
          className={`absolute right-[3.75rem] top-1/2 -translate-y-1/2 z-20 p-1.5 rounded-md hover:bg-sidebar-accent/80 text-foreground/75 hover:text-foreground transition-all cursor-pointer ${menuOpen ? "opacity-100" : "opacity-0 group-hover/app-row:opacity-100"}`}
          title="Nuevo chat"
          onClick={(e) => { e.stopPropagation(); onNewChat(app.id); }}
        >
          <Plus size={15} />
        </button>
      </div>

      {/* Collapsible chats */}
      {isExpanded && (
        <AppChats
          appId={app.id}
          onChatClick={onChatClick}
          onDeleteChat={onDeleteChat}
          onRenameChat={onRenameChat}
          onArchiveChat={onArchiveChat}
          onMarkUnread={onMarkUnread}
          onPinChat={onPinChat}
          onUnpinChat={onUnpinChat}
          pinnedChatIds={pinnedChatIds}
          selectedChatId={selectedChatId}
        />
      )}
    </div>

    {/* App row ⋮ menu portal */}
    {menuOpen && menuPos && createPortal(
      <>
        <div className="fixed inset-0 z-[998]" onClick={closeMenu} />
        <div
          className="fixed z-[999] min-w-[172px] bg-popover border border-border rounded-lg shadow-xl py-1 overflow-visible"
          style={{ top: menuPos.top, left: menuPos.left }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── Chat category ── */}
          <div
            className={`relative flex w-full items-center justify-between gap-2 px-2 py-1.5 rounded-sm typo-dropdown transition-colors cursor-default whitespace-nowrap ${
              subMenuOpen === "chat" ? "bg-sidebar-accent text-accent-foreground" : "hover:bg-sidebar-accent hover:text-accent-foreground"
            }`}
            onMouseEnter={() => setSubMenuOpen("chat")}
          >
            <span className="flex items-center gap-2">
              <MessageSquare size={14} className="opacity-60 shrink-0" />
              Chat
            </span>
            <ChevronRight size={12} className="opacity-40 shrink-0" />
            {/* Submenu: Chat */}
            {subMenuOpen === "chat" && (
              <div
                className="absolute left-full top-0 ml-1 min-w-[180px] bg-popover border border-border rounded-lg shadow-xl py-1 z-[1000]"
                onMouseEnter={() => setSubMenuOpen("chat")}
              >
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-2 py-1.5 rounded-sm typo-dropdown hover:bg-sidebar-accent hover:text-accent-foreground transition-colors cursor-pointer whitespace-nowrap"
                  onClick={() => { closeMenu(); onNewChat(app.id); }}
                >
                  <Plus size={14} className="opacity-60 shrink-0" />
                  Nuevo chat
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-2 py-1.5 rounded-sm typo-dropdown hover:bg-sidebar-accent hover:text-accent-foreground transition-colors cursor-pointer whitespace-nowrap"
                  onClick={loadAndShowArchived}
                >
                  <Archive size={14} className="opacity-60 shrink-0" />
                  Ver archivados
                </button>
              </div>
            )}
          </div>

          {/* ── Código category ── */}
          <div
            className={`relative flex w-full items-center justify-between gap-2 px-2 py-1.5 rounded-sm typo-dropdown transition-colors cursor-default whitespace-nowrap ${
              subMenuOpen === "codigo" ? "bg-sidebar-accent text-accent-foreground" : "hover:bg-sidebar-accent hover:text-accent-foreground"
            }`}
            onMouseEnter={() => setSubMenuOpen("codigo")}
          >
            <span className="flex items-center gap-2">
              <Code size={14} className="opacity-60 shrink-0" />
              Código
            </span>
            <ChevronRight size={12} className="opacity-40 shrink-0" />
            {/* Submenu: Código */}
            {subMenuOpen === "codigo" && (
              <div
                className="absolute left-full top-0 ml-1 min-w-[180px] bg-popover border border-border rounded-lg shadow-xl py-1 z-[1000]"
                onMouseEnter={() => setSubMenuOpen("codigo")}
              >
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-2 py-1.5 rounded-sm typo-dropdown hover:bg-sidebar-accent hover:text-accent-foreground transition-colors cursor-pointer whitespace-nowrap"
                  onClick={() => { closeMenu(); onOpenCode(app.id); }}
                >
                  <FolderOpen size={14} className="opacity-60 shrink-0" />
                  Explorar código
                </button>
                <button
                    type="button"
                    className="flex w-full items-center gap-2 px-2 py-1.5 rounded-sm typo-dropdown hover:bg-sidebar-accent hover:text-accent-foreground transition-colors cursor-pointer whitespace-nowrap"
                    onClick={() => { closeMenu(); onOpenGit(app.id); }}
                  >
                    <GitBranch size={14} className="opacity-60 shrink-0" />
                    {hasUnpushedChanges ? "Revisar cambios" : "Git"}
                  </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-2 py-1.5 rounded-sm typo-dropdown hover:bg-sidebar-accent hover:text-accent-foreground transition-colors cursor-pointer whitespace-nowrap"
                  onClick={() => { closeMenu(); ipc.system.openMemoryWindow({ appId: app.id, theme, themeIntensity: intensity }); }}
                >
                  <Database size={14} className="opacity-60 shrink-0" />
                  Memorias
                </button>
              </div>
            )}
          </div>

          {/* ── Workspace category ── */}
          <div
            className={`relative flex w-full items-center justify-between gap-2 px-2 py-1.5 rounded-sm typo-dropdown transition-colors cursor-default whitespace-nowrap ${
              subMenuOpen === "workspace" ? "bg-sidebar-accent text-accent-foreground" : "hover:bg-sidebar-accent hover:text-accent-foreground"
            }`}
            onMouseEnter={() => setSubMenuOpen("workspace")}
          >
            <span className="flex items-center gap-2">
              <Folder size={14} className="opacity-60 shrink-0" />
              Workspace
            </span>
            <ChevronRight size={12} className="opacity-40 shrink-0" />
            {/* Submenu: Workspace */}
            {subMenuOpen === "workspace" && (
              <div
                className="absolute left-full top-0 ml-1 min-w-[190px] bg-popover border border-border rounded-lg shadow-xl py-1 z-[1000]"
                onMouseEnter={() => setSubMenuOpen("workspace")}
              >
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-2 py-1.5 rounded-sm typo-dropdown hover:bg-sidebar-accent hover:text-accent-foreground transition-colors cursor-pointer whitespace-nowrap"
                  onClick={() => { closeMenu(); onRenameApp(app.id, app.name); }}
                >
                  <Pencil size={14} className="opacity-60 shrink-0" />
                  Renombrar workspace
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-2 py-1.5 rounded-sm typo-dropdown hover:bg-sidebar-accent hover:text-accent-foreground transition-colors cursor-pointer whitespace-nowrap"
                  onClick={() => { closeMenu(); onArchiveApp(app.id, app.name); }}
                >
                  <Archive size={14} className="opacity-60 shrink-0" />
                  Archivar
                </button>
                <div className="my-1 mx-2 border-t border-border/50" />
                {isServerRunning && (
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-2 py-1.5 rounded-sm typo-dropdown text-destructive hover:bg-destructive/10 transition-colors cursor-pointer whitespace-nowrap"
                    onClick={() => { closeMenu(); onStopServer(app.id); }}
                  >
                    <Square size={14} className="shrink-0" />
                    Detener servidor
                  </button>
                )}
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-2 py-1.5 rounded-sm typo-dropdown text-destructive hover:bg-destructive/10 transition-colors cursor-pointer whitespace-nowrap"
                  onClick={() => { closeMenu(); onCloseApp(app.id, app.name); }}
                >
                  <X size={14} className="shrink-0" />
                  Cerrar workspace
                </button>
              </div>
            )}
          </div>
        </div>
      </>,
      document.body
    )}

    {/* Archived chats panel — centered modal */}
    {archivePanelOpen && createPortal(
      <>
        <div
          className="fixed inset-0 z-[998] bg-black/40 backdrop-blur-sm"
          onClick={() => setArchivePanelOpen(false)}
        />
        <div
          className="fixed z-[999] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] max-w-[90vw] bg-popover border border-border rounded-2xl shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Panel header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-sidebar-accent/30">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <Archive size={15} className="text-primary" />
              </div>
              <div>
                <span className="text-sm font-semibold block">Chats archivados</span>
                <span className="text-xs text-muted-foreground/60">{app.name}</span>
              </div>
            </div>
            <button
              type="button"
              className="p-1.5 rounded-lg hover:bg-sidebar-accent text-muted-foreground/70 hover:text-foreground transition-colors cursor-pointer"
              onClick={() => setArchivePanelOpen(false)}
            >
              <X size={14} />
            </button>
          </div>

          {/* Panel content */}
          <div className="max-h-[420px] overflow-y-auto">
            {loadingArchived ? (
              <div className="flex items-center justify-center gap-2.5 py-12 text-muted-foreground/60">
                <Loader2 size={16} className="animate-spin" />
                <span className="text-sm">Cargando archivados...</span>
              </div>
            ) : archivedChats.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground/50">
                <div className="p-4 rounded-2xl bg-sidebar-accent/40">
                  <Archive size={28} className="opacity-50" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-muted-foreground/70">Sin chats archivados</p>
                  <p className="text-xs mt-0.5 text-muted-foreground/40">Los chats archivados de {app.name} aparecerán aquí</p>
                </div>
              </div>
            ) : (
              <div className="py-2">
                {archivedChats.map((chat) => (
                  <div
                    key={chat.id}
                    className="group/arc flex items-center gap-3 px-5 py-3 hover:bg-sidebar-accent/40 transition-colors"
                  >
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-sm truncate font-medium">{chat.title || "Sin título"}</span>
                      <span className="text-xs text-muted-foreground/55 mt-0.5">
                        Archivado · {formatDistanceToNow(new Date(chat.createdAt), { addSuffix: true, locale: es })}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-sidebar-accent/60 transition-all cursor-pointer opacity-0 group-hover/arc:opacity-100"
                      onClick={() => handleUnarchive(chat.id)}
                      disabled={unarchivingId === chat.id}
                      title="Restaurar"
                    >
                      {unarchivingId === chat.id
                        ? <Loader2 size={15} className="animate-spin" />
                        : <ArchiveRestore size={15} strokeWidth={2} />
                      }
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {archivedChats.length > 0 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-sidebar-accent/20">
              <span className="text-xs text-muted-foreground/50">
                {archivedChats.length} {archivedChats.length !== 1 ? 'chats archivados' : 'chat archivado'}
              </span>
              <span className="text-xs text-muted-foreground/35">Hover para restaurar</span>
            </div>
          )}
        </div>
      </>,
      document.body
    )}
    </>
  );
});

// --- Main WorkspaceList component ---
export function WorkspaceList({ show }: { show?: boolean }) {
  const navigate = useNavigate();
  const { apps, loading, error, refreshApps } = useLoadApps();
  const [selectedAppId, setSelectedAppId] = useAtom(selectedAppIdAtom);
  const [selectedChatId, setSelectedChatId] = useAtom(selectedChatIdAtom);
  const setRecentStreamChatIds = useSetAtom(recentStreamChatIdsAtom);
  const queryClient = useQueryClient();
  const [expandedApps, setExpandedApps] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const loadedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedExpandedRef = useRef<string | null>(null);
  const lastSavedSelectionRef = useRef<string | null>(null);
  const [isOpeningFolder, setIsOpeningFolder] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);

  // Listen for sidebar action triggers from TopNavbar dropdown
  const sidebarAction = useAtomValue(sidebarActionAtom);
  const isStreamingById = useAtomValue(isStreamingByIdAtom);
  const { theme, intensity } = useTheme();

  const handleOpenGit = useCallback((appId: number) => {
    ipc.system.openGitWindow({ appId, theme, themeIntensity: intensity });
  }, [theme, intensity]);

  const handleOpenCode = useCallback((appId: number) => {
    ipc.system.openCodeWindow({ appId, theme, themeIntensity: intensity });
  }, [theme, intensity]);

  const handleStopServer = useCallback(async (appId: number) => {
    try {
      await ipc.app.stopApp({ appId });
      // Force immediate refresh of server status indicator
      queryClient.invalidateQueries({ queryKey: ["server-status", appId] });
    } catch (e) {
      showError(e);
    }
  }, [queryClient]);

  // ── Archived apps state ──
  const [archivedOpen, setArchivedOpen] = useState(false);
  const setApps = useSetAtom(appsListAtom);
  const { data: archivedApps = [] } = useQuery({
    queryKey: ["archived-apps"],
    queryFn: () => ipc.app.getArchivedApps(),
  });
  const [unarchivingId, setUnarchivingId] = useState<number | null>(null);

  const handleArchiveApp = useCallback(async (appId: number, appName: string) => {
    // Optimistic: remove from atom immediately (no flash)
    setApps(prev => prev.filter(a => a.id !== appId));
    if (selectedAppId === appId) {
      setSelectedAppId(null);
      navigate({ to: "/workspace", search: {} });
    }
    try {
      await ipc.app.archiveApp({ appId, archived: true });
      queryClient.invalidateQueries({ queryKey: ["archived-apps"] });
      showSuccess(`"${appName}" archivado`);
    } catch (e) {
      // Rollback on failure
      refreshApps();
      showError(e);
    }
  }, [setApps, selectedAppId, setSelectedAppId, navigate, queryClient, refreshApps]);

  const handleUnarchiveApp = useCallback(async (appId: number) => {
    setUnarchivingId(appId);
    try {
      await ipc.app.archiveApp({ appId, archived: false });
      // Optimistic: move app from archived list back into main atom
      const restored = archivedApps.find(a => a.id === appId);
      if (restored) setApps(prev => [restored, ...prev]);
      queryClient.invalidateQueries({ queryKey: ["archived-apps"] });
    } catch (e) {
      showError(e);
    } finally {
      setUnarchivingId(null);
    }
  }, [setApps, archivedApps, queryClient]);

  // ── Bulk close state ──
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false);
  const [bulkDeleteFiles, setBulkDeleteFiles] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);

  const enterSelectionMode = useCallback(() => {
    setSelectionMode(true);
    setSelectedIds(new Set());
  }, []);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const toggleSelect = useCallback((appId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(appId)) next.delete(appId);
      else next.add(appId);
      return next;
    });
  }, []);

  const selectAllWs = useCallback(() => {
    setSelectedIds(new Set(apps.map((a) => a.id)));
  }, [apps]);

  const deselectAllWs = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleBulkClose = useCallback(() => {
    if (selectedIds.size === 0) return;
    setIsBulkDialogOpen(true);
  }, [selectedIds]);

  const handleConfirmBulkClose = useCallback(async () => {
    if (selectedIds.size === 0) return;
    try {
      setIsBulkDeleting(true);
      setBulkProgress(0);
      const ids = Array.from(selectedIds);
      let completed = 0;
      for (const appId of ids) {
        await ipc.app.deleteApp({ appId, deleteFiles: bulkDeleteFiles });
        completed++;
        setBulkProgress(Math.round((completed / ids.length) * 100));
      }
      setIsBulkDialogOpen(false);
      setSelectionMode(false);
      setSelectedIds(new Set());
      await refreshApps();
      if (selectedAppId !== null && ids.includes(selectedAppId)) {
        setSelectedAppId(null);
        setSelectedChatId(null);
        navigate({ to: "/workspace", search: {} });
      }
    } catch (error) {
      showError(error);
    } finally {
      setIsBulkDeleting(false);
      setBulkDeleteFiles(false);
      setBulkProgress(0);
    }
  }, [selectedIds, bulkDeleteFiles, refreshApps, selectedAppId, setSelectedAppId, setSelectedChatId, navigate]);

  const selectedAppNames = useMemo(
    () => apps.filter((a) => selectedIds.has(a.id)).map((a) => a.name),
    [apps, selectedIds],
  );

  // Empty app dialog state
  const [isEmptyAppDialogOpen, setIsEmptyAppDialogOpen] = useState(false);
  const [emptyAppName, setEmptyAppName] = useState("");
  const [isCreatingEmptyApp, setIsCreatingEmptyApp] = useState(false);
  const { createApp } = useCreateApp();
  const { data: emptyAppNameCheck } = useCheckName(emptyAppName);

  const lastActionRef2 = useRef<number>(0);
  useEffect(() => {
    if (!sidebarAction || sidebarAction.ts === lastActionRef2.current) return;
    lastActionRef2.current = sidebarAction.ts;
    if (sidebarAction.action === "workspace:open-folder") {
      handleOpenFolder();
    } else if (sidebarAction.action === "workspace:new-project") {
      setIsEmptyAppDialogOpen(true);
    } else if (sidebarAction.action === "workspace:search") {
      setSearchVisible(v => !v);
    } else if (sidebarAction.action === "workspace:bulk-close") {
      enterSelectionMode();
    }
  }, [sidebarAction]);

  const handleCreateEmptyApp = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emptyAppName.trim() || emptyAppNameCheck?.exists) return;

    try {
      setIsCreatingEmptyApp(true);
      const result = await createApp({ name: emptyAppName.trim() });

      setSelectedAppId(result.app.id);
      setEmptyAppName("");
      setIsEmptyAppDialogOpen(false);
      await refreshApps();

      // Navigate to workspace using the chat already created by createApp
      queryClient.invalidateQueries({ queryKey: queryKeys.chats.all });
      navigate({ to: "/workspace", search: { appId: result.app.id, chatId: result.chatId } });
    } catch (error) {
      showError(error);
    } finally {
      setIsCreatingEmptyApp(false);
    }
  }, [emptyAppName, emptyAppNameCheck, createApp, setSelectedAppId, refreshApps, navigate, queryClient]);

  // Close app dialog state
  const [isCloseDialogOpen, setIsCloseDialogOpen] = useState(false);
  const [closeAppId, setCloseAppId] = useState<number | null>(null);
  const [closeAppName, setCloseAppName] = useState("");
  const [isClosing, setIsClosing] = useState(false);
  const [deleteFiles, setDeleteFiles] = useState(false);

  // Rename app dialog state
  const [isRenameAppDialogOpen, setIsRenameAppDialogOpen] = useState(false);
  const [renameAppId, setRenameAppId] = useState<number | null>(null);
  const [renameAppName, setRenameAppName] = useState("");
  const [renameAppInputValue, setRenameAppInputValue] = useState("");
  const [isRenamingApp, setIsRenamingApp] = useState(false);

  // Delete chat dialog state
  const [isDeleteChatDialogOpen, setIsDeleteChatDialogOpen] = useState(false);
  const [deleteChatId, setDeleteChatId] = useState<number | null>(null);
  const [deleteChatTitle, setDeleteChatTitle] = useState("");

  // ── Pinned chats state (DB-backed via Bunny) ──
  type PinnedChatRow = { id: number; appId: number; appName: string; title: string | null; createdAt: Date };
  const { data: pinnedChatsRaw = [] } = useQuery<PinnedChatRow[]>({
    queryKey: ["pinned-chats"],
    queryFn: () => ipc.chat.getPinnedChats(),
  });
  const pinnedChats = pinnedChatsRaw;
  const [pinnedSectionOpen, setPinnedSectionOpen] = useState(true);

  const pinnedChatIds = useMemo(() => new Set(pinnedChats.map(p => p.id)), [pinnedChats]);

  // Load expanded apps from DB on mount
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    ipc.misc.getPreference({ key: PREF_EXPANDED_APPS }).then((raw) => {
      if (raw) {
        // Initialize the ref so the save effect knows the DB value
        lastSavedExpandedRef.current = raw;
        try {
          const ids = JSON.parse(raw) as number[];
          setExpandedApps((prev) => {
            const merged = new Set([...prev, ...ids]);
            return merged;
          });
        } catch { /* ignore bad data */ }
      }
    }).catch(() => { /* ignore */ });
  }, []);

  // Debounced save of expandedApps to DB (only if actually changed)
  useEffect(() => {
    // Skip initial empty state before load
    if (!loadedRef.current) return;

    const serialized = JSON.stringify([...expandedApps].sort());
    // Skip write if the value hasn't changed
    if (serialized === lastSavedExpandedRef.current) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      lastSavedExpandedRef.current = serialized;
      ipc.misc.setPreference({
        key: PREF_EXPANDED_APPS,
        value: serialized,
      }).catch(() => { /* ignore */ });
    }, 500);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [expandedApps]);

  // Auto-expand the selected app's group (skip if selected chat is pinned)
  useEffect(() => {
    if (selectedAppId != null && !expandedApps.has(selectedAppId) && !(selectedChatId && pinnedChatIds.has(selectedChatId))) {
      setExpandedApps((prev) => {
        const next = new Set(prev);
        next.add(selectedAppId);
        return next;
      });
    }
  }, [selectedAppId, selectedChatId, pinnedChatIds]);

  // Persist last selection to DB when navigating to a chat (only if changed)
  useEffect(() => {
    if (selectedAppId != null && selectedChatId != null) {
      const serialized = JSON.stringify({ appId: selectedAppId, chatId: selectedChatId });
      if (serialized === lastSavedSelectionRef.current) return;
      lastSavedSelectionRef.current = serialized;
      ipc.misc.setPreference({
        key: PREF_LAST_SELECTION,
        value: serialized,
      }).catch(() => { /* ignore */ });
    }
  }, [selectedAppId, selectedChatId]);

  const handleToggleApp = useCallback((appId: number) => {
    setExpandedApps((prev) => {
      const next = new Set(prev);
      if (next.has(appId)) {
        next.delete(appId);
      } else {
        next.add(appId);
      }
      return next;
    });
  }, []);

  const handleChatClick = useCallback(
    (appId: number, chatId: number) => {
      navigate({
        to: "/workspace",
        search: { appId, chatId },
      });
    },
    [navigate],
  );

  const handleNewChat = useCallback(
    async (appId: number) => {
      try {
        const chatId = await ipc.chat.createChat(appId);
        // Invalidate chat list so sidebar updates immediately
        queryClient.invalidateQueries({ queryKey: queryKeys.chats.all });
        navigate({
          to: "/workspace",
          search: { appId, chatId },
        });
      } catch (error) {
        showError(`Error al crear chat: ${(error as any).toString()}`);
      }
    },
    [navigate, queryClient],
  );

  const handleOpenFolder = useCallback(async () => {
    setIsOpeningFolder(true);
    try {
      let result: { path: string | null; name: string | null };
      try {
        result = await ipc.system.selectAppFolder();
      } catch {
        // Dialog failed or was dismissed — just reset
        return;
      }

      if (!result.path || !result.name) {
        // User cancelled the dialog
        return;
      }

      const folderName = result.name;
      const folderPath = result.path;

      // Check if app already exists
      const nameCheck = await ipc.import.checkAppName({ appName: folderName, skipCopy: true });
      if (nameCheck.exists && nameCheck.existingAppId) {
        // App already registered — navigate directly
        setSelectedAppId(nameCheck.existingAppId);
        const chatId = await ipc.chat.createChat(nameCheck.existingAppId);
        navigate({ to: "/workspace", search: { appId: nameCheck.existingAppId, chatId } });
        showSuccess(`"${folderName}" ya estaba registrada. Abierta directamente.`);
        return;
      }

      // Import directly with skipCopy: true
      const importResult = await ipc.import.importApp({
        path: folderPath,
        appName: folderName,
        skipCopy: true,
      });

      setSelectedAppId(importResult.appId);
      await refreshApps();

      navigate({ to: "/workspace", search: { appId: importResult.appId, chatId: importResult.chatId } });

      showSuccess(`Workspace "${folderName}" abierto con éxito.`);
    } catch (error) {
      showError(`Error al abrir workspace: ${(error as any).toString()}`);
    } finally {
      setIsOpeningFolder(false);
    }
  }, [navigate, refreshApps, setSelectedAppId]);

  const handleCloseAppClick = useCallback((appId: number, appName: string) => {
    setCloseAppId(appId);
    setCloseAppName(appName);
    setIsCloseDialogOpen(true);
  }, []);

  const handleRenameAppClick = useCallback((appId: number, appName: string) => {
    setRenameAppId(appId);
    setRenameAppName(appName);
    setRenameAppInputValue(appName);
    setIsRenameAppDialogOpen(true);
  }, []);

  const handleDeleteChatClick = useCallback((chatId: number, chatTitle: string) => {
    setDeleteChatId(chatId);
    setDeleteChatTitle(chatTitle);
    setIsDeleteChatDialogOpen(true);
  }, []);

  const handleMarkUnread = useCallback(async (chatId: number) => {
    // Add to Jotai atom immediately so the dot appears right away
    setRecentStreamChatIds((prev) => {
      const next = new Set(prev);
      next.add(chatId);
      return next;
    });
    try {
      await ipc.chat.markChatUnread(chatId);
    } catch (e) {
      // Rollback atom on error
      setRecentStreamChatIds((prev) => {
        const next = new Set(prev);
        next.delete(chatId);
        return next;
      });
      showError(e);
    }
  }, [setRecentStreamChatIds]);

  const handleArchiveChatClick = useCallback(async (chatId: number, chatTitle: string) => {
    try {
      await ipc.chat.archiveChat({ chatId, archived: true });
      queryClient.invalidateQueries({ queryKey: queryKeys.chats.all });
      showSuccess(`"${chatTitle}" archivado`);
      // Also unpin if it was pinned
      if (pinnedChatIds.has(chatId)) {
        await ipc.chat.pinChat({ chatId, pinned: false });
        queryClient.invalidateQueries({ queryKey: ["pinned-chats"] });
      }
      if (selectedChatId === chatId) {
        setSelectedChatId(null);
        navigate({ to: "/workspace", search: selectedAppId ? { appId: selectedAppId } : {} });
      }
    } catch (e) {
      showError(e);
    }
  }, [queryClient, selectedChatId, selectedAppId, navigate, pinnedChatIds]);

  const handlePinChat = useCallback(async (chatId: number, _appId: number, _chatTitle: string) => {
    try {
      await ipc.chat.pinChat({ chatId, pinned: true });
      queryClient.invalidateQueries({ queryKey: ["pinned-chats"] });
    } catch (e) {
      showError(e);
    }
  }, [queryClient]);

  const handleUnpinChat = useCallback(async (chatId: number) => {
    try {
      await ipc.chat.pinChat({ chatId, pinned: false });
      queryClient.invalidateQueries({ queryKey: ["pinned-chats"] });
    } catch (e) {
      showError(e);
    }
  }, [queryClient]);

  const handleRenameChatClick = useCallback((_chatId: number, _currentTitle: string) => {
    // Inline rename is handled inside AppChats — this is a no-op pass-through
  }, []);

  const handleConfirmDeleteChat = useCallback(async () => {
    if (deleteChatId === null) return;
    try {
      await ipc.chat.deleteChat(deleteChatId);
      // Invalidate all chat list queries so AppChats re-fetches immediately
      queryClient.invalidateQueries({ queryKey: queryKeys.chats.all });
      showSuccess("Chat eliminado correctamente");

      // If the deleted chat was selected, clear atom and navigate away
      if (selectedChatId === deleteChatId) {
        setSelectedChatId(null);
        // Navigate to workspace without chatId — will show empty state
        navigate({ to: "/workspace", search: selectedAppId ? { appId: selectedAppId } : {} });
      }
    } catch (error) {
      showError(`Error al eliminar el chat: ${(error as any).toString()}`);
    } finally {
      setIsDeleteChatDialogOpen(false);
      setDeleteChatId(null);
      setDeleteChatTitle("");
    }
  }, [deleteChatId, selectedChatId, selectedAppId, navigate]);

  const handleConfirmClose = useCallback(async () => {
    if (closeAppId === null) return;
    try {
      setIsClosing(true);
      await ipc.app.deleteApp({ appId: closeAppId, deleteFiles });
      setIsCloseDialogOpen(false);
      await refreshApps();
      if (selectedAppId === closeAppId) {
        setSelectedAppId(null);
        setSelectedChatId(null);
        navigate({ to: "/workspace", search: {} });
        // Clear persisted selection so workspace doesn't restore a stale app/chat
        ipc.misc.setPreference({ key: PREF_LAST_SELECTION, value: "" }).catch(() => {});
      }
    } catch (error) {
      showError(`Error al cerrar: ${(error as any).toString()}`);
    } finally {
      setIsClosing(false);
      setCloseAppId(null);
      setCloseAppName("");
      setDeleteFiles(false);
    }
  }, [closeAppId, deleteFiles, refreshApps, selectedAppId, setSelectedAppId, setSelectedChatId, navigate]);

  const handleConfirmRenameApp = useCallback(async () => {
    if (renameAppId === null || !renameAppInputValue.trim() || renameAppInputValue === renameAppName) {
      if (renameAppInputValue === renameAppName) {
        setIsRenameAppDialogOpen(false);
      }
      return;
    }
    
    setIsRenamingApp(true);
    try {
      await ipc.app.updateAppName({
        appId: renameAppId,
        appName: renameAppInputValue.trim(),
      });
      await refreshApps();
      showSuccess("Nombre de la aplicación actualizado");
      setIsRenameAppDialogOpen(false);
    } catch (e) {
      showError(`Error al renombrar la app: ${(e as any).toString()}`);
    } finally {
      setIsRenamingApp(false);
    }
  }, [renameAppId, renameAppInputValue, renameAppName, refreshApps]);

  // Filter apps by search
  const filteredApps = useMemo(() => {
    if (!searchQuery.trim()) return apps.filter((a) => a.localPathExists !== false);
    const query = searchQuery.toLowerCase();
    return apps
      .filter((a) => a.localPathExists !== false)
      .filter((a) => a.name.toLowerCase().includes(query));
  }, [apps, searchQuery]);

  if (!show) return null;

  return (
    <>
      <style>{`
        .workspace-search-input {
          width: 100%;
          padding: 6px 10px 6px 32px;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--sidebar);
          color: var(--sidebar-foreground);
          font-size: 14.5px;
          outline: none;
          transition: border-color 0.18s ease;
        }
        .workspace-search-input:focus {
          border-color: var(--primary);
        }
        .workspace-search-input::placeholder {
          /* Color will be inherited from the component's semantic token */
          opacity: 0.5;
        }
        .workspace-open-folder-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          padding: 7px 10px;
          border-radius: 10px;
          border: 1px solid var(--border);
          background: var(--sidebar);
          color: var(--sidebar-foreground);
          font-size: 14.5px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.18s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .workspace-open-folder-btn:hover {
          background: var(--sidebar-accent);
          border-color: var(--border);
          transform: translateY(-0.5px);
          box-shadow: 0 2px 8px -2px rgba(0, 0, 0, 0.08);
        }
        .workspace-open-folder-btn:active {
          transform: scale(0.98);
        }
        .workspace-open-folder-btn svg {
          opacity: 0.55;
          flex-shrink: 0;
          color: var(--primary);
        }
        .workspace-open-folder-btn:hover svg {
          opacity: 0.85;
        }
        .workspace-open-folder-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }

        /* ── Bulk selection toolbar ── */
        .bulk-toolbar {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          background: var(--sidebar);
          border-top: 1px solid var(--border);
          animation: bulk-toolbar-in 0.2s ease-out;
          overflow: hidden;
        }
        @keyframes bulk-toolbar-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .bulk-toolbar-count {
          font-size: 12px;
          font-weight: 600;
          color: var(--primary);
          margin-right: auto;
          white-space: nowrap;
        }
      `}</style>

      <SidebarGroup
        className={`overflow-y-auto overflow-x-hidden ${selectionMode ? "h-[calc(100vh-112px-52px)]" : "h-[calc(100vh-112px)]"}`}
        data-testid="workspace-list-container"
      >
        {/* ── Selection mode header bar ── */}
        {selectionMode && (
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border/60 animate-in fade-in slide-in-from-top-2 duration-200">
            <FolderX size={15} className="text-primary shrink-0" />
            <span className="typo-caption font-semibold text-primary">Seleccionar para cerrar</span>
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                className="typo-micro text-muted-foreground hover:text-primary cursor-pointer transition-colors px-1.5 py-0.5 rounded"
                onClick={selectedIds.size === apps.length ? deselectAllWs : selectAllWs}
              >
                {selectedIds.size === apps.length ? "Ninguno" : "Todos"}
              </button>
              <button
                type="button"
                className="flex items-center justify-center w-6 h-6 rounded-md hover:bg-sidebar-accent cursor-pointer transition-colors"
                onClick={exitSelectionMode}
                title="Cancelar"
              >
                <X size={14} className="text-muted-foreground" />
              </button>
            </div>
          </div>
        )}

        <SidebarGroupContent>
          <div className="flex flex-col gap-3 px-2">

            {/* ── Pinned chats section ── */}
            {pinnedChats.length > 0 && !searchQuery.trim() && (
              <div className="mt-2">
                <div className="flex items-center gap-1.5 px-3 py-1.5 select-none">
                  <span className="text-xs font-medium text-muted-foreground/60 tracking-wide">
                    Conversaciones fijadas
                  </span>
                  <span className="text-[10px] text-muted-foreground/35 ml-auto">
                    {pinnedChats.length}/{MAX_PINNED_CHATS}
                  </span>
                </div>

                <div className="mt-1 pl-5">
                    {pinnedChats.map((pinned) => {
                      const isActive = selectedChatId === pinned.id;
                      const streaming = isStreamingById.get(pinned.id) ?? false;
                      return (
                        <div
                          key={pinned.id}
                          className="group/pin-row relative flex items-center rounded-xl transition-colors hover:bg-sidebar-accent/60"
                        >
                          <button
                            type="button"
                            className={`flex items-center gap-2 px-3 py-2 typo-menu-subitem rounded-xl cursor-pointer text-left w-full min-w-0 ${
                              isActive ? "text-primary font-medium" : "text-foreground/80"
                            }`}
                            onClick={() => {
                              navigate({ to: "/workspace", search: { appId: pinned.appId, chatId: pinned.id } });
                            }}
                          >
                            <div className="flex items-center min-w-0 flex-1 gap-1.5">
                              {streaming && (
                                <Loader2 size={12} className="animate-spin text-primary shrink-0" />
                              )}
                              <div className="flex flex-col min-w-0 flex-1">
                                <span className="truncate">{pinned.title || "Nuevo chat"}</span>
                                <span className="typo-micro opacity-60 mt-0.5 truncate">
                                  {pinned.appName}
                                </span>
                              </div>
                            </div>
                          </button>

                          {/* Gradient + unpin action */}
                          <div className="absolute right-0 top-0 bottom-0 w-20 pointer-events-none transition-opacity z-10 rounded-r-md opacity-0 group-hover/pin-row:opacity-100" style={{ background: "linear-gradient(to left, var(--sidebar-accent) 40%, transparent)" }} />
                          <button
                            type="button"
                            className="absolute right-1 top-1/2 -translate-y-1/2 z-20 p-2 rounded-md hover:bg-sidebar-accent/80 text-foreground/75 hover:text-primary transition-all cursor-pointer opacity-0 group-hover/pin-row:opacity-100"
                            title="Desfijar"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUnpinChat(pinned.id);
                            }}
                          >
                            <PinOff size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
              </div>
            )}

            {/* ── Workspaces section ── */}
            <div className="flex items-center gap-1.5 px-3 py-1.5">
              <span className="text-xs font-medium text-muted-foreground/60 tracking-wide">
                Workspaces
              </span>
            </div>

            {/* Search (toggled via menu) */}
            {searchVisible && (
              <div className="relative px-1">
                <Search
                  size={14}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 typo-input opacity-50"
                />
                <input
                  type="text"
                  className="workspace-search-input typo-input pr-8"
                  placeholder="Buscar workspace..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") { setSearchQuery(""); setSearchVisible(false); } }}
                  autoFocus
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-sidebar-accent/80 text-muted-foreground/50 hover:text-foreground/70 transition-colors cursor-pointer"
                  onClick={() => { setSearchQuery(""); setSearchVisible(false); }}
                  title="Cerrar búsqueda"
                >
                  <X size={13} />
                </button>
              </div>
            )}


            {/* Apps list */}
            {loading ? (
              <div className="py-3 px-2 typo-micro opacity-60 text-center">
                Cargando aplicaciones...
              </div>
            ) : error ? (
              <div className="py-3 px-2 text-xs text-destructive text-center">
                Error al cargar las aplicaciones
              </div>
            ) : filteredApps.length === 0 ? (
              <div className="py-3 px-2 typo-micro opacity-60 text-center">
                {searchQuery ? "Sin resultados" : "No se encontraron aplicaciones"}
              </div>
            ) : (
              <div className="mt-1">
                {filteredApps.map((app) => (
                  <div key={app.id} className="relative">
                    {selectionMode && (
                      <button
                        type="button"
                        className="absolute left-0 top-0 bottom-0 z-30 flex items-center justify-center w-full cursor-pointer bg-transparent hover:bg-primary/5 rounded-xl transition-colors"
                        onClick={() => toggleSelect(app.id)}
                      >
                        <div className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                          selectedIds.has(app.id) ? "bg-primary border-primary" : "border-muted-foreground/40"
                        }`}>
                          {selectedIds.has(app.id) && (
                            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                          )}
                        </div>
                      </button>
                    )}
                    <div className={selectionMode ? "pointer-events-none opacity-75" : ""}>
                      <WorkspaceAppItem
                    app={app}
                    isExpanded={expandedApps.has(app.id)}
                    onToggle={handleToggleApp}
                    onChatClick={handleChatClick}
                    onDeleteChat={handleDeleteChatClick}
                    onRenameChat={handleRenameChatClick}
                    onArchiveChat={handleArchiveChatClick}
                    onRenameApp={handleRenameAppClick}
                    onMarkUnread={handleMarkUnread}
                    onPinChat={handlePinChat}
                    onUnpinChat={handleUnpinChat}
                    pinnedChatIds={pinnedChatIds}
                    onArchiveApp={handleArchiveApp}
                    onNewChat={handleNewChat}
                    onCloseApp={handleCloseAppClick}
                    onOpenGit={handleOpenGit}
                    onOpenCode={handleOpenCode}
                    onStopServer={handleStopServer}
                    selectedChatId={selectedChatId}
                    selectedAppId={selectedAppId}
                  />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

            {/* ── Archived workspaces collapsible ── */}
            <div className="mt-3 px-1">
              <button
                type="button"
                className="flex items-center gap-1.5 px-3 py-1.5 w-full text-xs font-medium text-muted-foreground/60 tracking-wide hover:text-muted-foreground/80 transition-colors cursor-pointer"
                onClick={() => setArchivedOpen(v => !v)}
              >
                {archivedOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <Archive size={12} className="opacity-60" />
                Archivados
                {archivedApps.length > 0 && (
                  <span className="ml-auto text-[10px] text-muted-foreground/40">
                    {archivedApps.length}
                  </span>
                )}
              </button>

              {archivedOpen && (
                <div className="mt-1 pl-2">
                  {archivedApps.length === 0 ? (
                    <div className="py-3 px-2 typo-micro opacity-40 text-center">
                      Sin workspaces archivados
                    </div>
                  ) : (
                    archivedApps.map((app) => (
                      <div
                        key={app.id}
                        className="group/arc flex items-center gap-2.5 pl-6 pr-3 py-2 rounded-xl hover:bg-sidebar-accent/40 transition-colors"
                      >
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="text-sm truncate font-medium text-muted-foreground">{app.name}</span>
                          <span className="text-xs text-muted-foreground/45 mt-0.5">
                            {formatDistanceToNow(new Date(app.createdAt), { addSuffix: true, locale: es })}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-sidebar-accent/60 transition-all cursor-pointer opacity-0 group-hover/arc:opacity-100"
                          onClick={() => handleUnarchiveApp(app.id)}
                          disabled={unarchivingId === app.id}
                          title="Restaurar"
                        >
                          {unarchivingId === app.id
                            ? <Loader2 size={15} className="animate-spin" />
                            : <ArchiveRestore size={15} strokeWidth={2} />
                          }
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

        </SidebarGroupContent>
      </SidebarGroup>

          {/* ── Bulk selection bottom toolbar ── */}
          {selectionMode && (
            <div className="bulk-toolbar">
              <span className="bulk-toolbar-count">
                {selectedIds.size} seleccionado{selectedIds.size !== 1 ? "s" : ""}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={exitSelectionMode}
                className="h-7 text-xs"
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleBulkClose}
                disabled={selectedIds.size === 0}
                className="h-7 text-xs flex items-center gap-1"
              >
                <FolderX size={13} />
                Cerrar ({selectedIds.size})
              </Button>
            </div>
          )}

      {/* Close Folder Confirmation Dialog — portal to escape sidebar overflow */}
      {/* Close workspace dialog */}
      <AlertDialog open={isCloseDialogOpen} onOpenChange={(open) => { if (!open) { setIsCloseDialogOpen(false); setDeleteFiles(false); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cerrar workspace "{closeAppName}"?</AlertDialogTitle>
            <AlertDialogDescription>
              El workspace se desvinculará de Vibes. Los archivos en disco se conservarán.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="ws-delete-files-check"
              checked={deleteFiles}
              onChange={(e) => setDeleteFiles(e.target.checked)}
              disabled={isClosing}
              className="rounded border-border"
            />
            <label htmlFor="ws-delete-files-check" className="typo-caption text-muted-foreground cursor-pointer">
              Eliminar también los archivos del disco
            </label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => { setIsCloseDialogOpen(false); setDeleteFiles(false); }}
              disabled={isClosing}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmClose}
              disabled={isClosing}
              className={deleteFiles ? "bg-destructive text-white hover:bg-destructive/90" : ""}
            >
              {isClosing ? (
                <span className="flex items-center gap-1">
                  <Loader2 size={12} className="animate-spin" />
                  Cerrando...
                </span>
              ) : deleteFiles ? (
                "Eliminar workspace y archivos"
              ) : (
                "Cerrar workspace"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete chat dialog */}
      <AlertDialog open={isDeleteChatDialogOpen} onOpenChange={(open) => { if (!open) setIsDeleteChatDialogOpen(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar chat?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará "{deleteChatTitle}" de forma permanente. Esta acción no se puede deshacer.
              <br /><br />
              <strong>Nota:</strong> Los cambios de código ya aceptados se mantendrán.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setIsDeleteChatDialogOpen(false)}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeleteChat}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Eliminar chat
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rename workspace dialog */}
      <Dialog open={isRenameAppDialogOpen} onOpenChange={(open) => { if (!open) setIsRenameAppDialogOpen(false); }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Renombrar "{renameAppName}"</DialogTitle>
          </DialogHeader>
          <input
            type="text"
            value={renameAppInputValue}
            onChange={(e) => setRenameAppInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleConfirmRenameApp();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setIsRenameAppDialogOpen(false);
              }
            }}
            disabled={isRenamingApp}
            autoFocus
            className="w-full bg-transparent border border-border rounded-md px-3 py-2 typo-input outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="Nuevo nombre del workspace"
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsRenameAppDialogOpen(false)}
              disabled={isRenamingApp}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmRenameApp}
              disabled={isRenamingApp || !renameAppInputValue.trim() || renameAppInputValue === renameAppName}
            >
              {isRenamingApp ? (
                <>
                  <Loader2 size={12} className="animate-spin mr-1.5" />
                  Guardando...
                </>
              ) : (
                "Guardar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create new project dialog */}
      <Dialog open={isEmptyAppDialogOpen} onOpenChange={(open) => { if (!open) { setIsEmptyAppDialogOpen(false); setEmptyAppName(""); } }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Nuevo proyecto</DialogTitle>
          </DialogHeader>
          <p className="typo-caption text-muted-foreground">
            Se creará un proyecto con el scaffold del template seleccionado, listo para usar.
          </p>
          <form onSubmit={handleCreateEmptyApp}>
            <input
              type="text"
              value={emptyAppName}
              onChange={(e) => setEmptyAppName(e.target.value)}
              placeholder="Nombre del proyecto..."
              disabled={isCreatingEmptyApp}
              autoFocus
              className={`w-full mb-2 bg-transparent border rounded-md px-3 py-2 typo-input outline-none focus:ring-2 focus:ring-primary/30 ${
                emptyAppNameCheck?.exists ? "border-destructive" : "border-border"
              }`}
            />
            {emptyAppNameCheck?.exists && (
              <p className="typo-micro text-destructive mb-2">
                Ya existe un proyecto con este nombre
              </p>
            )}
            <DialogFooter className="mt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => { setIsEmptyAppDialogOpen(false); setEmptyAppName(""); }}
                disabled={isCreatingEmptyApp}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={!emptyAppName.trim() || !!emptyAppNameCheck?.exists || isCreatingEmptyApp}
              >
                {isCreatingEmptyApp ? (
                  <>
                    <Loader2 size={12} className="animate-spin mr-1.5" />
                    Creando...
                  </>
                ) : (
                  "Crear proyecto"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Bulk close confirmation dialog ── */}
      <Dialog open={isBulkDialogOpen} onOpenChange={(open) => {
        if (!isBulkDeleting) {
          setIsBulkDialogOpen(open);
          if (!open) setBulkDeleteFiles(false);
        }
      }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>
              ¿Cerrar {selectedIds.size} workspace{selectedIds.size !== 1 ? "s" : ""}?
            </DialogTitle>
          </DialogHeader>
          <p className="typo-caption text-muted-foreground">
            {selectedIds.size === 1
              ? "El workspace se desvinculará de Vibes."
              : `Los ${selectedIds.size} workspaces se desvincularán de Vibes.`}
            {" "}Los archivos en disco se conservarán.
          </p>

          {/* List selected apps */}
          <div className="max-h-[160px] overflow-y-auto bg-muted rounded-lg p-2 my-2">
            {selectedAppNames.map((name) => (
              <div key={name} className="text-sm py-0.5 text-foreground/85">• {name}</div>
            ))}
          </div>

          <div className="flex items-center space-x-2 py-1">
            <input
              type="checkbox"
              id="ws-bulk-delete-files-check"
              checked={bulkDeleteFiles}
              onChange={(e) => setBulkDeleteFiles(e.target.checked)}
              disabled={isBulkDeleting}
              className="rounded border-border"
            />
            <label htmlFor="ws-bulk-delete-files-check" className="typo-caption text-muted-foreground cursor-pointer">
              Eliminar también los archivos del disco
            </label>
          </div>

          {/* Progress bar during deletion */}
          {isBulkDeleting && (
            <div className="h-[3px] bg-muted rounded-sm overflow-hidden mt-2">
              <div
                className="h-full bg-primary rounded-sm transition-[width] duration-300"
                style={{ width: `${bulkProgress}%` }}
              />
            </div>
          )}

          <DialogFooter className="mt-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsBulkDialogOpen(false)}
              disabled={isBulkDeleting}
            >
              Cancelar
            </Button>
            <Button
              variant={bulkDeleteFiles ? "destructive" : "default"}
              onClick={handleConfirmBulkClose}
              disabled={isBulkDeleting}
            >
              {isBulkDeleting ? (
                <>
                  <Loader2 size={12} className="animate-spin mr-1.5" />
                  Cerrando... {bulkProgress}%
                </>
              ) : bulkDeleteFiles ? (
                `Eliminar ${selectedIds.size} workspace${selectedIds.size !== 1 ? "s" : ""} y archivos`
              ) : (
                `Cerrar ${selectedIds.size} workspace${selectedIds.size !== 1 ? "s" : ""}`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
