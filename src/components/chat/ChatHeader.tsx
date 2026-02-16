import {
  PanelRightOpen,
  PlusCircle,
  GitBranch,
  Eraser,
  Sparkles,
  Info,
  Save,
  FileText,
  MoreHorizontal,
  Brain,
  ChevronDown,
  MessageSquare,
} from "lucide-react";
import { PanelRightClose } from "lucide-react";
import { useAtom, useAtomValue } from "jotai";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import { Button } from "../ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import { ipc } from "@/ipc/types";
import { useRouter } from "@tanstack/react-router";
import { selectedChatIdAtom } from "@/atoms/chatAtoms";
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
import { KnowledgeBaseModal } from "../KnowledgeBaseModal";

interface ChatHeaderProps {
  isPreviewOpen: boolean;
  onTogglePreview: () => void;
  isLogsOpen?: boolean;
  onToggleLogs?: () => void;
}

export function ChatHeader({
  isPreviewOpen,
  onTogglePreview,
  isLogsOpen = false,
  onToggleLogs,
}: ChatHeaderProps) {
  const appId = useAtomValue(selectedAppIdAtom);
  const { navigate } = useRouter();
  const [selectedChatId, setSelectedChatId] = useAtom(selectedChatIdAtom);
  const { chats, invalidateChats } = useChats(appId);
  const { isStreaming } = useStreamChat();
  const setMessagesById = useSetAtom(chatMessagesByIdAtom);
  const { handleSummarize } = useSummarizeInNewChat();
  const isAnyCheckoutVersionInProgress = useAtomValue(
    isAnyCheckoutVersionInProgressAtom,
  );
  const [isGeneratingTitle, setIsGeneratingTitle] = useState(false);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isKnowledgeBaseModalOpen, setIsKnowledgeBaseModalOpen] = useState(false);

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
    await checkoutVersion({ appId, versionId: "main" });
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

      // Navegar a la nota creada
      navigate({
        to: "/notes/$noteId",
        params: { noteId: noteId.toString() },
      });
    } catch (error) {
      showError(`Error al guardar la nota: ${(error as any).toString()}`);
    } finally {
      setIsSavingNote(false);
    }
  };

  // Only show branch warning for dangerous cases: detached HEAD or master (to rename)
  // Normal feature branches (feat/*, fix/*, etc.) should NOT show any warning
  const isNotMainBranch = branchInfo && (branchInfo.branch === "<no-branch>" || branchInfo.branch === "master");

  const currentBranchName = branchInfo?.branch;

  const showLoadingBar = isAnyCheckoutVersionInProgress;
  const loadingMessage = isAnyCheckoutVersionInProgress
    ? "Recuperando versión..."
    : undefined;

  return (
    <div className="flex flex-col w-full @container">
      <LoadingBar isVisible={showLoadingBar} message={loadingMessage} />
      {/* Show branch warning when not on main branch */}
      {isNotMainBranch && (
        <div className="flex flex-col @sm:flex-row items-center justify-between px-4 py-2 bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200">
          <div className="flex items-center gap-2 text-sm">
            <GitBranch size={16} />
            <span>
              {currentBranchName === "<no-branch>" && (
                <>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex items-center  gap-1">
                          {isAnyCheckoutVersionInProgress ? (
                            <>
                              <span>
                                Por favor, espera, volviendo a la última
                                versión...
                              </span>
                            </>
                          ) : (
                            <>
                              <strong>Advertencia:</strong>
                              <span>No estás en ninguna rama</span>
                              <Info size={14} />
                            </>
                          )}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>
                          {isAnyCheckoutVersionInProgress
                            ? "La recuperación de la versión está en curso"
                            : "Recupera la rama main, de lo contrario los cambios no se guardarán correctamente"}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </>
              )}
              {currentBranchName && currentBranchName !== "<no-branch>" && (
                <span>
                  Estás en la rama: <strong>{currentBranchName}</strong>.
                </span>
              )}
              {branchInfoLoading && <span>Comprobando rama...</span>}
            </span>
          </div>
          {currentBranchName === "master" ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRenameMasterToMain}
              disabled={isRenamingBranch || branchInfoLoading}
            >
              {isRenamingBranch ? "Renombrando..." : "Renombrar master a main"}
            </Button>
          ) : isAnyCheckoutVersionInProgress && !isCheckingOutVersion ? null : (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCheckoutMainBranch}
              disabled={isCheckingOutVersion || branchInfoLoading}
            >
              {isCheckingOutVersion
                ? "Recuperando..."
                : "Cambiar a la rama main"}
            </Button>
          )}
        </div>
      )}

      {/* Show uncommitted files banner when on a branch and there are uncommitted changes */}
      {/* Hide while streaming to avoid distracting the user */}
      {branchInfo?.branch && !isStreaming && (
        <UncommittedFilesBanner appId={appId} />
      )}

      {/* Why is this pt-0.5? Because the loading bar is h-1 (it always takes space) and we want the vertical spacing to be consistent.*/}
      <div className="@container flex items-center justify-between pb-1.5 pt-0.5">
        <div className="flex items-center space-x-2">
          <Button
            onClick={handleNewChat}
            variant="ghost"
            className="hidden @2xs:flex items-center justify-start gap-2 mx-2 py-3"
          >
            <PlusCircle size={16} />
            <span>Nuevo chat</span>
          </Button>

          {/* Chat selector dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="flex items-center gap-1 text-sm px-2 py-1 rounded-md max-w-[200px]"
              >
                <MessageSquare size={16} className="shrink-0" />
                <span className="truncate hidden @xs:inline">
                  {chats.find((c) => c.id === selectedChatId)?.title || "Chat"}
                </span>
                <ChevronDown size={12} className="shrink-0 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-fit min-w-[320px] max-w-[500px] max-h-[400px] overflow-y-auto">
              {chats.length === 0 ? (
                <DropdownMenuItem disabled>
                  <span className="text-muted-foreground text-sm">Sin chats</span>
                </DropdownMenuItem>
              ) : (
                chats.map((chat) => (
                  <DropdownMenuItem
                    key={chat.id}
                    onClick={() => {
                      setSelectedChatId(chat.id);
                      navigate({
                        to: "/chat",
                        search: { id: chat.id },
                      });
                    }}
                    className={selectedChatId === chat.id ? "bg-accent" : ""}
                  >
                    <MessageSquare size={14} className="mr-2 shrink-0" />
                    <span className="truncate">{chat.title || `Chat ${chat.id}`}</span>
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Menú desplegable con las demás opciones */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="flex items-center gap-1 text-sm px-2 py-1 rounded-md"
              >
                <MoreHorizontal size={16} />
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
              {onToggleLogs && (
                <DropdownMenuItem
                  onClick={onToggleLogs}
                  disabled={!selectedChatId}
                >
                  <FileText size={16} className="mr-2" />
                  Logs
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setIsKnowledgeBaseModalOpen(true)}
              >
                <Brain size={16} className="mr-2" />
                Base de Conocimientos
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {appId && (
          <KnowledgeBaseModal
            appId={appId}
            isOpen={isKnowledgeBaseModalOpen}
            onClose={() => setIsKnowledgeBaseModalOpen(false)}
          />
        )}

        <button
          data-testid="toggle-preview-panel-button"
          onClick={onTogglePreview}
          className="cursor-pointer p-2 hover:bg-(--background-lightest) rounded-md"
        >
          {isPreviewOpen ? (
            <PanelRightClose size={20} />
          ) : (
            <PanelRightOpen size={20} />
          )}
        </button>
      </div>

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
    </div>
  );
}
