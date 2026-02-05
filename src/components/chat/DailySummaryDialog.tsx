import { useState } from "react";
import { Copy, X, Save } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { showSuccess, showError } from "@/lib/toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ipc } from "@/ipc/types";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { useNavigate } from "@tanstack/react-router";

interface DailySummaryDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  summary: string;
  appId: number | null;
  appName: string;
}

export function DailySummaryDialog({
  isOpen,
  onOpenChange,
  summary,
  appId,
  appName,
}: DailySummaryDialogProps) {
  const [isCopying, setIsCopying] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const handleCopy = async () => {
    try {
      setIsCopying(true);
      await navigator.clipboard.writeText(summary);
      showSuccess("Resumen copiado al portapapeles");
    } catch {
      showError("Error al copiar el resumen");
    } finally {
      setIsCopying(false);
    }
  };

  const handleSaveAsNote = async () => {
    if (!appId) {
      showError("No hay una aplicación seleccionada");
      return;
    }

    try {
      setIsSaving(true);
      const now = new Date();
      const dateStr = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`;
      const noteTitle = `Resumen trabajo ${appName} ${dateStr}`;

      const noteId = await ipc.note.createNote();
      await ipc.note.updateNote({
        noteId,
        title: noteTitle,
        content: summary,
      });

      await queryClient.invalidateQueries({ queryKey: queryKeys.notes.all });
      showSuccess("Nota guardada correctamente");
      onOpenChange(false);

      // Navigate to the newly created note
      navigate({ to: "/notes/$noteId", params: { noteId: String(noteId) } });
    } catch (error) {
      showError(`Error al guardar la nota: ${(error as any).toString()}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Resumen del trabajo de hoy</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] w-full rounded-md border p-4">
          <div className="whitespace-pre-wrap text-sm">{summary}</div>
        </ScrollArea>
        <div className="flex justify-between gap-2 mt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="gap-2"
          >
            <X size={16} />
            Cerrar
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleSaveAsNote}
              disabled={isSaving}
              className="gap-2"
            >
              <Save size={16} />
              {isSaving ? "Guardando..." : "Guardar como nota"}
            </Button>
            <Button onClick={handleCopy} disabled={isCopying} className="gap-2">
              <Copy size={16} />
              {isCopying ? "Copiando..." : "Copiar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
