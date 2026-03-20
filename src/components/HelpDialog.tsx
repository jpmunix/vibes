import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  BookOpenIcon,
  BugIcon,
  UploadIcon,
  ChevronLeftIcon,
  CheckIcon,
  XIcon,
  FileIcon,
  SparklesIcon,
} from "lucide-react";
import { ipc } from "@/ipc/types";
import { useState, useEffect } from "react";
import { useAtomValue } from "jotai";
import { selectedChatIdAtom } from "@/atoms/chatAtoms";
import { ChatLogsData } from "@/ipc/types";
import { showError } from "@/lib/toast";
import { HelpBotDialog } from "./HelpBotDialog";
import { useSettings } from "@/hooks/useSettings";
import { BugScreenshotDialog } from "./BugScreenshotDialog";
import { useUserBudgetInfo } from "@/hooks/useUserBudgetInfo";

interface HelpDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function HelpDialog({ isOpen, onClose }: HelpDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);
  const [chatLogsData, setChatLogsData] = useState<ChatLogsData | null>(null);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [isHelpBotOpen, setIsHelpBotOpen] = useState(false);
  const [isBugScreenshotOpen, setIsBugScreenshotOpen] = useState(false);
  const selectedChatId = useAtomValue(selectedChatIdAtom);
  const { settings } = useSettings();
  const { userBudget } = useUserBudgetInfo();
  const isProUser = settings?.providerSettings?.["auto"]?.apiKey?.value;

  // Function to reset all dialog state
  const resetDialogState = () => {
    setIsLoading(false);
    setIsUploading(false);
    setReviewMode(false);
    setChatLogsData(null);
    setUploadComplete(false);
    setSessionId("");
  };

  // Reset state when dialog closes or reopens
  useEffect(() => {
    if (!isOpen) {
      resetDialogState();
    }
  }, [isOpen]);

  // Wrap the original onClose to also reset state
  const handleClose = () => {
    onClose();
  };

  const handleReportBug = async () => {
    setIsLoading(true);
    try {
      // Get system debug info
      const debugInfo = await ipc.system.getSystemDebugInfo();

      // Create a formatted issue body with the debug info
      const issueBody = `
<!-- Please fill in all fields in English -->

## Bug Description (required)
<!-- Please describe the issue you're experiencing and how to reproduce it -->

## Screenshot (recommended)
<!-- Screenshot of the bug -->

## System Information
- Vibes Version: ${debugInfo.vibesVersion}
- Platform: ${debugInfo.platform}
- Architecture: ${debugInfo.architecture}
- Node Version: ${debugInfo.nodeVersion || "n/a"}
- PNPM Version: ${debugInfo.pnpmVersion || "n/a"}
- Node Path: ${debugInfo.nodePath || "n/a"}
- Pro User ID: ${userBudget?.redactedUserId || "n/a"}
- Telemetry ID: ${debugInfo.telemetryId || "n/a"}
- Model: ${debugInfo.selectedLanguageModel || "n/a"}

## Logs
\`\`\`
${debugInfo.logs.slice(-3_500) || "No logs available"}
\`\`\`
`;

      // Create the GitHub issue URL with the pre-filled body
      const encodedBody = encodeURIComponent(issueBody);
      const encodedTitle = encodeURIComponent("[bug] <WRITE TITLE HERE>");
      const labels = ["bug"];
      if (isProUser) {
        labels.push("pro");
      }
      const githubIssueUrl = `https://github.com/<vibes-sh/dyad/issues/new?title=${encodedTitle}&labels=${labels}&body=${encodedBody}`;

      // Open the pre-filled GitHub issue page
      ipc.system.openExternalUrl(githubIssueUrl);
    } catch (error) {
      console.error("Failed to prepare bug report:", error);
      // Fallback to opening the regular GitHub issue page
      ipc.system.openExternalUrl("https://github.com/<vibes-sh/dyad/issues/new");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUploadChatSession = async () => {
    if (!selectedChatId) {
      alert("Por favor, selecciona un chat primero");
      return;
    }

    setIsUploading(true);
    try {
      // Get chat logs (includes debug info, chat data, and codebase)
      const chatLogs = await ipc.misc.getChatLogs(selectedChatId);

      // Store data for review and switch to review mode
      setChatLogsData(chatLogs);
      setReviewMode(true);
    } catch (error) {
      console.error("Failed to upload chat session:", error);
      alert(
        "Error al subir la sesión de chat. Por favor, inténtalo de nuevo o infórmalo manualmente.",
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmitChatLogs = async () => {
    if (!chatLogsData) return;

    setIsUploading(true);
    try {
      // Prepare data for upload
      const chatLogsJson = {
        systemInfo: chatLogsData.debugInfo,
        chat: chatLogsData.chat,
        codebaseSnippet: chatLogsData.codebase,
      };

      // Get signed URL
      const response = await fetch(
        "https://upload-logs.dyad.sh/generate-upload-url",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            extension: "json",
            contentType: "application/json",
          }),
        },
      );

      if (!response.ok) {
        showError(`Error al obtener la URL de subida: ${response.statusText}`);
        throw new Error(
          `Error al obtener la URL de subida: ${response.statusText}`,
        );
      }

      const { uploadUrl, filename } = await response.json();

      await ipc.system.uploadToSignedUrl({
        url: uploadUrl,
        contentType: "application/json",
        data: chatLogsJson,
      });

      // Extract session ID (filename without extension)
      const sessionId = filename.replace(".json", "");
      setSessionId(sessionId);
      setUploadComplete(true);
      setReviewMode(false);
    } catch (error) {
      console.error("Failed to upload chat logs:", error);
      alert(
        "Error al subir los registros del chat. Por favor, inténtalo de nuevo.",
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleCancelReview = () => {
    setReviewMode(false);
    setChatLogsData(null);
  };

  const handleOpenGitHubIssue = () => {
    // Create a GitHub issue with the session ID
    const issueBody = `
<!-- Please fill in all fields in English -->

Session ID: ${sessionId}
Pro User ID: ${userBudget?.redactedUserId || "n/a"}

## Issue Description (required)
<!-- Please describe the issue you're experiencing -->

## Expected Behavior (required)
<!-- What did you expect to happen? -->

## Actual Behavior (required)
<!-- What actually happened? -->
`;

    const encodedBody = encodeURIComponent(issueBody);
    const encodedTitle = encodeURIComponent("[session report] <add title>");
    const labels = ["support"];
    if (isProUser) {
      labels.push("pro");
    }
    const githubIssueUrl = `https://github.com/<vibes-sh/dyad/issues/new?title=${encodedTitle}&labels=${labels}&body=${encodedBody}`;

    ipc.system.openExternalUrl(githubIssueUrl);
    handleClose();
  };

  if (uploadComplete) {
    return (
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Subida completada</DialogTitle>
          </DialogHeader>
          <div className="py-6 flex flex-col items-center space-y-4">
            <div className="bg-green-50 dark:bg-green-900/20 p-6 rounded-full">
              <CheckIcon className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <h3 className="text-lg font-medium">
              Registros de chat subidos correctamente
            </h3>
            <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded flex items-center space-x-2 font-mono text-sm">
              <FileIcon
                className="h-4 w-4 cursor-pointer"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(sessionId);
                  } catch (err) {
                    console.error("Failed to copy session ID:", err);
                  }
                }}
              />
              <span>{sessionId}</span>
            </div>
            <p className="text-center text-sm">
              Debes abrir un problema en GitHub para que lo investiguemos. Sin
              un problema vinculado, tu informe no será revisado.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={handleOpenGitHubIssue} className="w-full">
              Abrir problema en GitHub
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (reviewMode && chatLogsData) {
    return (
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <Button
                variant="ghost"
                className="mr-2 p-0 h-8 w-8"
                onClick={handleCancelReview}
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </Button>
              ¿Estás de acuerdo con subir la sesión de chat?
            </DialogTitle>
          </DialogHeader>
          <DialogDescription>
            Por favor, revisa la información que se enviará. Se incluirán tus
            mensajes de chat, información del sistema y una instantánea de tu
            código.
          </DialogDescription>

          <div className="space-y-4 overflow-y-auto flex-grow">
            <div className="border rounded-md p-3">
              <h3 className="font-medium mb-2">Mensajes de chat</h3>
              <div className="text-sm bg-slate-50 dark:bg-slate-900 rounded p-2 max-h-40 overflow-y-auto">
                {chatLogsData.chat.messages.map((msg) => (
                  <div key={msg.id} className="mb-2">
                    <span className="font-semibold">
                      {msg.role === "user" ? "Tú" : "Asistente"}:{" "}
                    </span>
                    <span>{msg.content}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border rounded-md p-3">
              <h3 className="font-medium mb-2">Instantánea del código</h3>
              <div className="text-sm bg-slate-50 dark:bg-slate-900 rounded p-2 max-h-40 overflow-y-auto font-mono">
                {chatLogsData.codebase}
              </div>
            </div>

            <div className="border rounded-md p-3">
              <h3 className="font-medium mb-2">Registros</h3>
              <div className="text-sm bg-slate-50 dark:bg-slate-900 rounded p-2 max-h-40 overflow-y-auto font-mono">
                {chatLogsData.debugInfo.logs}
              </div>
            </div>

            <div className="border rounded-md p-3">
              <h3 className="font-medium mb-2">Información del sistema</h3>
              <div className="text-sm bg-slate-50 dark:bg-slate-900 rounded p-2 max-h-32 overflow-y-auto">
                <p>Versión de Vibes: {chatLogsData.debugInfo.vibesVersion}</p>
                <p>Plataforma: {chatLogsData.debugInfo.platform}</p>
                <p>Arquitectura: {chatLogsData.debugInfo.architecture}</p>
                <p>
                  Versión de Node:{" "}
                  {chatLogsData.debugInfo.nodeVersion || "No disponible"}
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-between mt-4 pt-2 sticky bottom-0 bg-background">
            <Button
              variant="outline"
              onClick={handleCancelReview}
              className="flex items-center"
            >
              <XIcon className="mr-2 h-4 w-4" /> Cancelar
            </Button>
            <Button
              onClick={handleSubmitChatLogs}
              className="flex items-center"
              disabled={isUploading}
            >
              {isUploading ? (
                "Subiendo..."
              ) : (
                <>
                  <CheckIcon className="mr-2 h-4 w-4" /> Subir
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Necesitas ayuda con Vibes?</DialogTitle>
        </DialogHeader>
        <DialogDescription className="">
          Si necesitas ayuda o quieres informar de un problema, aquí tienes
          algunas opciones:
        </DialogDescription>
        <div className="flex flex-col space-y-4 w-full">
          {isProUser ? (
            <div className="flex flex-col space-y-2">
              <Button
                variant="default"
                onClick={() => {
                  setIsHelpBotOpen(true);
                }}
                className="w-full py-6 border-primary/50 shadow-sm shadow-primary/10 transition-[box-shadow] hover:shadow-md hover:shadow-primary/15"
              >
                <SparklesIcon className="mr-2 h-5 w-5" /> Chatear con el bot de
                ayuda de Vibes (Pro)
              </Button>
              <p className="text-sm text-muted-foreground px-2">
                Abre un asistente de chat de ayuda en la aplicación que busca en
                la documentación de Vibes.
              </p>
            </div>
          ) : (
            <div className="flex flex-col space-y-2">
              <Button
                variant="outline"
                onClick={() => {
                  ipc.system.openExternalUrl("https://www.dyad.sh/docs");
                }}
                className="w-full py-6 bg-(--background-lightest)"
              >
                <BookOpenIcon className="mr-2 h-5 w-5" /> Abrir documentación
              </Button>
              <p className="text-sm text-muted-foreground px-2">
                Obtén ayuda con preguntas y problemas comunes.
              </p>
            </div>
          )}

          <div className="flex flex-col space-y-2">
            <Button
              variant="outline"
              onClick={() => {
                handleClose();
                setIsBugScreenshotOpen(true);
              }}
              disabled={isLoading}
              className="w-full py-6 bg-(--background-lightest)"
            >
              <BugIcon className="mr-2 h-5 w-5" />{" "}
              {isLoading ? "Preparando informe..." : "Informar de un error"}
            </Button>
            <p className="text-sm text-muted-foreground px-2">
              Rellenaremos automáticamente tu informe con información del
              sistema y registros. Puedes revisarlo para ver si hay información
              sensible antes de enviarlo.
            </p>
          </div>
          <div className="flex flex-col space-y-2">
            <Button
              variant="outline"
              onClick={handleUploadChatSession}
              disabled={isUploading || !selectedChatId}
              className="w-full py-6 bg-(--background-lightest)"
            >
              <UploadIcon className="mr-2 h-5 w-5" />{" "}
              {isUploading ? "Preparando subida..." : "Subir sesión de chat"}
            </Button>
            <p className="text-sm text-muted-foreground px-2">
              Comparte los registros del chat y el código para solucionar
              problemas. Los datos se utilizan solo para resolver tu problema y
              se eliminan automáticamente después de un tiempo limitado.
            </p>
          </div>
        </div>
      </DialogContent>
      <HelpBotDialog
        isOpen={isHelpBotOpen}
        onClose={() => setIsHelpBotOpen(false)}
      />
      <BugScreenshotDialog
        isOpen={isBugScreenshotOpen}
        onClose={() => setIsBugScreenshotOpen(false)}
        handleReportBug={handleReportBug}
        isLoading={isLoading}
      />
    </Dialog>
  );
}
