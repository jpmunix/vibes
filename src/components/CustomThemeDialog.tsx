import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useCreateCustomTheme } from "@/hooks/useCustomThemes";
import { showError } from "@/lib/toast";
import { toast } from "sonner";

interface CustomThemeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onThemeCreated?: (themeId: number) => void;
}

export function CustomThemeDialog({
  open,
  onOpenChange,
  onThemeCreated,
}: CustomThemeDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [prompt, setPrompt] = useState("");

  const createThemeMutation = useCreateCustomTheme();

  const resetForm = useCallback(() => {
    setName("");
    setDescription("");
    setPrompt("");
  }, []);

  const handleClose = useCallback(async () => {
    resetForm();
    onOpenChange(false);
  }, [onOpenChange, resetForm]);

  const handleSave = useCallback(async () => {
    if (!name.trim()) {
      showError("Por favor, introduce un nombre para el tema");
      return;
    }
    if (!prompt.trim()) {
      showError("Por favor, introduce un prompt para el tema");
      return;
    }

    try {
      const createdTheme = await createThemeMutation.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        prompt: prompt.trim(),
      });
      toast.success("Tema personalizado creado correctamente");
      onThemeCreated?.(createdTheme.id);
      await handleClose();
    } catch (error) {
      showError(
        `Error al crear el tema: ${error instanceof Error ? error.message : "Error desconocido"}`,
      );
    }
  }, [
    name,
    description,
    prompt,
    createThemeMutation,
    onThemeCreated,
    handleClose,
  ]);

  const isSaving = createThemeMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Crear tema personalizado</DialogTitle>
          <DialogDescription>
            Crea un tema personalizado con un prompt de sistema.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="theme-name">Nombre del tema</Label>
            <Input
              id="theme-name"
              placeholder="Mi tema personalizado"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="theme-description">Descripción (opcional)</Label>
            <Input
              id="theme-description"
              placeholder="Una breve descripción de tu tema"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="theme-prompt">Prompt del tema</Label>
            <Textarea
              id="theme-prompt"
              placeholder="Introduce el prompt de sistema de tu tema..."
              className="min-h-[200px] font-mono text-sm"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>

          <Button
            onClick={handleSave}
            disabled={isSaving || !name.trim() || !prompt.trim()}
            className="w-full"
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Guardando...
              </>
            ) : (
              "Guardar tema"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
