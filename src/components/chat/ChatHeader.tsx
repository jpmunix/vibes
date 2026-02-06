import {
  PanelRightOpen,
  PlusCircle,
  GitBranch,
  Eraser,
  Sparkles,
  Info,
  Save,
  FileText,
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

  const isNotMainBranch = branchInfo && branchInfo.branch !== "main";

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
          <Button
            onClick={handleSummarize}
            variant="ghost"
            title="Resumir chat"
            className="flex cursor-pointer items-center gap-1 text-sm px-2 py-1 rounded-md text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30"
            disabled={!selectedChatId || isStreaming}
          >
            <Sparkles size={16} />
            <span className="hidden @xs:inline">Resumir chat</span>
          </Button>
          <Button
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
            variant="ghost"
            title="Generar título automático"
            className="flex cursor-pointer items-center gap-1 text-sm px-2 py-1 rounded-md text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30"
            disabled={!selectedChatId || isStreaming || isGeneratingTitle}
          >
            <Sparkles
              size={16}
              className={isGeneratingTitle ? "animate-pulse" : ""}
            />
            <span className="hidden @xs:inline">Título automático</span>
          </Button>
          <Button
            onClick={handleSaveNote}
            variant="ghost"
            title="Guardar nota"
            className="flex cursor-pointer items-center gap-1 text-sm px-2 py-1 rounded-md text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/30"
            disabled={!selectedChatId || isStreaming || isSavingNote}
          >
            <Save size={16} className={isSavingNote ? "animate-pulse" : ""} />
            <span className="hidden @xs:inline">Guardar nota</span>
          </Button>
          <Button
            onClick={() => setIsConfirmEmptyDialogOpen(true)}
            variant="ghost"
            title="Vaciar chat"
            className="flex cursor-pointer items-center gap-1 text-sm px-2 py-1 rounded-md text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/30"
            disabled={!selectedChatId || isStreaming}
          >
            <Eraser size={16} />
            <span className="hidden @xs:inline">Vaciar chat</span>
          </Button>
          {onToggleLogs && (
            <Button
              onClick={onToggleLogs}
              variant="ghost"
              title="Logs del chat"
              className={`flex cursor-pointer items-center gap-1 text-sm px-2 py-1 rounded-md ${
                isLogsOpen
                  ? "bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900/30"
              }`}
              disabled={!selectedChatId}
            >
              <FileText size={16} />
              <span className="hidden @xs:inline">Logs</span>
            </Button>
          )}
        </div>

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
