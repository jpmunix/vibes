import { useState, useEffect, useRef } from "react";
import { useSettings } from "@/hooks/useSettings";
import {
  FileWarning,
  Plus,
  Pencil,
  Trash2,
  ArrowRightLeft,
  Undo2,
} from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  useUncommittedFiles,
  type UncommittedFile,
} from "@/hooks/useUncommittedFiles";
import { useCommitChanges } from "@/hooks/useCommitChanges";
import { ipc } from "@/ipc/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface UncommittedFilesBannerProps {
  appId: number | null;
}

function getStatusIcon(status: UncommittedFile["status"]) {
  switch (status) {
    case "added":
      return <Plus className="h-4 w-4 text-green-500" />;
    case "modified":
      return <Pencil className="h-4 w-4 text-yellow-500" />;
    case "deleted":
      return <Trash2 className="h-4 w-4 text-red-500" />;
    case "renamed":
      return <ArrowRightLeft className="h-4 w-4 text-blue-500" />;
    default:
      return null;
  }
}

function getStatusLabel(status: UncommittedFile["status"]) {
  switch (status) {
    case "added":
      return "Añadido";
    case "modified":
      return "Modificado";
    case "deleted":
      return "Eliminado";
    case "renamed":
      return "Renombrado";
    default:
      return status;
  }
}

function generateDefaultCommitMessage(files: UncommittedFile[]): string {
  if (files.length === 0) return "";

  const added = files.filter((f) => f.status === "added").length;
  const modified = files.filter((f) => f.status === "modified").length;
  const deleted = files.filter((f) => f.status === "deleted").length;
  const renamed = files.filter((f) => f.status === "renamed").length;

  const parts: string[] = [];
  if (added > 0) parts.push(`añadir ${added} archivo${added > 1 ? "s" : ""}`);
  if (modified > 0)
    parts.push(`actualizar ${modified} archivo${modified > 1 ? "s" : ""}`);
  if (deleted > 0)
    parts.push(`eliminar ${deleted} archivo${deleted > 1 ? "s" : ""}`);
  if (renamed > 0)
    parts.push(`renombrar ${renamed} archivo${renamed > 1 ? "s" : ""}`);

  if (parts.length === 0) return "Actualizar archivos";

  // Capitalize first letter
  const message = parts.join(", ");
  return message.charAt(0).toUpperCase() + message.slice(1);
}

export function UncommittedFilesBanner({ appId }: UncommittedFilesBannerProps) {
  const { settings } = useSettings();
  const { uncommittedFiles, hasUncommittedFiles, isLoading } =
    useUncommittedFiles(appId);
  const { commitChanges, isCommitting } = useCommitChanges();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [isDiscardDialogOpen, setIsDiscardDialogOpen] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);
  const autoCommitTriggeredRef = useRef(false);
  const autoCommitFailCountRef = useRef(0);

  // Reset failure counter when app changes
  useEffect(() => {
    autoCommitFailCountRef.current = 0;
    autoCommitTriggeredRef.current = false;
  }, [appId]);

  // Auto-commit silently when autoApproveChanges is enabled
  // Limited to 3 retries to prevent infinite toast loops on persistent errors
  const MAX_AUTO_COMMIT_RETRIES = 3;
  useEffect(() => {
    if (
      settings?.autoApproveChanges &&
      hasUncommittedFiles &&
      !isCommitting &&
      !autoCommitTriggeredRef.current &&
      autoCommitFailCountRef.current < MAX_AUTO_COMMIT_RETRIES &&
      appId
    ) {
      autoCommitTriggeredRef.current = true;
      const message = generateDefaultCommitMessage(uncommittedFiles);
      commitChanges({ appId, message, silent: true })
        .then(() => {
          autoCommitFailCountRef.current = 0;
          autoCommitTriggeredRef.current = false;
        })
        .catch(() => {
          autoCommitFailCountRef.current++;
          // Delay before allowing the next retry to avoid rapid-fire
          setTimeout(() => {
            autoCommitTriggeredRef.current = false;
          }, 5000);
        });
    }
  }, [
    settings?.autoApproveChanges,
    hasUncommittedFiles,
    isCommitting,
    appId,
    uncommittedFiles,
    commitChanges,
  ]);

  // Don't show banner when auto-approve is enabled
  if (settings?.autoApproveChanges) {
    return null;
  }

  // In agent/plan mode the git icon (red dot) already signals pending changes — skip the banner.
  // Only show it in "ask" (chat) mode where the user manages commits manually.
  const chatMode = settings?.selectedChatMode ?? "agent";
  if (chatMode !== "ask") {
    return null;
  }

  if (!appId || isLoading || !hasUncommittedFiles) {
    return null;
  }

  const handleOpenDialog = () => {
    // Set default commit message only when opening the dialog
    // This prevents overwriting user's custom message during polling
    setCommitMessage(generateDefaultCommitMessage(uncommittedFiles));
    setIsDialogOpen(true);
  };

  const handleCommit = async () => {
    if (!appId || !commitMessage.trim()) return;

    await commitChanges({ appId, message: commitMessage.trim() });
    setIsDialogOpen(false);
    setCommitMessage("");
  };

  const handleDiscard = async () => {
    if (!appId) return;
    setIsDiscarding(true);
    try {
      const result = await ipc.git.discardAllChanges({ appId });
      toast.success(result.message);
      setIsDiscardDialogOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Error al descartar cambios");
    } finally {
      setIsDiscarding(false);
    }
  };

  return (
    <>
      <div
        className="flex flex-col @sm:flex-row items-center justify-between px-4 py-2 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200"
        data-testid="uncommitted-files-banner"
      >
        <div className="flex items-center gap-2 text-sm">
          <FileWarning size={16} />
          <span>
            Tienes <strong>{uncommittedFiles.length}</strong>{" "}
            {uncommittedFiles.length === 1 ? "cambio" : "cambios"} sin
            confirmar.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsDiscardDialogOpen(true)}
            className="text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800"
            data-testid="discard-changes-button"
          >
            <Undo2 size={14} className="mr-1.5" />
            Descartar
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleOpenDialog}
            data-testid="review-commit-button"
          >
            Revisar y confirmar
          </Button>
        </div>
      </div>

      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          // Prevent closing while committing
          if (!open && isCommitting) return;
          setIsDialogOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-lg" data-testid="commit-dialog">
          <DialogHeader>
            <DialogTitle>Revisar y confirmar cambios</DialogTitle>
            <DialogDescription>
              Revisa tus cambios e introduce un mensaje de confirmación.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label
                htmlFor="commit-message"
                className="text-sm font-medium mb-2 block"
              >
                Mensaje de confirmación
              </label>
              <Input
                id="commit-message"
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                placeholder="Introduce el mensaje de confirmación..."
                data-testid="commit-message-input"
              />
            </div>

            <div>
              <p className="text-sm font-medium mb-2">
                Archivos cambiados ({uncommittedFiles.length})
              </p>
              <div
                className="max-h-60 overflow-y-auto rounded-md border p-2 space-y-1"
                data-testid="changed-files-list"
              >
                {uncommittedFiles.map((file) => (
                  <div
                    key={file.path}
                    className="flex items-center gap-2 text-sm py-1 px-2 rounded hover:bg-muted"
                  >
                    {getStatusIcon(file.status)}
                    <span
                      className={cn(
                        "flex-1 truncate font-mono text-xs",
                        file.status === "deleted" && "line-through opacity-60",
                      )}
                    >
                      {file.path}
                    </span>
                    <span
                      className={cn(
                        "text-xs px-1.5 py-0.5 rounded",
                        file.status === "added" &&
                        "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
                        file.status === "modified" &&
                        "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
                        file.status === "deleted" &&
                        "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
                        file.status === "renamed" &&
                        "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
                      )}
                    >
                      {getStatusLabel(file.status)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              disabled={isCommitting}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCommit}
              disabled={!commitMessage.trim() || isCommitting}
              data-testid="commit-button"
            >
              {isCommitting ? "Confirmando..." : "Confirmar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Discard confirmation dialog */}
      <Dialog
        open={isDiscardDialogOpen}
        onOpenChange={(open) => {
          if (!open && isDiscarding) return;
          setIsDiscardDialogOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-md" data-testid="discard-dialog">
          <DialogHeader>
            <DialogTitle>Descartar todos los cambios</DialogTitle>
            <DialogDescription>
              ¿Estás seguro? Se eliminarán <strong>{uncommittedFiles.length}</strong>{" "}
              {uncommittedFiles.length === 1 ? "cambio" : "cambios"} sin confirmar.
              Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDiscardDialogOpen(false)}
              disabled={isDiscarding}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDiscard}
              disabled={isDiscarding}
              data-testid="confirm-discard-button"
            >
              {isDiscarding ? "Descartando..." : "Descartar cambios"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
