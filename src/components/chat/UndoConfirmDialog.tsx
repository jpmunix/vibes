import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Pencil,
  Trash2,
  ArrowRightLeft,
  AlertTriangle,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import type { UncommittedFile } from "@/hooks/useUncommittedFiles";

interface UndoConfirmDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onUndoMessageOnly: () => void;
  onUndoAll: () => void;
  uncommittedFiles: UncommittedFile[];
  isLoading: boolean;
}

function getStatusIcon(status: UncommittedFile["status"]) {
  switch (status) {
    case "added":
      return <Plus className="h-3.5 w-3.5 text-green-500" />;
    case "modified":
      return <Pencil className="h-3.5 w-3.5 text-yellow-500" />;
    case "deleted":
      return <Trash2 className="h-3.5 w-3.5 text-red-500" />;
    case "renamed":
      return <ArrowRightLeft className="h-3.5 w-3.5 text-blue-500" />;
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

export function UndoConfirmDialog({
  isOpen,
  onOpenChange,
  onUndoMessageOnly,
  onUndoAll,
  uncommittedFiles,
  isLoading,
}: UndoConfirmDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="!w-fit !max-w-[90vw] min-w-[24rem]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Hay cambios sin commitear
          </DialogTitle>
          <DialogDescription>
            Si deshaces todo, estos cambios en el código se perderán.
            Puedes deshacer solo el mensaje y dejar el código como está.
          </DialogDescription>
        </DialogHeader>

        <div>
          <p className="text-sm font-medium mb-2">
            Archivos con cambios ({uncommittedFiles.length})
          </p>
          <div className="max-h-48 overflow-y-auto rounded-md border p-2 space-y-0.5">
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
                    "text-[10px] px-1.5 py-0.5 rounded shrink-0",
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

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancelar
          </Button>
          <Button
            variant="default"
            onClick={onUndoMessageOnly}
            disabled={isLoading}
          >
            Solo deshacer mensaje
          </Button>
          <Button
            variant="destructive"
            onClick={onUndoAll}
            disabled={isLoading}
          >
            Deshacer todo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
