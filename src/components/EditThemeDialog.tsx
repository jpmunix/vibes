import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Save, Edit2, Loader2 } from "@/components/ui/icons";
import { showError } from "@/lib/toast";
import { toast } from "sonner";
import type { CustomTheme } from "@/ipc/types";

interface EditThemeDialogProps {
  theme: CustomTheme;
  onUpdateTheme: (params: {
    id: number;
    name: string;
    description?: string;
    prompt: string;
  }) => Promise<void>;
  trigger?: React.ReactNode;
}

export function EditThemeDialog({
  theme,
  onUpdateTheme,
  trigger,
}: EditThemeDialogProps) {
  const [open, setOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [draft, setDraft] = useState({
    name: "",
    description: "",
    prompt: "",
  });
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea function
  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      const currentHeight = textarea.style.height;
      textarea.style.height = "auto";
      const scrollHeight = textarea.scrollHeight;
      const maxHeight = window.innerHeight * 0.5;
      const minHeight = 150;
      const newHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight);

      if (`${newHeight}px` !== currentHeight) {
        textarea.style.height = `${newHeight}px`;
      }
    }
  };

  // Initialize draft with theme data
  useEffect(() => {
    if (open) {
      setDraft({
        name: theme.name,
        description: theme.description || "",
        prompt: theme.prompt,
      });
    }
  }, [open, theme]);

  // Auto-resize textarea when content changes
  useEffect(() => {
    adjustTextareaHeight();
  }, [draft.prompt]);

  // Trigger resize when dialog opens
  useEffect(() => {
    if (open) {
      setTimeout(adjustTextareaHeight, 0);
    }
  }, [open]);

  const handleSave = async () => {
    if (!draft.name.trim() || !draft.prompt.trim()) return;

    setIsSaving(true);
    try {
      await onUpdateTheme({
        id: theme.id,
        name: draft.name.trim(),
        description: draft.description.trim() || undefined,
        prompt: draft.prompt.trim(),
      });
      toast.success("Tema actualizado correctamente");
      setOpen(false);
    } catch (error) {
      showError(
        `Error al actualizar el tema: ${error instanceof Error ? error.message : "Error desconocido"}`,
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setDraft({
      name: theme.name,
      description: theme.description || "",
      prompt: theme.prompt,
    });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? (
        <DialogTrigger asChild>{trigger}</DialogTrigger>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                data-testid="edit-theme-button"
              >
                <Edit2 className="h-4 w-4" />
              </Button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>Editar tema</p>
          </TooltipContent>
        </Tooltip>
      )}
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar tema</DialogTitle>
          <DialogDescription>
            Modifica los ajustes y el prompt de tu tema personalizado.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <label htmlFor="edit-theme-name" className="text-sm font-medium">
              Nombre del tema
            </label>
            <Input
              id="edit-theme-name"
              placeholder="Nombre del tema"
              value={draft.name}
              onChange={(e) =>
                setDraft((d) => ({ ...d, name: e.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="edit-theme-description"
              className="text-sm font-medium"
            >
              Descripción (opcional)
            </label>
            <Input
              id="edit-theme-description"
              placeholder="Una breve descripción de tu tema"
              value={draft.description}
              onChange={(e) =>
                setDraft((d) => ({ ...d, description: e.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="edit-theme-prompt" className="text-sm font-medium">
              Prompt del tema
            </label>
            <Textarea
              id="edit-theme-prompt"
              ref={textareaRef}
              placeholder="Introduce el prompt de sistema de tu tema..."
              value={draft.prompt}
              onChange={(e) => {
                setDraft((d) => ({ ...d, prompt: e.target.value }));
                requestAnimationFrame(adjustTextareaHeight);
              }}
              className="resize-none overflow-y-auto font-mono text-sm"
              style={{ minHeight: "150px" }}
            />
          </div>
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={handleCancel} disabled={isSaving}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !draft.name.trim() || !draft.prompt.trim()}
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" /> Guardar
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
