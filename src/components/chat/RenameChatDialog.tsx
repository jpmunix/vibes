import { useState } from "react";
import { ipc } from "@/ipc/types";
import { showError, showSuccess } from "@/lib/toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface RenameChatDialogProps {
  chatId: number;
  currentTitle: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onRename: () => void;
}

export function RenameChatDialog({
  chatId,
  currentTitle,
  isOpen,
  onOpenChange,
  onRename,
}: RenameChatDialogProps) {
  const [newTitle, setNewTitle] = useState("");

  // Reset title when dialog opens
  const handleOpenChange = (open: boolean) => {
    if (open) {
      setNewTitle(currentTitle || "");
    } else {
      setNewTitle("");
    }
    onOpenChange(open);
  };

  const handleSave = async () => {
    if (!newTitle.trim()) {
      return;
    }

    try {
      await ipc.chat.updateChat({
        chatId,
        title: newTitle.trim(),
      });
      showSuccess("Chat renombrado correctamente");

      // Call the parent's onRename callback to refresh the chat list
      onRename();

      // Close the dialog
      handleOpenChange(false);
    } catch (error) {
      showError(`Error al renombrar el chat: ${(error as any).toString()}`);
    }
  };

  const handleClose = () => {
    handleOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Renombrar chat</DialogTitle>
          <DialogDescription>
            Introduce un nuevo nombre para este chat.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="chat-title" className="text-right">
              Título
            </Label>
            <Input
              id="chat-title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="col-span-3"
              placeholder="Introduce el título del chat..."
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleSave();
                }
              }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!newTitle.trim()}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
