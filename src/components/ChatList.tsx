import React, { useEffect, useState, useMemo, useCallback, startTransition } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";

import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import {
  PlusCircle,
  Trash2,
  Edit3,
  Search,
  FileText,
  Loader2,
  ListChecks,
} from "lucide-react";
import { useAtom, useAtomValue } from "jotai";
import { selectedChatIdAtom } from "@/atoms/chatAtoms";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { ipc } from "@/ipc/types";
import { showError, showSuccess } from "@/lib/toast";
import { useSettings } from "@/hooks/useSettings";
import { getEffectiveDefaultChatMode } from "@/lib/schemas";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuAction,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useChats } from "@/hooks/useChats";
import { RenameChatDialog } from "@/components/chat/RenameChatDialog";
import { DeleteChatDialog } from "@/components/chat/DeleteChatDialog";
import { DailySummaryDialog } from "@/components/chat/DailySummaryDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { ChatSearchDialog } from "./ChatSearchDialog";
import { useSelectChat } from "@/hooks/useSelectChat";
import { isStreamingByIdAtom } from "@/atoms/chatAtoms";
// --- Memoized chat list item ---
interface ChatListItemProps {
  chat: { id: number; appId: number; title: string | null; createdAt: string; isPlan?: boolean };
  isSelected: boolean;
  isStreaming: boolean;
  onChatClick: (params: { chatId: number; appId: number }) => void;
  onRename: (chatId: number, title: string) => void;
  onDelete: (chatId: number, title: string) => void;
}

const ChatListItem = React.memo(function ChatListItem({
  chat,
  isSelected,
  isStreaming,
  onChatClick,
  onRename,
  onDelete,
}: ChatListItemProps) {
  return (
    <SidebarMenuItem className="mb-1">
      <div className="flex ml-2 mr-6 items-center relative group/menu-item">
        <Button
          variant="ghost"
          onClick={() => onChatClick({ chatId: chat.id, appId: chat.appId })}
          className={`justify-start h-11 w-full text-left pr-1 hover:bg-sidebar-accent/80 ${isSelected
            ? "bg-primary/10 text-primary"
            : ""
            }`}
        >
          <div className="flex items-center gap-2 w-full relative overflow-hidden">
            {isStreaming ? (
              <Loader2
                size={16}
                className="text-primary animate-spin flex-shrink-0"
                aria-label="Chat en progreso"
              />
            ) : chat.isPlan ? (
              <div className="flex items-center justify-center h-6 w-6 rounded-md bg-primary/10 flex-shrink-0">
                <ListChecks
                  size={14}
                  className="text-primary"
                  aria-label="Chat de Planificación"
                />
              </div>
            ) : null}
            <div className="flex flex-col w-full overflow-hidden">
              <span
                className={`truncate mr-2 ${isSelected ? "font-semibold" : ""}`}
              >
                {chat.title || "Nuevo chat"}
              </span>
              <span
                className={`text-xs ${isSelected ? "text-primary/70" : "text-muted-foreground"}`}
              >
                {formatDistanceToNow(new Date(chat.createdAt), {
                  addSuffix: true,
                  locale: es,
                })}
              </span>
            </div>
          </div>
        </Button>

        {/* Hover gradient shadow */}
        <div
          className={`absolute right-0 top-0 bottom-0 w-24 pointer-events-none opacity-0 group-hover/menu-item:opacity-100 transition-opacity z-10 
          ${isSelected
              ? "bg-gradient-to-l from-[#f0f4ff] dark:from-[#1e2433] via-[#f0f4ff]/90 dark:via-[#1e2433]/90 to-transparent"
              : "bg-gradient-to-l from-[var(--sidebar-accent)] via-[var(--sidebar-accent)]/90 to-transparent"
            }`}
        />

        <SidebarMenuAction
          showOnHover
          onClick={(e) => {
            e.stopPropagation();
            onRename(chat.id, chat.title || "");
          }}
          className="right-8 z-20"
        >
          <Edit3 className="h-4 w-4" />
        </SidebarMenuAction>
        <SidebarMenuAction
          showOnHover
          onClick={(e) => {
            e.stopPropagation();
            onDelete(chat.id, chat.title || "New Chat");
          }}
          className="right-1 z-20 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
        >
          <Trash2 className="h-4 w-4" />
        </SidebarMenuAction>
      </div>
    </SidebarMenuItem>
  );
});

export function ChatList({ show }: { show?: boolean }) {
  const navigate = useNavigate();
  const [selectedChatId, setSelectedChatId] = useAtom(selectedChatIdAtom);
  const [selectedAppId] = useAtom(selectedAppIdAtom);
  const { settings, updateSettings, envVars } = useSettings();

  const { chats, loading, invalidateChats } = useChats(selectedAppId);
  const routerState = useRouterState();
  const isChatRoute = routerState.location.pathname === "/chat";

  // Rename dialog state
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [renameChatId, setRenameChatId] = useState<number | null>(null);
  const [renameChatTitle, setRenameChatTitle] = useState("");

  // Delete dialog state
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteChatId, setDeleteChatId] = useState<number | null>(null);
  const [deleteChatTitle, setDeleteChatTitle] = useState("");

  // search dialog state
  const [isSearchDialogOpen, setIsSearchDialogOpen] = useState(false);
  const { selectChat } = useSelectChat();
  const isStreamingById = useAtomValue(isStreamingByIdAtom);

  // summary dialog state
  const [isSummaryDialogOpen, setIsSummaryDialogOpen] = useState(false);
  const [dailySummary, setDailySummary] = useState("");
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [selectedAppName, setSelectedAppName] = useState<string>("");

  // delete all chats dialog state
  const [isDeleteAllDialogOpen, setIsDeleteAllDialogOpen] = useState(false);

  // Plan chat identification
  useEffect(() => {
    const handleUpdate = () => {
      invalidateChats();
    };
    window.addEventListener("plan-chat-db-update", handleUpdate);
    return () => window.removeEventListener("plan-chat-db-update", handleUpdate);
  }, [invalidateChats]);

  const sortedChats = useMemo(() => {
    if (!chats) return [];
    return [...chats].sort((a, b) => {
      // Plan chat first
      // Assuming isPlan is boolean. Drizzle might return null if not strictly defined, so coalesce.
      const isPlanA = (a as any).isPlan === true;
      const isPlanB = (b as any).isPlan === true;

      if (isPlanA && !isPlanB) return -1;
      if (!isPlanA && isPlanB) return 1;

      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [chats]);

  // Update selectedChatId when route changes
  useEffect(() => {
    if (isChatRoute) {
      const id = routerState.location.search.id;
      if (id) {
        console.log("Setting selected chat id to", id);
        setSelectedChatId(id);
      }
    }
  }, [isChatRoute, routerState.location.search, setSelectedChatId]);

  // All hooks must be above the early return guard
  const handleChatClick = useCallback(({
    chatId,
    appId,
  }: {
    chatId: number;
    appId: number;
  }) => {
    // Mark chat-switching as a non-urgent transition — the sidebar highlight
    // responds immediately, heavy re-renders (messages, navigation) are deferred.
    startTransition(() => {
      selectChat({ chatId, appId });
    });
    setIsSearchDialogOpen(false);
  }, [selectChat]);

  const handleDeleteChatClick = useCallback((chatId: number, chatTitle: string) => {
    setDeleteChatId(chatId);
    setDeleteChatTitle(chatTitle);
    setIsDeleteDialogOpen(true);
  }, []);

  const handleRenameChat = useCallback((chatId: number, currentTitle: string) => {
    setRenameChatId(chatId);
    setRenameChatTitle(currentTitle);
    setIsRenameDialogOpen(true);
  }, []);

  if (!show) {
    return;
  }

  const handleNewChat = async () => {
    // Only create a new chat if an app is selected
    if (selectedAppId) {
      try {
        // Create a new chat with an empty title for now
        const chatId = await ipc.chat.createChat(selectedAppId);

        // Set the default chat mode for the new chat
        // Only consider quota available if it has finished loading and is not exceeded
        if (settings) {
          const effectiveDefaultMode = getEffectiveDefaultChatMode(settings);
          updateSettings({ selectedChatMode: effectiveDefaultMode });

          if (effectiveDefaultMode === "plan") {
            await ipc.chat.updateChat({ chatId, isPlan: true });
          }
        }

        // Navigate to the new chat
        setSelectedChatId(chatId);
        navigate({
          to: "/chat",
          search: { id: chatId },
        });

        // Refresh the chat list
        await invalidateChats();
      } catch (error) {
        // DO A TOAST
        showError(`Error al crear un nuevo chat: ${(error as any).toString()}`);
      }
    } else {
      // If no app is selected, navigate to home page
      navigate({ to: "/" });
    }
  };

  const handleDeleteChat = async (chatId: number) => {
    try {
      await ipc.chat.deleteChat(chatId);
      showSuccess("Chat eliminado correctamente");

      // If the deleted chat was selected, navigate to home
      if (selectedChatId === chatId) {
        setSelectedChatId(null);
        navigate({ to: "/chat" });
      }

      // Refresh the chat list
      await invalidateChats();
    } catch (error) {
      showError(`Error al eliminar el chat: ${(error as any).toString()}`);
    }
  };

  const handleConfirmDelete = async () => {
    if (deleteChatId !== null) {
      await handleDeleteChat(deleteChatId);
      setIsDeleteDialogOpen(false);
      setDeleteChatId(null);
      setDeleteChatTitle("");
    }
  };

  const handleRenameDialogClose = (open: boolean) => {
    setIsRenameDialogOpen(open);
    if (!open) {
      setRenameChatId(null);
      setRenameChatTitle("");
    }
  };

  const handleDeleteAllChatsClick = () => {
    setIsDeleteAllDialogOpen(true);
  };

  const handleConfirmDeleteAllChats = async () => {
    if (!selectedAppId) {
      showError("No hay una aplicación seleccionada");
      return;
    }

    try {
      await ipc.chat.deleteAllChatsExceptCurrent({
        appId: selectedAppId,
        currentChatId: selectedChatId,
      });
      showSuccess(
        selectedChatId
          ? "Todos los chats excepto el actual han sido eliminados"
          : "Todos los chats han sido eliminados",
      );
      await invalidateChats();
    } catch (error) {
      showError(`Error al eliminar los chats: ${(error as any).toString()}`);
    } finally {
      setIsDeleteAllDialogOpen(false);
    }
  };

  const handleSummarizeToday = async () => {
    if (!selectedAppId) {
      showError("No hay una aplicación seleccionada");
      return;
    }

    try {
      setIsLoadingSummary(true);
      const app = await ipc.app.getApp(selectedAppId);
      setSelectedAppName(app.name);
      const result = await ipc.chat.summarizeTodaysChats(selectedAppId);
      setDailySummary(result.summary);
      setIsSummaryDialogOpen(true);
    } catch (error) {
      showError(`Error al generar el resumen: ${(error as any).toString()}`);
    } finally {
      setIsLoadingSummary(false);
    }
  };

  return (
    <>
      <SidebarGroup
        className="overflow-y-auto h-[calc(100vh-112px)]"
        data-testid="chat-list-container"
      >
        <SidebarGroupLabel>Chats recientes</SidebarGroupLabel>
        <SidebarGroupContent>
          <div className="flex flex-col space-y-4">
            <Button
              onClick={handleNewChat}
              variant="outline"
              className="flex items-center justify-start gap-2 ml-2 mr-6 py-3"
            >
              <PlusCircle size={16} />
              <span>Nuevo chat</span>
            </Button>
            <Button
              onClick={() => setIsSearchDialogOpen(!isSearchDialogOpen)}
              variant="outline"
              className="flex items-center justify-start gap-2 ml-2 mr-6 py-3"
              data-testid="search-chats-button"
            >
              <Search size={16} />
              <span>Buscar chats</span>
            </Button>
            <Button
              onClick={handleDeleteAllChatsClick}
              variant="outline"
              className="flex items-center justify-start gap-2 ml-2 mr-6 py-3"
            >
              <Trash2 size={16} />
              <span>Eliminar chats</span>
            </Button>
            <Button
              onClick={handleSummarizeToday}
              variant="outline"
              className="flex items-center justify-start gap-2 ml-2 mr-6 py-3"
              disabled={isLoadingSummary}
            >
              {isLoadingSummary ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <FileText size={16} />
              )}
              <span>Resumir el trabajo de hoy</span>
            </Button>

            {loading ? (
              <div className="py-3 px-4 text-sm text-muted-foreground">
                Cargando chats...
              </div>
            ) : chats.length === 0 ? (
              <div className="py-3 px-4 text-sm text-muted-foreground">
                No se encontraron chats
              </div>
            ) : (
              <SidebarMenu className="space-y-1">
                {sortedChats.map((chat) => (
                  <ChatListItem
                    key={chat.id}
                    chat={chat}
                    isSelected={selectedChatId === chat.id}
                    isStreaming={isStreamingById.get(chat.id) === true}
                    onChatClick={handleChatClick}
                    onRename={handleRenameChat}
                    onDelete={handleDeleteChatClick}
                  />
                ))}
              </SidebarMenu>
            )}
          </div>
        </SidebarGroupContent>
      </SidebarGroup>

      {/* Rename Chat Dialog */}
      {renameChatId !== null && (
        <RenameChatDialog
          chatId={renameChatId}
          currentTitle={renameChatTitle}
          isOpen={isRenameDialogOpen}
          onOpenChange={handleRenameDialogClose}
          onRename={invalidateChats}
        />
      )}

      {/* Delete Chat Dialog */}
      <DeleteChatDialog
        isOpen={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        onConfirmDelete={handleConfirmDelete}
        chatTitle={deleteChatTitle}
      />

      {/* Chat Search Dialog */}
      <ChatSearchDialog
        open={isSearchDialogOpen}
        onOpenChange={setIsSearchDialogOpen}
        onSelectChat={handleChatClick}
        appId={selectedAppId}
        allChats={chats}
      />

      {/* Daily Summary Dialog */}
      <DailySummaryDialog
        isOpen={isSummaryDialogOpen}
        onOpenChange={setIsSummaryDialogOpen}
        summary={dailySummary}
        appId={selectedAppId}
        appName={selectedAppName}
      />

      {/* Delete All Chats Dialog */}
      <AlertDialog
        open={isDeleteAllDialogOpen}
        onOpenChange={setIsDeleteAllDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar todos los chats?</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedChatId
                ? "Se eliminarán todos los chats excepto el actual. Esta acción no se puede deshacer."
                : "Se eliminarán todos los chats. Esta acción no se puede deshacer."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDeleteAllChats}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
