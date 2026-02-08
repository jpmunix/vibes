import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Todo } from "@/ipc/types";
import { useEffect, useState } from "react";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import { Code, Loader2, Sparkles, Trash2 } from "lucide-react";
import { Separator } from "@/components/ui/separator";

interface TodoEditModalProps {
  todo: Todo | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (
    todoId: number,
    content: string,
    description: string | null,
    prompt: string | null,
    closeModal?: boolean,
  ) => void;
  onDelete: (todoId: number) => void;
  onDevelop: (todoId: number, prompt?: string) => void;
  onRefine: (todoId: number) => Promise<string>;
}

export function TodoEditModal({
  todo,
  open,
  onOpenChange,
  onSave,
  onDelete,
  onDevelop,
  onRefine,
}: TodoEditModalProps) {
  const [content, setContent] = useState("");
  const [description, setDescription] = useState("");
  const [developPrompt, setDevelopPrompt] = useState("");
  const [isRefining, setIsRefining] = useState(false);

  useEffect(() => {
    if (todo) {
      setContent(todo.content);
      setDescription(todo.description || "");
      setDevelopPrompt(todo.prompt || "");
    }
  }, [todo]);

  const handleSave = () => {
    if (todo && content.trim()) {
      onSave(
        todo.id,
        content.trim(),
        description.trim() || null,
        developPrompt.trim() || null,
        false,
      );
    }
  };

  const handleDelete = () => {
    if (todo) {
      onDelete(todo.id);
      onOpenChange(false);
    }
  };

  const handleDevelop = () => {
    if (todo) {
      onDevelop(todo.id, developPrompt.trim() || undefined);
      onOpenChange(false);
    }
  };

  const handleRefine = async () => {
    if (!todo || isRefining) return;

    setIsRefining(true);
    try {
      // First save current changes to make sure backend has latest data (without closing modal)
      onSave(
        todo.id,
        content.trim(),
        description.trim() || null,
        developPrompt.trim() || null,
        false,
      );

      const refinedPrompt = await onRefine(todo.id);
      setDevelopPrompt(refinedPrompt);

      // Save again with new prompt (without closing modal)
      onSave(
        todo.id,
        content.trim(),
        description.trim() || null,
        refinedPrompt,
        false,
      );
    } catch (error) {
      console.error("Error refining prompt:", error);
    } finally {
      setIsRefining(false);
    }
  };

  if (!todo) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[95vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
          <DialogTitle className="text-2xl">Editar Tarea</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6">
          <div className="flex flex-col gap-6 pb-6">
            <div className="space-y-6">
              <div className="grid gap-2">
                <Label htmlFor="content" className="text-base font-medium">
                  Título
                </Label>
                <Input
                  id="content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="¿Qué hay que hacer?"
                  className="text-lg"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="description" className="text-base font-medium">
                  Descripción
                </Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Añade más detalles..."
                  className="min-h-[150px] resize-none text-base"
                />
              </div>
            </div>

            <Separator className="my-2" />

            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Label className="text-xl font-semibold">Desarrollar</Label>
              </div>
              <div className="flex flex-col gap-4 p-6 rounded-xl border bg-muted/30">
                <div className="grid gap-2">
                  <Label
                    htmlFor="develop-prompt"
                    className="text-sm text-muted-foreground italic"
                  >
                    Define el contexto o instrucciones específicas para que la
                    IA desarrolle esta tarea
                  </Label>
                  <Textarea
                    id="develop-prompt"
                    value={developPrompt}
                    onChange={(e) => setDevelopPrompt(e.target.value)}
                    placeholder="prompt para esta tarea"
                    className="min-h-[200px] resize-none bg-background"
                  />
                </div>
                <div className="flex gap-4">
                  <Button
                    onClick={handleRefine}
                    className="flex-1 h-12 text-lg gap-2 relative overflow-hidden group"
                    variant="outline"
                    disabled={isRefining}
                  >
                    {isRefining ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Sparkles className="h-5 w-5 text-indigo-500 group-hover:text-indigo-600 transition-colors" />
                    )}
                    {isRefining ? "Refinando..." : "Refinar prompt"}
                  </Button>
                  <Button
                    onClick={handleDevelop}
                    className="flex-1 h-12 text-lg gap-2"
                    variant="secondary"
                    disabled={isRefining}
                  >
                    <Code className="h-5 w-5" />
                    Desarrollar
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="border-t px-6 py-4 sm:justify-between gap-4 shrink-0">
          <DeleteConfirmationDialog
            itemName={todo.content}
            itemType="Tarea"
            onDelete={handleDelete}
            trigger={
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Eliminar
              </Button>
            }
          />
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={!content.trim()}
              className="px-8"
            >
              Guardar cambios
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
