import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Upload, X, Sparkles, Lock, Link } from "lucide-react";
import {
  useGenerateThemePrompt,
  useGenerateThemeFromUrl,
} from "@/hooks/useCustomThemes";
import { ipc } from "@/ipc/types";
import { showError } from "@/lib/toast";
import { toast } from "sonner";
import { useUserBudgetInfo } from "@/hooks/useUserBudgetInfo";
import type {
  ThemeGenerationMode,
  ThemeGenerationModel,
  ThemeInputSource,
} from "@/ipc/types";

// Image upload constants
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB per image (raw file size)
const MAX_IMAGES = 5;

// Default model for AI theme generation
const DEFAULT_THEME_GENERATION_MODEL: ThemeGenerationModel = "gemini-3-pro";

// Image stored with file path (for IPC) and blob URL (for preview)
interface ThemeImage {
  path: string; // File path in temp directory
  preview: string; // Blob URL for displaying thumbnail
}

interface AIGeneratorTabProps {
  aiName: string;
  setAiName: (name: string) => void;
  aiDescription: string;
  setAiDescription: (desc: string) => void;
  aiGeneratedPrompt: string;
  setAiGeneratedPrompt: (prompt: string) => void;
  onSave: () => Promise<void>;
  isSaving: boolean;
  isDialogOpen: boolean;
}

export function AIGeneratorTab({
  aiName,
  setAiName,
  aiDescription,
  setAiDescription,
  aiGeneratedPrompt,
  setAiGeneratedPrompt,
  onSave,
  isSaving,
  isDialogOpen,
}: AIGeneratorTabProps) {
  const [aiImages, setAiImages] = useState<ThemeImage[]>([]);
  const [aiKeywords, setAiKeywords] = useState("");
  const [aiGenerationMode, setAiGenerationMode] =
    useState<ThemeGenerationMode>("inspired");
  const [aiSelectedModel, setAiSelectedModel] = useState<ThemeGenerationModel>(
    DEFAULT_THEME_GENERATION_MODEL,
  );
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Track if dialog is open to prevent orphaned uploads from adding images after close
  const isDialogOpenRef = useRef(isDialogOpen);

  // URL-based generation state
  const [inputSource, setInputSource] = useState<ThemeInputSource>("images");
  const [websiteUrl, setWebsiteUrl] = useState("");

  const generatePromptMutation = useGenerateThemePrompt();
  const generateFromUrlMutation = useGenerateThemeFromUrl();
  const isGenerating =
    generatePromptMutation.isPending || generateFromUrlMutation.isPending;
  const { userBudget } = useUserBudgetInfo();

  // Cleanup function to revoke blob URLs and delete temp files
  const cleanupImages = useCallback(
    async (images: ThemeImage[], showErrors = false) => {
      // Revoke blob URLs to free memory
      images.forEach((img) => {
        URL.revokeObjectURL(img.preview);
      });

      // Delete temp files via IPC
      const paths = images.map((img) => img.path);
      if (paths.length > 0) {
        try {
          await ipc.template.cleanupThemeImages({ paths });
        } catch {
          if (showErrors) {
            showError("Error al limpiar los archivos de imagen temporales");
          }
        }
      }
    },
    [],
  );

  // Keep ref in sync with isDialogOpen prop
  useEffect(() => {
    isDialogOpenRef.current = isDialogOpen;
  }, [isDialogOpen]);

  // Keep a ref to current images for cleanup without causing effect re-runs
  const aiImagesRef = useRef<ThemeImage[]>([]);
  useEffect(() => {
    aiImagesRef.current = aiImages;
  }, [aiImages]);

  // Cleanup images and reset state when dialog closes
  useEffect(() => {
    if (!isDialogOpen) {
      // Use ref to get current images to avoid dependency on aiImages
      const imagesToCleanup = aiImagesRef.current;
      if (imagesToCleanup.length > 0) {
        cleanupImages(imagesToCleanup);
        setAiImages([]);
      }
      setAiKeywords("");
      setAiGenerationMode("inspired");
      setAiSelectedModel(DEFAULT_THEME_GENERATION_MODEL);
      setInputSource("images");
      setWebsiteUrl("");
    }
  }, [isDialogOpen, cleanupImages]);

  const handleImageUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;

      const availableSlots = MAX_IMAGES - aiImages.length;
      if (availableSlots <= 0) {
        showError(`Se permiten un máximo de ${MAX_IMAGES} imágenes`);
        return;
      }

      const filesToProcess = Array.from(files).slice(0, availableSlots);
      const skippedCount = files.length - filesToProcess.length;

      if (skippedCount > 0) {
        showError(
          `Solo se pueden añadir ${availableSlots} imagen${availableSlots === 1 ? "" : "es"}. Se ha${skippedCount === 1 ? "" : "n"} omitido ${skippedCount} archivo${skippedCount === 1 ? "" : "s"}.`,
        );
      }

      setIsUploading(true);

      try {
        const newImages: ThemeImage[] = [];

        for (const file of filesToProcess) {
          // Validate file type
          if (!file.type.startsWith("image/")) {
            showError(
              `Por favor, sube solo archivos de imagen. "${file.name}" no es una imagen válida.`,
            );
            continue;
          }

          // Validate file size (raw file size)
          if (file.size > MAX_FILE_SIZE) {
            const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
            showError(
              `El archivo "${file.name}" excede el límite de 10MB (${sizeMB}MB)`,
            );
            continue;
          }

          try {
            // Read file as base64 for upload
            const base64Data = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onerror = () =>
                reject(new Error("Error al leer el archivo"));
              reader.onload = () => {
                const base64 = reader.result as string;
                const data = base64.split(",")[1];
                if (!data) {
                  reject(new Error("Error al extraer los datos de la imagen"));
                  return;
                }
                resolve(data);
              };
              reader.readAsDataURL(file);
            });

            // Save to temp file via IPC
            const result = await ipc.template.saveThemeImage({
              data: base64Data,
              filename: file.name,
            });

            // Create blob URL for preview (much more memory efficient than base64 in DOM)
            const preview = URL.createObjectURL(file);

            newImages.push({
              path: result.path,
              preview,
            });
          } catch (err) {
            showError(
              `Error al procesar "${file.name}": ${err instanceof Error ? err.message : "Error desconocido"}`,
            );
          }
        }

        if (newImages.length > 0) {
          // Check if dialog was closed while upload was in progress
          if (!isDialogOpenRef.current) {
            // Dialog closed - cleanup orphaned images immediately
            await cleanupImages(newImages);
            return;
          }

          setAiImages((prev) => {
            // Double-check limit in case of race conditions
            const remaining = MAX_IMAGES - prev.length;
            return [...prev, ...newImages.slice(0, remaining)];
          });
        }
      } finally {
        setIsUploading(false);
        // Reset input
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [aiImages.length, cleanupImages],
  );

  const handleRemoveImage = useCallback(
    async (index: number) => {
      const imageToRemove = aiImages[index];
      if (imageToRemove) {
        // Cleanup the removed image - show errors since this is a user action
        await cleanupImages([imageToRemove], true);
      }
      setAiImages((prev) => prev.filter((_, i) => i !== index));
    },
    [aiImages, cleanupImages],
  );

  const handleGenerate = useCallback(async () => {
    if (inputSource === "images") {
      // Image-based generation
      if (aiImages.length === 0) {
        showError("Por favor, sube al menos una imagen");
        return;
      }

      try {
        const result = await generatePromptMutation.mutateAsync({
          imagePaths: aiImages.map((img) => img.path),
          keywords: aiKeywords,
          generationMode: aiGenerationMode,
          model: aiSelectedModel,
        });
        setAiGeneratedPrompt(result.prompt);
        toast.success("Prompt del tema generado correctamente");
      } catch (error) {
        showError(
          `Error al generar el tema: ${error instanceof Error ? error.message : "Error desconocido"}`,
        );
      }
    } else {
      // URL-based generation
      if (!websiteUrl.trim()) {
        showError("Por favor, introduce la URL de un sitio web");
        return;
      }

      try {
        const result = await generateFromUrlMutation.mutateAsync({
          url: websiteUrl,
          keywords: aiKeywords,
          generationMode: aiGenerationMode,
          model: aiSelectedModel,
        });

        setAiGeneratedPrompt(result.prompt);
        toast.success("Prompt del tema generado a partir del sitio web");
      } catch (error) {
        showError(
          `Error al generar el tema: ${error instanceof Error ? error.message : "Error desconocido"}`,
        );
      }
    }
  }, [
    inputSource,
    aiImages,
    websiteUrl,
    aiKeywords,
    aiGenerationMode,
    aiSelectedModel,
    generatePromptMutation,
    generateFromUrlMutation,
    setAiGeneratedPrompt,
  ]);

  // Show Pro-only locked state for non-Pro users
  if (!userBudget) {
    return (
      <div className="space-y-4 mt-4">
        <div className="flex flex-col items-center justify-center py-8 px-4 border-2 border-dashed border-muted-foreground/25 rounded-lg bg-muted/10">
          <Lock className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold text-center mb-2">
            Generador de temas por IA
          </h3>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            Sube capturas de pantalla y deja que la IA genere un prompt de tema
            personalizado adaptado a tu estilo de diseño.
          </p>
          <p className="text-xs text-muted-foreground/70 mt-2">
            Función exclusiva Pro
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 mt-4">
      <div className="space-y-2">
        <Label htmlFor="ai-name">Nombre del tema</Label>
        <Input
          id="ai-name"
          placeholder="Mi tema generado por IA"
          value={aiName}
          onChange={(e) => setAiName(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="ai-description">Descripción (opcional)</Label>
        <Input
          id="ai-description"
          placeholder="Una breve descripción de tu tema"
          value={aiDescription}
          onChange={(e) => setAiDescription(e.target.value)}
        />
      </div>

      {/* Reference Source Selection */}
      <div className="space-y-3">
        <Label>Fuente de referencia</Label>
        <div className="grid grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => setInputSource("images")}
            className={`flex flex-col items-center rounded-lg border p-3 text-center transition-colors ${inputSource === "images"
              ? "border-primary bg-primary/5"
              : "hover:bg-muted/50"
              }`}
          >
            <Upload className="h-5 w-5 mb-1" />
            <span className="font-medium text-sm">Subir imágenes</span>
            <span className="text-xs text-muted-foreground mt-1">
              Usa capturas de pantalla de tu dispositivo
            </span>
          </button>
          <button
            type="button"
            onClick={() => setInputSource("url")}
            className={`flex flex-col items-center rounded-lg border p-3 text-center transition-colors ${inputSource === "url"
              ? "border-primary bg-primary/5"
              : "hover:bg-muted/50"
              }`}
          >
            <Link className="h-5 w-5 mb-1" />
            <span className="font-medium text-sm">URL del sitio web</span>
            <span className="text-xs text-muted-foreground mt-1">
              Extrae el diseño de un sitio web en vivo
            </span>
          </button>
        </div>
      </div>

      {/* Image Upload Section - only shown when inputSource is "images" */}
      {inputSource === "images" && (
        <div className="space-y-2">
          <Label>Imágenes de referencia</Label>
          <div
            className={`border-2 border-dashed border-muted-foreground/25 rounded-lg p-4 text-center cursor-pointer hover:border-muted-foreground/50 transition-colors ${isUploading ? "opacity-50 pointer-events-none" : ""}`}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleImageUpload}
              disabled={isUploading}
            />
            {isUploading ? (
              <Loader2 className="h-8 w-8 mx-auto text-muted-foreground mb-2 animate-spin" />
            ) : (
              <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            )}
            <p className="text-sm text-muted-foreground">
              {isUploading ? "Subiendo..." : "Haz clic para subir imágenes"}
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Sube capturas de la interfaz para inspirar tu tema
            </p>
          </div>

          {/* Image counter */}
          <p className="text-xs text-muted-foreground mt-2 text-center">
            {aiImages.length} / {MAX_IMAGES} imágenes
            {aiImages.length >= MAX_IMAGES && (
              <span className="text-destructive ml-2">• Límite alcanzado</span>
            )}
          </p>

          {/* Image Preview */}
          {aiImages.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {aiImages.map((img, index) => (
                <div key={img.path} className="relative group">
                  <img
                    src={img.preview}
                    alt={`Upload ${index + 1}`}
                    className="h-16 w-16 object-cover rounded-md border"
                  />
                  <button
                    onClick={() => handleRemoveImage(index)}
                    className="absolute -top-2 -right-2 bg-destructive text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* URL Input Section - only shown when inputSource is "url" */}
      {inputSource === "url" && (
        <div className="space-y-2">
          <Label htmlFor="website-url">URL del sitio web</Label>
          <Input
            id="website-url"
            type="url"
            placeholder="https://ejemplo.com"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            disabled={isGenerating}
          />
          <p className="text-xs text-muted-foreground">
            Introduce la URL de un sitio web para extraer su sistema de diseño
          </p>
        </div>
      )}

      {/* Keywords Input */}
      <div className="space-y-2">
        <Label htmlFor="ai-keywords">Palabras clave (opcional)</Label>
        <Input
          id="ai-keywords"
          placeholder="moderno, minimalista, modo oscuro, glassmorphism..."
          value={aiKeywords}
          onChange={(e) => setAiKeywords(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Añade palabras clave o diseños de referencia para guiar la generación
        </p>
      </div>

      {/* Generation Mode Selection */}
      <div className="space-y-3">
        <Label>Modo de generación</Label>
        <div className="grid grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => setAiGenerationMode("inspired")}
            className={`flex flex-col items-start rounded-lg border p-3 text-left transition-colors ${aiGenerationMode === "inspired"
              ? "border-primary bg-primary/5"
              : "hover:bg-muted/50"
              }`}
          >
            <span className="font-medium">Inspirado</span>
            <span className="text-xs text-muted-foreground mt-1">
              Extrae un sistema de diseño abstracto y reutilizable. No replica
              la interfaz original.
            </span>
          </button>
          <button
            type="button"
            onClick={() => setAiGenerationMode("high-fidelity")}
            className={`flex flex-col items-start rounded-lg border p-3 text-left transition-colors ${aiGenerationMode === "high-fidelity"
              ? "border-primary bg-primary/5"
              : "hover:bg-muted/50"
              }`}
          >
            <span className="font-medium">Alta fidelidad</span>
            <span className="text-xs text-muted-foreground mt-1">
              Recrea el sistema visual de la imagen lo más fielmente posible.
            </span>
          </button>
        </div>
      </div>

      {/* Model Selection */}
      <div className="space-y-3">
        <Label>Selección de modelo</Label>
        <div className="grid grid-cols-3 gap-3">
          <button
            type="button"
            onClick={() => setAiSelectedModel("gemini-3-pro")}
            className={`flex flex-col items-center rounded-lg border p-3 text-center transition-colors ${aiSelectedModel === "gemini-3-pro"
              ? "border-primary bg-primary/5"
              : "hover:bg-muted/50"
              }`}
          >
            <span className="font-medium text-sm">Gemini 3 Pro</span>
            <span className="text-xs text-muted-foreground mt-1">
              Más capaz
            </span>
          </button>
          <button
            type="button"
            onClick={() => setAiSelectedModel("claude-opus-4.5")}
            className={`flex flex-col items-center rounded-lg border p-3 text-center transition-colors ${aiSelectedModel === "claude-opus-4.5"
              ? "border-primary bg-primary/5"
              : "hover:bg-muted/50"
              }`}
          >
            <span className="font-medium text-sm">Claude Opus 4.5</span>
            <span className="text-xs text-muted-foreground mt-1">
              Creativo y detallado
            </span>
          </button>
          <button
            type="button"
            onClick={() => setAiSelectedModel("gpt-5.2")}
            className={`flex flex-col items-center rounded-lg border p-3 text-center transition-colors ${aiSelectedModel === "gpt-5.2"
              ? "border-primary bg-primary/5"
              : "hover:bg-muted/50"
              }`}
          >
            <span className="font-medium text-sm">GPT 5.2</span>
            <span className="text-xs text-muted-foreground mt-1">
              Último de OpenAI
            </span>
          </button>
        </div>
      </div>

      {/* Generate Button */}
      <Button
        onClick={handleGenerate}
        disabled={
          isGenerating ||
          (inputSource === "images" && aiImages.length === 0) ||
          (inputSource === "url" && !websiteUrl.trim())
        }
        variant="secondary"
        className="w-full"
      >
        {isGenerating ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {inputSource === "url"
              ? "Generando desde el sitio web..."
              : "Generando prompt..."}
          </>
        ) : (
          <>
            <Sparkles className="mr-2 h-4 w-4" />
            Generar prompt del tema
          </>
        )}
      </Button>

      {/* Generated Prompt Display */}
      <div className="space-y-2">
        <Label htmlFor="ai-prompt">Prompt generado</Label>
        {aiGeneratedPrompt ? (
          <Textarea
            id="ai-prompt"
            className="min-h-[200px] font-mono text-sm"
            value={aiGeneratedPrompt}
            onChange={(e) => setAiGeneratedPrompt(e.target.value)}
            placeholder="El prompt generado aparecerá aquí..."
          />
        ) : (
          <div className="min-h-[100px] border rounded-md p-4 flex items-center justify-center text-muted-foreground text-sm text-center">
            Todavía no se ha generado ningún prompt.{" "}
            {inputSource === "images"
              ? 'Sube imágenes y haz clic en "Generar" para crear un prompt de tema.'
              : 'Introduce la URL de un sitio web y haz clic en "Generar" para extraer un tema.'}
          </div>
        )}
      </div>

      {/* Save Button - only show when prompt is generated */}
      {aiGeneratedPrompt && (
        <Button
          onClick={onSave}
          disabled={isSaving || !aiName.trim()}
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
      )}
    </div>
  );
}
