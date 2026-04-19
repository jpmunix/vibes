import React, { useState, useMemo, useCallback, memo, useEffect, useRef } from "react";
import { useTheme } from "@/contexts/ThemeContext";
import { createPortal } from "react-dom";
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
  X,
  Trash2,
  MoreVertical,
  BellOff,
  Pencil,
  Archive,
  ArchiveRestore,
  GitBranch,
} from "@/components/ui/icons";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { sidebarActionAtom } from "@/atoms/uiAtoms";
import { selectedChatIdAtom, recentStreamChatIdsAtom, isStreamingByIdAtom } from "@/atoms/chatAtoms";
import { ipc } from "@/ipc/types";
import { showError, showSuccess } from "@/lib/toast";
import { useLoadApps } from "@/hooks/useLoadApps";
import { useChats } from "@/hooks/useChats";
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

// --- App chats sub-list (lazy loaded per app) ---
interface AppChatsProps {
  appId: number;
  onChatClick: (appId: number, chatId: number) => void;
  onDeleteChat: (chatId: number, chatTitle: string) => void;
  onRenameChat: (chatId: number, currentTitle: string) => void;
  onArchiveChat: (chatId: number, chatTitle: string) => void;
  onMarkUnread: (chatId: number) => void;
  selectedChatId: number | null;
}

const AppChats = memo(function AppChats({
  appId,
  onChatClick,
  onDeleteChat,
  onRenameChat,
  onArchiveChat,
  onMarkUnread,
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

  const sortedChats = useMemo(() => {
    if (!chats) return [];
    return [...chats]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);
  }, [chats]);

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
                    <div className={`absolute right-0 top-0 bottom-0 w-32 pointer-events-none transition-opacity z-10 rounded-r-md bg-gradient-to-l from-[var(--sidebar-accent)] via-[var(--sidebar-accent)] to-transparent ${isMenuOpen ? "opacity-100" : "opacity-0 group-hover/chat-row:opacity-100"}`} />
                    {/* Archive quick action */}
                    <button
                      type="button"
                      className={`absolute right-9 top-1/2 -translate-y-1/2 z-20 p-2 rounded-md hover:bg-sidebar-accent/80 text-foreground/75 hover:text-foreground transition-all cursor-pointer ${isMenuOpen ? "opacity-100" : "opacity-0 group-hover/chat-row:opacity-100"}`}
                      title="Archivar"
                      onClick={(e) => {
                        e.stopPropagation();
                        onArchiveChat(chat.id, chat.title || "Nuevo chat");
                      }}
                    >
                      <Archive size={16} />
                    </button>
                    {/* 3-dot menu */}
                    <button
                      ref={(el) => { if (el) menuBtnRefs.current.set(chat.id, el); else menuBtnRefs.current.delete(chat.id); }}
                      type="button"
                      className={`absolute right-1 top-1/2 -translate-y-1/2 z-20 p-2 rounded-md hover:bg-sidebar-accent/80 text-foreground/75 hover:text-foreground transition-all cursor-pointer ${isMenuOpen ? "opacity-100 bg-sidebar-accent/80 text-foreground" : "opacity-0 group-hover/chat-row:opacity-100"}`}
                      title="Opciones"
                      onClick={(e) => {
                        e.stopPropagation();
                        isMenuOpen ? closeMenu() : openMenu(chat.id);
                      }}
                    >
                      <MoreVertical size={16} />
                    </button>
                  </>
                )}
              </div>
            );
          })}
          {chats.length > 5 && (
            <button
              type="button"
              className="px-2 py-1 typo-micro opacity-60 hover:text-primary transition-colors cursor-pointer text-left"
              onClick={(e) => {
                e.stopPropagation();
              }}
            >
              Ver todos ({chats.length})
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

// --- App Git Dot Indicator ---
const SidebarGitDot = memo(function SidebarGitDot({ appId }: { appId: number }) {
  const { hasUnpushedChanges } = useAppGitStatus(appId);

  if (!hasUnpushedChanges) return null;

  return (
    <GitBranch className="w-3.5 h-3.5 text-primary animate-pulse shrink-0 ml-1.5" />
  );
});

// --- Collapsible App Item ---
interface WorkspaceAppItemProps {
  app: { id: number; name: string; createdAt: string };
  isExpanded: boolean;
  onToggle: (appId: number) => void;
  onChatClick: (appId: number, chatId: number) => void;
  onDeleteChat: (chatId: number, chatTitle: string) => void;
  onRenameChat: (chatId: number, currentTitle: string) => void;
  onArchiveChat: (chatId: number, chatTitle: string) => void;
  onMarkUnread: (chatId: number) => void;
  onNewChat: (appId: number) => void;
  onCloseApp: (appId: number, appName: string) => void;
  onOpenGit: (appId: number) => void;
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
  onMarkUnread,
  onNewChat,
  onCloseApp,
  onOpenGit,
  selectedChatId,
  selectedAppId,
}: WorkspaceAppItemProps) {
  const isActive = selectedAppId === app.id;
  const { hasUnpushedChanges } = useAppGitStatus(app.id);
  const queryClient = useQueryClient();

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  const [archivePanelOpen, setArchivePanelOpen] = useState(false);
  const [archivePanelPos, setArchivePanelPos] = useState<{ top: number; left: number } | null>(null);
  const [archivedChats, setArchivedChats] = useState<Array<{ id: number; title: string | null; createdAt: Date }>>([]);
  const [loadingArchived, setLoadingArchived] = useState(false);
  const [unarchivingId, setUnarchivingId] = useState<number | null>(null);

  const openMenu = useCallback(() => {
    const btn = menuBtnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const menuHeight = 110; // Approx height of 3 items popup
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

        {/* Gradient fade */}
        <div className={`absolute right-0 top-0 bottom-0 w-24 pointer-events-none transition-opacity z-10 rounded-r-lg bg-gradient-to-l from-[var(--sidebar-accent)] via-[var(--sidebar-accent)] to-transparent ${menuOpen ? "opacity-100" : "opacity-0 group-hover/app-row:opacity-100"}`} />

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

        {/* New chat (Plus) button */}
        <button
          type="button"
          className={`absolute right-8 top-1/2 -translate-y-1/2 z-20 p-1.5 rounded-md hover:bg-sidebar-accent/80 text-foreground/75 hover:text-primary transition-all cursor-pointer ${menuOpen ? "opacity-100" : "opacity-0 group-hover/app-row:opacity-100"}`}
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
          selectedChatId={selectedChatId}
        />
      )}
    </div>

    {/* App row ⋮ menu portal */}
    {menuOpen && menuPos && createPortal(
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
          {hasUnpushedChanges && (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-2 py-1.5 rounded-sm typo-dropdown hover:bg-sidebar-accent hover:text-accent-foreground transition-colors cursor-pointer whitespace-nowrap"
              onClick={() => { closeMenu(); onOpenGit(app.id); }}
            >
              <GitBranch size={14} className="opacity-60 shrink-0" />
              Revisar cambios
            </button>
          )}
          <button
            type="button"
            className="flex w-full items-center gap-2 px-2 py-1.5 rounded-sm typo-dropdown text-destructive hover:bg-destructive/10 transition-colors cursor-pointer whitespace-nowrap"
            onClick={() => { closeMenu(); onCloseApp(app.id, app.name); }}
          >
            <X size={14} className="shrink-0" />
            Cerrar carpeta
          </button>
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
                    <div className="p-1.5 rounded-lg bg-muted/30 shrink-0">
                      <Archive size={12} className="text-muted-foreground/50" />
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-sm truncate font-medium">{chat.title || "Sin título"}</span>
                      <span className="text-xs text-muted-foreground/55 mt-0.5">
                        Archivado · {formatDistanceToNow(new Date(chat.createdAt), { addSuffix: true, locale: es })}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium transition-all cursor-pointer opacity-0 group-hover/arc:opacity-100"
                      onClick={() => handleUnarchive(chat.id)}
                      disabled={unarchivingId === chat.id}
                    >
                      {unarchivingId === chat.id
                        ? <Loader2 size={12} className="animate-spin" />
                        : <ArchiveRestore size={12} />
                      }
                      Restaurar
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

  // Listen for sidebar action triggers from TopNavbar dropdown
  const sidebarAction = useAtomValue(sidebarActionAtom);
  const { theme, intensity } = useTheme();

  const handleOpenGit = useCallback((appId: number) => {
    ipc.system.openGitWindow({ appId, theme, themeIntensity: intensity });
  }, [theme, intensity]);

  const lastActionRef2 = useRef<number>(0);
  useEffect(() => {
    if (!sidebarAction || sidebarAction.ts === lastActionRef2.current) return;
    lastActionRef2.current = sidebarAction.ts;
    if (sidebarAction.action === "workspace:open-folder") {
      handleOpenFolder();
    }
  }, [sidebarAction]);

  // Close app dialog state
  const [isCloseDialogOpen, setIsCloseDialogOpen] = useState(false);
  const [closeAppId, setCloseAppId] = useState<number | null>(null);
  const [closeAppName, setCloseAppName] = useState("");
  const [isClosing, setIsClosing] = useState(false);
  const [deleteFiles, setDeleteFiles] = useState(false);

  // Delete chat dialog state
  const [isDeleteChatDialogOpen, setIsDeleteChatDialogOpen] = useState(false);
  const [deleteChatId, setDeleteChatId] = useState<number | null>(null);
  const [deleteChatTitle, setDeleteChatTitle] = useState("");

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

  // Auto-expand the selected app's group
  useEffect(() => {
    if (selectedAppId != null && !expandedApps.has(selectedAppId)) {
      setExpandedApps((prev) => {
        const next = new Set(prev);
        next.add(selectedAppId);
        return next;
      });
    }
  }, [selectedAppId]);

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

      showSuccess(`Carpeta "${folderName}" abierta con éxito.`);
    } catch (error) {
      showError(`Error al abrir carpeta: ${(error as any).toString()}`);
    } finally {
      setIsOpeningFolder(false);
    }
  }, [navigate, refreshApps, setSelectedAppId]);

  const handleCloseAppClick = useCallback((appId: number, appName: string) => {
    setCloseAppId(appId);
    setCloseAppName(appName);
    setIsCloseDialogOpen(true);
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
      if (selectedChatId === chatId) {
        setSelectedChatId(null);
        navigate({ to: "/workspace", search: selectedAppId ? { appId: selectedAppId } : {} });
      }
    } catch (e) {
      showError(e);
    }
  }, [queryClient, selectedChatId, selectedAppId, navigate]);

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
      }
    } catch (error) {
      showError(`Error al cerrar: ${(error as any).toString()}`);
    } finally {
      setIsClosing(false);
      setCloseAppId(null);
      setCloseAppName("");
      setDeleteFiles(false);
    }
  }, [closeAppId, deleteFiles, refreshApps, selectedAppId, setSelectedAppId]);

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
      `}</style>

      <SidebarGroup
        className="overflow-y-auto h-[calc(100vh-112px)]"
        data-testid="workspace-list-container"
      >
        
        <SidebarGroupContent>
          <div className="flex flex-col gap-3 px-2">

            {/* Search */}
            <div className="relative">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 typo-input opacity-50"
              />
              <input
                type="text"
                className="workspace-search-input typo-input"
                placeholder="Buscar aplicación..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

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
                  <WorkspaceAppItem
                    key={app.id}
                    app={app}
                    isExpanded={expandedApps.has(app.id)}
                    onToggle={handleToggleApp}
                    onChatClick={handleChatClick}
                    onDeleteChat={handleDeleteChatClick}
                    onRenameChat={handleRenameChatClick}
                    onArchiveChat={handleArchiveChatClick}
                    onMarkUnread={handleMarkUnread}
                    onNewChat={handleNewChat}
                    onCloseApp={handleCloseAppClick}
                    onOpenGit={handleOpenGit}
                    selectedChatId={selectedChatId}
                    selectedAppId={selectedAppId}
                  />
                ))}
              </div>
            )}
          </div>
        </SidebarGroupContent>
      </SidebarGroup>

      {/* Close Folder Confirmation Dialog — portal to escape sidebar overflow */}
      {isCloseDialogOpen && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={() => { setIsCloseDialogOpen(false); setDeleteFiles(false); }}
        >
          <div className="fixed inset-0 bg-black/50" />
          <div
            className="relative z-50 w-full max-w-sm rounded-lg border border-border bg-background p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold mb-1">¿Cerrar "{closeAppName}"?</h3>
            <p className="text-xs text-muted-foreground mb-3">
              La aplicación se desvinculará de Vibes. Los archivos en disco NO serán eliminados.
            </p>
            <div className="flex items-center space-x-2 mb-3">
              <input
                type="checkbox"
                id="ws-delete-files-check"
                checked={deleteFiles}
                onChange={(e) => setDeleteFiles(e.target.checked)}
                disabled={isClosing}
                className="rounded border-border"
              />
              <label htmlFor="ws-delete-files-check" className="text-xs text-muted-foreground cursor-pointer">
                También eliminar archivos del disco
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-sidebar-accent transition-colors"
                onClick={() => { setIsCloseDialogOpen(false); setDeleteFiles(false); }}
                disabled={isClosing}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={`px-3 py-1.5 text-xs rounded-md text-white transition-colors ${
                  deleteFiles
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-primary hover:bg-primary/90"
                }`}
                onClick={handleConfirmClose}
                disabled={isClosing}
              >
                {isClosing ? (
                  <span className="flex items-center gap-1">
                    <Loader2 size={12} className="animate-spin" />
                    Cerrando...
                  </span>
                ) : deleteFiles ? (
                  "Cerrar y eliminar archivos"
                ) : (
                  "Cerrar carpeta"
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {/* Delete Chat Confirmation Dialog — portal to escape sidebar overflow */}
      {isDeleteChatDialogOpen && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={() => setIsDeleteChatDialogOpen(false)}
        >
          <div className="fixed inset-0 bg-black/50" />
          <div
            className="relative z-50 w-full max-w-sm rounded-lg border border-border bg-background p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="typo-label mb-1">¿Eliminar chat?</h3>
            <p className="typo-body text-muted-foreground mb-3">
              Se eliminará "{deleteChatTitle}" de forma permanente. Esta acción no se puede deshacer.
              <br /><br />
              <strong>Nota:</strong> Los cambios de código ya aceptados se mantendrán.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="px-3 py-1.5 typo-button rounded-md border border-border hover:bg-sidebar-accent transition-colors"
                onClick={() => setIsDeleteChatDialogOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="px-3 py-1.5 typo-button rounded-md text-white bg-destructive hover:bg-destructive/90 transition-colors"
                onClick={handleConfirmDeleteChat}
              >
                Eliminar chat
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
