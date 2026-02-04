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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Sparkles, PenLine } from "lucide-react";
import { useCreateCustomTheme } from "@/hooks/useCustomThemes";
import { showError } from "@/lib/toast";
import { toast } from "sonner";
import { AIGeneratorTab } from "./AIGeneratorTab";

interface CustomThemeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onThemeCreated?: (themeId: number) => void; // callback when theme is created
}

export function CustomThemeDialog({
  open,
  onOpenChange,
  onThemeCreated,
}: CustomThemeDialogProps) {
  const [activeTab, setActiveTab] = useState<"manual" | "ai">("ai");

  // Manual tab state
  const [manualName, setManualName] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [manualPrompt, setManualPrompt] = useState("");

  // AI tab state (shared with AIGeneratorTab)
  const [aiName, setAiName] = useState("");
  const [aiDescription, setAiDescription] = useState("");
  const [aiGeneratedPrompt, setAiGeneratedPrompt] = useState("");

  const createThemeMutation = useCreateCustomTheme();

  const resetForm = useCallback(() => {
    setManualName("");
    setManualDescription("");
    setManualPrompt("");
    setAiName("");
    setAiDescription("");
    setAiGeneratedPrompt("");
    setActiveTab("ai");
  }, []);

  const handleClose = useCallback(async () => {
    resetForm();
    onOpenChange(false);
  }, [onOpenChange, resetForm]);

  const handleSave = useCallback(async () => {
    const isManual = activeTab === "manual";
    const name = isManual ? manualName : aiName;
    const description = isManual ? manualDescription : aiDescription;
    const prompt = isManual ? manualPrompt : aiGeneratedPrompt;

    if (!name.trim()) {
      showError("Por favor, introduce un nombre para el tema");
      return;
    }
    if (!prompt.trim()) {
      showError(
        isManual
          ? "Por favor, introduce un prompt para el tema"
          : "Por favor, genera un prompt primero",
      );
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
    activeTab,
    manualName,
    manualDescription,
    manualPrompt,
    aiName,
    aiDescription,
    aiGeneratedPrompt,
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
            Crea un tema personalizado mediante configuración manual o
            generación asistida por IA.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "manual" | "ai")}
          className="mt-4"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="ai" className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Generador asistido por IA
            </TabsTrigger>
            <TabsTrigger value="manual" className="flex items-center gap-2">
              <PenLine className="h-4 w-4" />
              Configuración manual
            </TabsTrigger>
          </TabsList>

          {/* AI-Powered Generator Tab */}
          <TabsContent value="ai">
            <AIGeneratorTab
              aiName={aiName}
              setAiName={setAiName}
              aiDescription={aiDescription}
              setAiDescription={setAiDescription}
              aiGeneratedPrompt={aiGeneratedPrompt}
              setAiGeneratedPrompt={setAiGeneratedPrompt}
              onSave={handleSave}
              isSaving={isSaving}
              isDialogOpen={open}
            />
          </TabsContent>

          {/* Manual Configuration Tab */}
          <TabsContent value="manual" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="manual-name">Nombre del tema</Label>
              <Input
                id="manual-name"
                placeholder="Mi tema personalizado"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="manual-description">Descripción (opcional)</Label>
              <Input
                id="manual-description"
                placeholder="Una breve descripción de tu tema"
                value={manualDescription}
                onChange={(e) => setManualDescription(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="manual-prompt">Prompt del tema</Label>
              <Textarea
                id="manual-prompt"
                placeholder="Introduce el prompt de sistema de tu tema..."
                className="min-h-[200px] font-mono text-sm"
                value={manualPrompt}
                onChange={(e) => setManualPrompt(e.target.value)}
              />
            </div>

            <Button
              onClick={handleSave}
              disabled={isSaving || !manualName.trim() || !manualPrompt.trim()}
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
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
