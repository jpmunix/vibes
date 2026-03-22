import React, { useState, useMemo, useCallback, memo } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import {
  ChevronRight,
  ChevronDown,
  Loader2,
  Search,
  PlusCircle,
} from "lucide-react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { selectedChatIdAtom, recentStreamChatIdsAtom, isStreamingByIdAtom } from "@/atoms/chatAtoms";
import { ipc } from "@/ipc/types";
import { showError } from "@/lib/toast";
import { useLoadApps } from "@/hooks/useLoadApps";
import { useChats } from "@/hooks/useChats";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
} from "@/components/ui/sidebar";

// --- App chats sub-list (lazy loaded per app) ---
interface AppChatsProps {
  appId: number;
  onChatClick: (appId: number, chatId: number) => void;
  selectedChatId: number | null;
}

const AppChats = memo(function AppChats({
  appId,
  onChatClick,
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
              <button
                type="button"
                key={chat.id}
                className={`flex items-center gap-2 px-2 py-1.5 text-xs rounded-md transition-colors cursor-pointer text-left w-full ${
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
  onNewChat: (appId: number) => void;
  selectedChatId: number | null;
  selectedAppId: number | null;
}

const WorkspaceAppItem = memo(function WorkspaceAppItem({
  app,
  isExpanded,
  onToggle,
  onChatClick,
  onNewChat,
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
      </div>

      {/* Collapsible chats */}
      {isExpanded && (
        <AppChats
          appId={app.id}
          onChatClick={onChatClick}
          selectedChatId={selectedChatId}
        />
      )}
    </div>
  );
});

// --- Main WorkspaceList component ---
export function WorkspaceList({ show }: { show?: boolean }) {
  const navigate = useNavigate();
  const { apps, loading, error } = useLoadApps();
  const [selectedAppId] = useAtom(selectedAppIdAtom);
  const [selectedChatId] = useAtom(selectedChatIdAtom);
  const [expandedApps, setExpandedApps] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");

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
        navigate({
          to: "/workspace",
          search: { appId, chatId },
        });
      } catch (error) {
        showError(`Error al crear chat: ${(error as any).toString()}`);
      }
    },
    [navigate],
  );

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
      `}</style>

      <SidebarGroup
        className="overflow-y-auto h-[calc(100vh-112px)]"
        data-testid="workspace-list-container"
      >
        <SidebarGroupLabel>Chats</SidebarGroupLabel>
        <SidebarGroupContent>
          <div className="flex flex-col gap-1.5 px-2">
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
                    onNewChat={handleNewChat}
                    selectedChatId={selectedChatId}
                    selectedAppId={selectedAppId}
                  />
                ))}
              </div>
            )}
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
    </>
  );
}
