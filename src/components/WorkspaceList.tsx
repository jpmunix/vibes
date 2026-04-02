import React, { useState, useMemo, useCallback, memo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import {
  ChevronRight,
  ChevronDown,
  Loader2,
  Search,
  PlusCircle,
  FolderOpen,
  X,
  Trash2,
} from "lucide-react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { selectedChatIdAtom, recentStreamChatIdsAtom, isStreamingByIdAtom } from "@/atoms/chatAtoms";
import { ipc } from "@/ipc/types";
import { showError, showSuccess } from "@/lib/toast";
import { useLoadApps } from "@/hooks/useLoadApps";
import { useChats } from "@/hooks/useChats";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
} from "@/components/ui/sidebar";


// --- Preference keys ---
const PREF_EXPANDED_APPS = "sidebar.expandedApps";
const PREF_LAST_SELECTION = "sidebar.lastSelection";

// --- App chats sub-list (lazy loaded per app) ---
interface AppChatsProps {
  appId: number;
  onChatClick: (appId: number, chatId: number) => void;
  onDeleteChat: (chatId: number, chatTitle: string) => void;
  selectedChatId: number | null;
}

const AppChats = memo(function AppChats({
  appId,
  onChatClick,
  onDeleteChat,
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

  const sortedChats = useMemo(() => {
    if (!chats) return [];
    return [...chats]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);
  }, [chats]);

  if (loading) {
    return (
      <div className="pl-6 py-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground/60">
          <Loader2 size={12} className="animate-spin" />
          <span>Cargando...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="pl-4 flex flex-col gap-0.5 py-1">
      {sortedChats.length === 0 ? (
        <div className="px-2 py-1.5 text-xs text-muted-foreground/50">
          Sin chats
        </div>
      ) : (
        <>
          {sortedChats.map((chat) => {
            const unread = isChatUnread(chat.id);
            const streaming = isStreamingById.get(chat.id) ?? false;
            return (
              <div
                key={chat.id}
                className="group/chat-row flex items-center"
              >
                <button
                  type="button"
                  className={`flex items-center gap-2 px-2 py-1.5 text-xs rounded-md transition-colors cursor-pointer text-left flex-1 min-w-0 ${
                    selectedChatId === chat.id
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-foreground/80 hover:bg-sidebar-accent/60"
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
                      <span className="text-[10px] text-muted-foreground/60 mt-0.5">
                        {formatDistanceToNow(new Date(chat.createdAt), {
                          addSuffix: false,
                          locale: es,
                        })}
                      </span>
                    </div>
                  </div>
                </button>
                <button
                  type="button"
                  className="opacity-0 group-hover/chat-row:opacity-100 p-1 rounded-md hover:bg-red-500/10 text-muted-foreground/60 hover:text-red-500 transition-all shrink-0 cursor-pointer"
                  title="Eliminar chat"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteChat(chat.id, chat.title || "Nuevo chat");
                  }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            );
          })}
          {chats.length > 5 && (
            <button
              type="button"
              className="px-2 py-1 text-[10.5px] text-muted-foreground/60 hover:text-primary transition-colors cursor-pointer text-left"
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
  );
});

// --- Collapsible App Item ---
interface WorkspaceAppItemProps {
  app: { id: number; name: string; createdAt: string };
  isExpanded: boolean;
  onToggle: (appId: number) => void;
  onChatClick: (appId: number, chatId: number) => void;
  onDeleteChat: (chatId: number, chatTitle: string) => void;
  onNewChat: (appId: number) => void;
  onCloseApp: (appId: number, appName: string) => void;
  selectedChatId: number | null;
  selectedAppId: number | null;
}

const WorkspaceAppItem = memo(function WorkspaceAppItem({
  app,
  isExpanded,
  onToggle,
  onChatClick,
  onDeleteChat,
  onNewChat,
  onCloseApp,
  selectedChatId,
  selectedAppId,
}: WorkspaceAppItemProps) {
  const isActive = selectedAppId === app.id;

  return (
    <div className="mb-0.5">
      <div className="flex items-center group/app-row">
        <button
          type="button"
          className={`flex items-center gap-2 flex-1 min-w-0 px-2 py-1.5 rounded-lg transition-all duration-150 cursor-pointer text-left ${
            isActive
              ? "bg-primary/8 text-primary"
              : "hover:bg-sidebar-accent/60"
          }`}
          onClick={() => onToggle(app.id)}
        >
          {isExpanded ? (
            <ChevronDown size={13} className="text-muted-foreground/70 shrink-0" />
          ) : (
            <ChevronRight size={13} className="text-muted-foreground/70 shrink-0" />
          )}
          <span
            className={`text-[12.5px] truncate flex-1 ${
              isActive ? "font-semibold" : "font-medium"
            }`}
          >
            {app.name}
          </span>
        </button>
        <button
          type="button"
          className="opacity-0 group-hover/app-row:opacity-100 p-1 rounded-md hover:bg-sidebar-accent/80 text-muted-foreground/60 hover:text-primary transition-all shrink-0 cursor-pointer"
          title="Nuevo chat"
          onClick={(e) => {
            e.stopPropagation();
            onNewChat(app.id);
          }}
        >
          <PlusCircle size={14} />
        </button>
        <button
          type="button"
          className="opacity-0 group-hover/app-row:opacity-100 p-1 rounded-md hover:bg-red-500/10 text-muted-foreground/60 hover:text-red-500 transition-all shrink-0 cursor-pointer"
          title="Cerrar carpeta"
          onClick={(e) => {
            e.stopPropagation();
            onCloseApp(app.id, app.name);
          }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Collapsible chats */}
      {isExpanded && (
        <AppChats
          appId={app.id}
          onChatClick={onChatClick}
          onDeleteChat={onDeleteChat}
          selectedChatId={selectedChatId}
        />
      )}
    </div>
  );
});

// --- Main WorkspaceList component ---
export function WorkspaceList({ show }: { show?: boolean }) {
  const navigate = useNavigate();
  const { apps, loading, error, refreshApps } = useLoadApps();
  const [selectedAppId, setSelectedAppId] = useAtom(selectedAppIdAtom);
  const [selectedChatId, setSelectedChatId] = useAtom(selectedChatIdAtom);
  const queryClient = useQueryClient();
  const [expandedApps, setExpandedApps] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const loadedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedExpandedRef = useRef<string | null>(null);
  const lastSavedSelectionRef = useRef<string | null>(null);
  const [isOpeningFolder, setIsOpeningFolder] = useState(false);

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
          font-size: 12px;
          outline: none;
          transition: border-color 0.18s ease;
        }
        .workspace-search-input:focus {
          border-color: var(--primary);
        }
        .workspace-search-input::placeholder {
          color: var(--muted-foreground);
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
          font-size: 12.5px;
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
        <SidebarGroupLabel>Chats</SidebarGroupLabel>
        <SidebarGroupContent>
          <div className="flex flex-col gap-1.5 px-2">
            {/* Open folder button */}
            <button
              type="button"
              className="workspace-open-folder-btn"
              onClick={handleOpenFolder}
              disabled={isOpeningFolder}
            >
              {isOpeningFolder ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <FolderOpen size={15} />
              )}
              <span>{isOpeningFolder ? "Abriendo..." : "Abrir carpeta"}</span>
            </button>

            {/* Search */}
            <div className="relative">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50"
              />
              <input
                type="text"
                className="workspace-search-input"
                placeholder="Buscar aplicación..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Apps list */}
            {loading ? (
              <div className="py-3 px-2 text-xs text-muted-foreground/60 text-center">
                Cargando aplicaciones...
              </div>
            ) : error ? (
              <div className="py-3 px-2 text-xs text-red-400 text-center">
                Error al cargar las aplicaciones
              </div>
            ) : filteredApps.length === 0 ? (
              <div className="py-3 px-2 text-xs text-muted-foreground/60 text-center">
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
                    onNewChat={handleNewChat}
                    onCloseApp={handleCloseAppClick}
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
            <h3 className="text-sm font-semibold mb-1">¿Eliminar chat?</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Se eliminará "{deleteChatTitle}" de forma permanente. Esta acción no se puede deshacer.
              <br /><br />
              <strong>Nota:</strong> Los cambios de código ya aceptados se mantendrán.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-sidebar-accent transition-colors"
                onClick={() => setIsDeleteChatDialogOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="px-3 py-1.5 text-xs rounded-md text-white bg-red-600 hover:bg-red-700 transition-colors"
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
