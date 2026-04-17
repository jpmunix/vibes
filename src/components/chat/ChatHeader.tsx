
import {
  PanelRightOpen,
  PlusCircle,
  GitBranch,
  Eraser,
  Sparkles,
  Eye,
  Save,
  FileText,
  MoreHorizontal,
  Brain,
  ChevronDown,
  MessageSquare,
  Trash2,
  Pencil,
  PanelLeft,
  Maximize2,
  Minimize2,
  Loader2,
  Coins,
} from "lucide-react";
import { PanelRightClose, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useAtom, useAtomValue } from "jotai";
import { selectedAppIdAtom, previewModeAtom } from "@/atoms/appAtoms";
import { Button } from "../ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../ui/tooltip";
import { ipc } from "@/ipc/types";
import { useRouter } from "@tanstack/react-router";
import { selectedChatIdAtom, isStreamingByIdAtom, recentStreamChatIdsAtom } from "@/atoms/chatAtoms";
import { useChats } from "@/hooks/useChats";
import { showError, showSuccess } from "@/lib/toast";
import { useEffect, useState } from "react";
import ConfirmationDialog from "../ConfirmationDialog";
import { marked } from "marked";
import { useStreamChat } from "@/hooks/useStreamChat";
import { useSummarizeInNewChat } from "./SummarizeInNewChatButton";
import { chatMessagesByIdAtom } from "@/atoms/chatAtoms";
import { useSetAtom } from "jotai";
import { useCurrentBranch } from "@/hooks/useCurrentBranch";
import { useCheckoutVersion } from "@/hooks/useCheckoutVersion";
import { useRenameBranch } from "@/hooks/useRenameBranch";
import { isAnyCheckoutVersionInProgressAtom } from "@/store/appAtoms";
import { LoadingBar } from "../ui/LoadingBar";
import { UncommittedFilesBanner } from "./UncommittedFilesBanner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "../ui/dropdown-menu";
// KnowledgeBaseModal — REMOVED
import { chatPositionAtom } from "@/atoms/uiAtoms";
import { useSettings } from "@/hooks/useSettings";
import { useSessionCost } from "@/hooks/useSessionCost";
import { isPreviewExpandedAtom } from "@/atoms/viewAtoms";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../ui/dialog";

interface ChatHeaderProps {
  isPreviewOpen: boolean;
  onTogglePreview: () => void;
  isLogsOpen?: boolean;
  onToggleLogs?: () => void;
  workspaceMode?: boolean;
}

export function ChatHeader({
  isPreviewOpen,
  onTogglePreview,
  isLogsOpen = false,
  onToggleLogs,
  workspaceMode,
}: ChatHeaderProps) {
  const appId = useAtomValue(selectedAppIdAtom);
  const previewMode = useAtomValue(previewModeAtom);
  const { navigate } = useRouter();
  const [selectedChatId, setSelectedChatId] = useAtom(selectedChatIdAtom);
  const { chats, invalidateChats } = useChats(appId);
  const { isStreaming } = useStreamChat();
  const { settings } = useSettings();
  const setMessagesById = useSetAtom(chatMessagesByIdAtom);
  const isStreamingById = useAtomValue(isStreamingByIdAtom);
  const recentStreamChatIds = useAtomValue(recentStreamChatIdsAtom);
  const { handleSummarize } = useSummarizeInNewChat();
  const isAnyCheckoutVersionInProgress = useAtomValue(
    isAnyCheckoutVersionInProgressAtom,
  );
  const [isGeneratingTitle, setIsGeneratingTitle] = useState(false);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [chatToDelete, setChatToDelete] = useState<{ id: number; title: string } | null>(null);
  const [chatToRename, setChatToRename] = useState<{ id: number; title: string } | null>(null);


  const {
    branchInfo,
    isLoading: branchInfoLoading,
    refetchBranchInfo,
  } = useCurrentBranch(appId);

  const { checkoutVersion, isCheckingOutVersion } = useCheckoutVersion();
  const { renameBranch, isRenamingBranch } = useRenameBranch();
  const [isConfirmEmptyDialogOpen, setIsConfirmEmptyDialogOpen] =
    useState(false);

  const messagesById = useAtomValue(chatMessagesByIdAtom);

  useEffect(() => {
    if (appId) {
      refetchBranchInfo();
    }
  }, [appId, selectedChatId, isStreaming, refetchBranchInfo]);

  const handleCheckoutMainBranch = async () => {
    if (!appId) return;
    // Use the current branch instead of hardcoded "main"
    const currentBranch = branchInfo?.branch || "main";
    await checkoutVersion({ appId, versionId: currentBranch });
  };

  const handleRenameMasterToMain = async () => {
    if (!appId) return;
    // If this throws, it will automatically show an error toast
    await renameBranch({ oldBranchName: "master", newBranchName: "main" });

    showSuccess("Rama master renombrada a main");
  };

  const handleNewChat = async () => {
    if (appId) {
      try {
        const chatId = await ipc.chat.createChat(appId);
        setSelectedChatId(chatId);
        navigate({
          to: "/chat",
          search: { id: chatId },
        });
        await invalidateChats();
      } catch (error) {
        showError(`Error al crear un nuevo chat: ${(error as any).toString()}`);
      }
    } else {
      navigate({ to: "/" });
    }
  };

  const handleEmptyChat = async () => {
    if (!selectedChatId) return;
    try {
      await ipc.chat.deleteMessages(selectedChatId);
      showSuccess("Chat vaciado correctamente");

      // Update local atom to reflect empty messages immediately
      setMessagesById((prev) => {
        const next = new Map(prev);
        next.set(selectedChatId, []);
        return next;
      });

      // Invalidate chats (for title/last message)
      await invalidateChats();

      navigate({
        to: "/chat",
        search: { id: selectedChatId },
      });
    } catch (error) {
      showError(`Error al vaciar el chat: ${(error as any).toString()}`);
    }
    setIsConfirmEmptyDialogOpen(false);
  };

  const handleSaveNote = async () => {
    if (!selectedChatId) return;
    try {
      setIsSavingNote(true);

      // Obtener el chat actual para el título
      const currentChat = chats.find((chat) => chat.id === selectedChatId);
      const chatTitle = currentChat?.title || "Chat sin título";

      // Obtener los mensajes del chat
      const messages = messagesById.get(selectedChatId) || [];
      const chatMarkdown = messages
        .map((msg) => {
          const role = msg.role === "user" ? "**Usuario**" : "**Asistente**";
          return `### ${role}\n\n${msg.content}\n`;
        })
        .join("\n---\n\n");

      // Convertir el markdown a HTML
      const chatContent = (await marked.parse(chatMarkdown)) as string;

      // Crear la nota
      const noteId = await ipc.note.createNote();

      // Actualizar la nota con el título y contenido del chat
      await ipc.note.updateNote({
        noteId,
        title: chatTitle,
        content: chatContent,
      });

      showSuccess("Nota guardada correctamente");
    } catch (error) {
      showError(`Error al guardar la nota: ${(error as any).toString()}`);
    } finally {
      setIsSavingNote(false);
    }
  };

  // Detect if we're browsing versions (detached HEAD is expected in that case)
  const isBrowsingVersions = previewMode === "versions";
  const isDetachedHead = branchInfo?.branch === "<no-branch>";

  // Friendly banner for version browsing (detached HEAD while in versions mode)
  const showVersionBrowsingBanner = isDetachedHead && !isAnyCheckoutVersionInProgress;

  // Only show the real branch warning for genuine issues: master branch (needs rename)
  // Detached HEAD is handled separately above. Normal feature branches should NOT warn.
  const showBranchWarning = !isBrowsingVersions && branchInfo && branchInfo.branch === "master";

  const currentBranchName = branchInfo?.branch;

  const showLoadingBar = isAnyCheckoutVersionInProgress;
  const loadingMessage = isAnyCheckoutVersionInProgress
    ? "Recuperando versión..."
    : undefined;

  return (
    <div className="flex flex-col w-full @container">
      <LoadingBar isVisible={showLoadingBar} message={loadingMessage} />

      {/* Friendly banner when viewing a previous version */}
      {showVersionBrowsingBanner && (
        <div className="flex flex-col @sm:flex-row items-center justify-between px-4 py-2 bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border-b border-sky-200 dark:border-sky-800/50">
          <div className="flex items-center gap-2 text-sm">
            <Eye size={16} className="shrink-0" />
            <span>Estás viendo una versión anterior. Los cambios no se guardarán hasta que restaures o vuelvas al estado actual.</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCheckoutMainBranch}
            disabled={isCheckingOutVersion || branchInfoLoading}
            className="mt-1 @sm:mt-0 shrink-0 border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-900/40"
          >
            {isCheckingOutVersion
              ? "Volviendo..."
              : "Volver al estado actual"}
          </Button>
        </div>
      )}




      {/* Show uncommitted files banner when on a branch and there are uncommitted changes */}
      {/* Hide while streaming to avoid distracting the user */}
      {branchInfo?.branch && !isStreaming && (
        <UncommittedFilesBanner appId={appId} />
      )}

      {/* Why is this pt-0.5? Because the loading bar is h-1 (it always takes space) and we want the vertical spacing to be consistent.*/}
      {!workspaceMode && (
      <div className="@container flex items-center px-1 py-2 border-b border-border no-app-region-drag">
        <div className="flex items-center shrink-0">
          {!workspaceMode && (
            <ExpandChatButton
              isPreviewOpen={isPreviewOpen}
              onTogglePreview={onTogglePreview}
            />
          )}
          <Button
            onClick={handleNewChat}
            variant="ghost"
            className="hidden @2xs:flex items-center justify-start gap-1 mx-1 px-2.5 py-1 text-xs font-medium"
          >
            <PlusCircle size={15} />
            <span>Nuevo chat</span>
          </Button>

          {/* Menú desplegable con las demás opciones */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md"
              >
                <MoreHorizontal size={15} />
                <span className="hidden @xs:inline">Opciones</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[200px]">
              <DropdownMenuItem
                onClick={handleSummarize}
                disabled={!selectedChatId || isStreaming}
              >
                <Sparkles size={16} className="mr-2" />
                Resumir chat
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={async () => {
                  if (!selectedChatId) return;
                  try {
                    console.log(
                      `[ChatHeader] Generating title for chatId=${selectedChatId}`,
                    );
                    setIsGeneratingTitle(true);
                    const result = await ipc.chat.generateChatTitle({
                      chatId: selectedChatId,
                    });
                    console.log(
                      `[ChatHeader] Generated title result:`,
                      result,
                      `for chatId=${selectedChatId}`,
                    );
                    await invalidateChats();
                    console.log(`[ChatHeader] Invalidated chats cache`);
                    showSuccess("Título del chat actualizado");
                  } catch (error) {
                    console.error("Failed to generate chat title:", error);
                    showError("Error al generar el título del chat");
                  } finally {
                    setIsGeneratingTitle(false);
                  }
                }}
                disabled={!selectedChatId || isStreaming || isGeneratingTitle}
              >
                <Sparkles size={16} className="mr-2" />
                Título automático
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleSaveNote}
                disabled={!selectedChatId || isStreaming || isSavingNote}
              >
                <Save size={16} className="mr-2" />
                Guardar nota
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setIsConfirmEmptyDialogOpen(true)}
                disabled={!selectedChatId || isStreaming}
              >
                <Eraser size={16} className="mr-2" />
                Vaciar chat
              </DropdownMenuItem>
              {/* Logs — hidden: logging system retired */}
              {/* Knowledge Base — hidden: retired in agent mode */}
              <ChatPositionToggle />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Session cost badge */}
        <div className="flex-1 flex items-center justify-end pr-1">
          <SessionCostBadge chatId={selectedChatId} />
        </div>

        {/* Chat selector dropdown — adapts to chat title width */}
        <div className="mx-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="flex items-center gap-1 text-sm px-2 py-1 rounded-md"
              >
                <span className="flex items-center gap-2">
                  {(() => {
                    const currentChat = chats.find((c) => c.id === selectedChatId);
                    if (currentChat?.isPlan) {
                      return (
                        <>
                          <Brain size={14} className="text-primary" />
                          <span className="font-semibold text-primary">
                            {currentChat.title || "Planificación"}
                          </span>
                        </>
                      );
                    }
                    return (
                      <>
                        {isStreaming ? (
                          <Loader2 size={14} className="shrink-0 animate-spin text-primary" />
                        ) : (
                          <MessageSquare size={14} className="shrink-0" />
                        )}
                        <span>
                          {currentChat?.title || "Chat"}
                        </span>
                      </>
                    );
                  })()}
                </span>
                <ChevronDown size={14} className="shrink-0 text-muted-foreground/70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-fit min-w-[320px] max-w-[500px] max-h-[400px] overflow-y-auto">
              {chats.length === 0 ? (
                <DropdownMenuItem disabled>
                  <span className="text-muted-foreground text-sm">Sin chats</span>
                </DropdownMenuItem>
              ) : (
                [...chats]
                  .sort((a, b) => {
                    if (a.isPlan && !b.isPlan) return -1;
                    if (!a.isPlan && b.isPlan) return 1;
                    return 0;
                  })
                  .map((chat) => {
                    const chatStreaming = isStreamingById.get(chat.id) ?? false;
                    const chatUnread = selectedChatId !== chat.id && recentStreamChatIds.has(chat.id);
                    return (
                    <DropdownMenuItem
                      key={chat.id}
                      onClick={() => {
                        setSelectedChatId(chat.id);
                        navigate({
                          to: "/chat",
                          search: { id: chat.id },
                        });
                      }}
                      className={`group/chat-item ${selectedChatId === chat.id ? "bg-accent" : ""}`}
                    >
                      {chat.isPlan ? (
                        <>
                          <Brain size={14} className="mr-2 shrink-0 text-primary" />
                          <span className="flex-1 font-semibold text-primary">
                            {chat.title || "Planificación"}
                          </span>
                        </>
                      ) : (
                        <>
                          {chatStreaming ? (
                            <Loader2 size={14} className="mr-2 shrink-0 animate-spin text-primary" />
                          ) : chatUnread ? (
                            <span className="mr-2 shrink-0 flex items-center justify-center w-3.5 h-3.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                            </span>
                          ) : (
                            <MessageSquare size={14} className="mr-2 shrink-0" />
                          )}
                          <span className={`flex-1 ${chatUnread ? "font-semibold" : ""}`}>
                            {chat.title || `Chat ${chat.id}`}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setChatToRename({
                                id: chat.id,
                                title: chat.title || `Chat ${chat.id}`,
                              });
                            }}
                            className="opacity-0 group-hover/chat-item:opacity-100 ml-2 p-1 rounded hover:bg-amber-500/10 hover:text-amber-500 transition-all shrink-0"
                          >
                            <Pencil size={12} className="text-amber-500" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setChatToDelete({
                                id: chat.id,
                                title: chat.title || `Chat ${chat.id}`,
                              });
                            }}
                            className="opacity-0 group-hover/chat-item:opacity-100 p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-all shrink-0"
                          >
                            <Trash2 size={12} className="text-destructive" />
                          </button>
                        </>
                      )}
                    </DropdownMenuItem>
                    );
                  })
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>



      </div>
      )}

      <ConfirmationDialog
        isOpen={isConfirmEmptyDialogOpen}
        title="¿Vaciar chat?"
        message="Esta acción eliminará todos los mensajes de este chat de forma permanente. No se puede deshacer."
        confirmText="Vaciar"
        cancelText="Cancelar"
        confirmButtonClass="bg-amber-600 hover:bg-amber-700 focus:ring-amber-500"
        showOverlay={false}
        onConfirm={handleEmptyChat}
        onCancel={() => setIsConfirmEmptyDialogOpen(false)}
      />

      <ConfirmationDialog
        isOpen={!!chatToDelete}
        title="¿Eliminar chat?"
        message={`Se eliminará el chat "${chatToDelete?.title}" de forma permanente. No se puede deshacer.`}
        confirmText="Eliminar"
        cancelText="Cancelar"
        confirmButtonClass="bg-destructive hover:bg-destructive/90 focus:ring-destructive"
        showOverlay={false}
        onConfirm={async () => {
          if (!chatToDelete) return;
          try {
            await ipc.chat.deleteChat(chatToDelete.id);
            await invalidateChats();
            if (selectedChatId === chatToDelete.id) {
              const remaining = chats.filter((c) => c.id !== chatToDelete.id);
              if (remaining.length > 0) {
                setSelectedChatId(remaining[0].id);
                navigate({ to: "/chat", search: { id: remaining[0].id } });
              } else {
                if (appId) {
                  const newId = await ipc.chat.createChat(appId);
                  setSelectedChatId(newId);
                  navigate({ to: "/chat", search: { id: newId } });
                  await invalidateChats();
                }
              }
            }
            showSuccess("Chat eliminado");
          } catch (error) {
            showError(`Error al eliminar el chat: ${(error as any).toString()}`);
          } finally {
            setChatToDelete(null);
          }
        }}
        onCancel={() => setChatToDelete(null)}
      />

      <Dialog open={!!chatToRename} onOpenChange={(open) => { if (!open) setChatToRename(null); }}>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Renombrar chat</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!chatToRename) return;
              const formData = new FormData(e.currentTarget);
              const newTitle = (formData.get("title") as string).trim();
              if (newTitle && newTitle !== chatToRename.title) {
                try {
                  await ipc.chat.updateChat({ chatId: chatToRename.id, title: newTitle });
                  await invalidateChats();
                  showSuccess("Título actualizado");
                } catch (err) {
                  showError(`Error al renombrar: ${(err as any).toString()}`);
                }
              }
              setChatToRename(null);
            }}
          >
            <input
              name="title"
              autoFocus
              defaultValue={chatToRename?.title || ""}
              className="w-full bg-transparent border border-border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Título del chat"
            />
            <DialogFooter className="mt-4">
              <Button type="button" variant="ghost" onClick={() => setChatToRename(null)}>
                Cancelar
              </Button>
              <Button type="submit">
                Guardar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Session Cost Badge ───────────────────────────────────────────────────────

function SessionCostBadge({ chatId }: { chatId: number | null }) {
  const { totalCostUsd, hasPricing } = useSessionCost(chatId);

  if (!hasPricing) return null;

  // Format as "10,01" style (2 integer digits minimum, 2 decimal minimum, 4 max)
  // We want e.g. $0.17 shown as $0,17 but using the EU comma format:
  // Actually the user wants format like "10,01" (comma as decimal separator)
  const formatted = formatSessionCost(totalCostUsd);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold
            bg-amber-500/10 text-amber-600 dark:text-yellow-400
            border border-amber-400/20 dark:border-yellow-500/20
            transition-all duration-300 select-none cursor-default"
          aria-label={`Gasto total de la sesión: ${formatted}`}
        >
          <Coins size={11} className="shrink-0 opacity-80" />
          <span className="tabular-nums tracking-tight">{formatted}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        Gasto total de esta sesión de trabajo
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Format a USD cost value with a comma as decimal separator.
 * Examples: 0.0174 → "$0,0174", 1.2345 → "$1,23", 10.0073 → "$10,01"
 *
 * Rules:
 * - Always show "$" prefix
 * - Use comma as decimal separator (EU style as requested)
 * - For values < $1: up to 4 significant decimals (strip trailing zeros)
 * - For values >= $1: exactly 2 decimal places
 */
function formatSessionCost(usd: number): string {
  if (usd === 0) return "$0,00";
  if (usd < 0.00005) return "<$0,0001";

  let raw: string;
  if (usd < 1) {
    // Up to 4 decimal places, strip trailing zeros
    raw = usd.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  } else {
    // 2 decimal places
    raw = usd.toFixed(2);
  }

  // Replace dot with comma (EU style)
  return "$" + raw.replace(".", ",");
}

function ChatPositionToggle() {
  const [chatPosition, setChatPosition] = useAtom(chatPositionAtom);
  const { updateSettings } = useSettings();
  const isLeft = chatPosition === "left";

  return (
    <DropdownMenuItem
      onClick={() => {
        const newPosition = isLeft ? "right" : "left";
        setChatPosition(newPosition);
        // The preview is on the opposite side of the chat
        const previewPos = newPosition === "left" ? "right" : "left";
        updateSettings({ previewPosition: previewPos });
      }}
    >
      {isLeft ? (
        <PanelRightOpen size={16} className="mr-2" />
      ) : (
        <PanelLeft size={16} className="mr-2" />
      )}
      {isLeft ? "Chat a la derecha" : "Chat a la izquierda"}
    </DropdownMenuItem>
  );
}

function TogglePreviewInline({
  isPreviewOpen,
  onTogglePreview,
}: {
  isPreviewOpen: boolean;
  onTogglePreview: () => void;
}) {
  const chatPosition = useAtomValue(chatPositionAtom);
  const isLeft = chatPosition === "left";

  // When chat is left → preview is right → use PanelRight icons
  // When chat is right → preview is left → use PanelLeft icons
  const OpenIcon = isLeft ? PanelRightOpen : PanelLeftOpen;
  const CloseIcon = isLeft ? PanelRightClose : PanelLeftClose;

  return (
    <button
      data-testid="toggle-preview-panel-button"
      onClick={onTogglePreview}
      className="cursor-pointer p-2 hover:bg-(--background-lightest) rounded-md ml-auto"
    >
      {isPreviewOpen ? <CloseIcon size={20} /> : <OpenIcon size={20} />}
    </button>
  );
}

function ExpandChatButton({
  isPreviewOpen,
  onTogglePreview,
}: {
  isPreviewOpen: boolean;
  onTogglePreview: () => void;
}) {
  return (
    <button
      onClick={onTogglePreview}
      className="p-1 ml-1 hover:bg-(--background-lightest) rounded-md transition-colors"
      title={isPreviewOpen ? "Maximizar chat" : "Restaurar paneles"}
    >
      {isPreviewOpen ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
    </button>
  );
}

