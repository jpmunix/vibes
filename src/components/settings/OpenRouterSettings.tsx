import { useState, useEffect } from "react";
import { useSettings } from "@/hooks/useSettings";
import { useLanguageModelProviders } from "@/hooks/useLanguageModelProviders";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  KeyRound,
  Trash2,
  Clipboard,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { showError, showSuccess } from "@/lib/toast";
import { TurboEditModelSelector } from "@/components/TurboEditModelSelector";
import { AppTitleModelSelector } from "@/components/AppTitleModelSelector";
import { TodoAnalysisModelSelector } from "@/components/TodoAnalysisModelSelector";
import { ModelsSection } from "./ModelsSection";
import { cn } from "@/lib/utils";

export function OpenRouterSettings({
  isHighlighted,
}: {
  isHighlighted?: boolean;
}) {
  const {
    settings,
    envVars,
    loading: settingsLoading,
    updateSettings,
  } = useSettings();

  const { data: allProviders, isLoading: providersLoading } =
    useLanguageModelProviders();

  const providerId = "openrouter";
  const providerData = allProviders?.find((p) => p.id === providerId);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const envVarName = providerData?.envVarName;
  const userApiKey = settings?.providerSettings?.[providerId]?.apiKey?.value;
  const envApiKey = envVarName ? envVars[envVarName] : undefined;

  const isValidUserKey =
    !!userApiKey &&
    !userApiKey.startsWith("Invalid Key") &&
    userApiKey !== "Not Set";
  const hasEnvKey = !!envApiKey;

  const handleSaveKey = async (value: string) => {
    if (!value.trim()) {
      setSaveError("La clave API no puede estar vacía.");
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    try {
      await updateSettings({
        providerSettings: {
          ...settings?.providerSettings,
          [providerId]: {
            ...settings?.providerSettings?.[providerId],
            apiKey: {
              value: value.trim(),
            },
          },
        },
      });
      setApiKeyInput("");
      showSuccess("Clave API guardada con éxito");
    } catch (error: any) {
      setSaveError(error.message || "Error al guardar la clave API.");
      showError("Error al guardar la clave API.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteKey = async () => {
    setIsSaving(true);
    try {
      await updateSettings({
        providerSettings: {
          ...settings?.providerSettings,
          [providerId]: {
            ...settings?.providerSettings?.[providerId],
            apiKey: undefined,
          },
        },
      });
      showSuccess("Clave API eliminada");
    } catch (error: any) {
      showError("Error al eliminar la clave API");
    } finally {
      setIsSaving(false);
    }
  };

  if (providersLoading || settingsLoading) {
    return (
      <div className="bg-card rounded-2xl shadow-sm p-8 border border-border">
        <Skeleton className="h-8 w-48 mb-6" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div
      id="openrouter-settings"
      className={cn(
        "bg-card rounded-2xl shadow-sm p-8 border border-border transition-all duration-300",
        isHighlighted
          ? "ring-2 ring-primary ring-offset-4 ring-offset-muted/30"
          : "",
      )}
    >
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            OpenRouter
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Configura tu acceso a cientos de modelos de IA a través de
            OpenRouter
          </p>
        </div>
        {providerData?.websiteUrl && (
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="text-primary hover:text-primary hover:bg-primary/5 rounded-xl border border-transparent hover:border-primary/20"
          >
            <a
              href={providerData.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 font-bold uppercase tracking-widest text-[10px]"
            >
              Obtener API Key <ExternalLink className="h-3 w-3" />
            </a>
          </Button>
        )}
      </div>

      <div className="space-y-8">
        {/* API Key Section */}
        <div className="space-y-4">
          <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground/60 px-1">
            Configuración de Clave API
          </Label>

          <div className="space-y-4">
            {isValidUserKey ? (
              <Alert className="bg-primary/5 border-primary/20 rounded-2xl p-6">
                <KeyRound className="h-5 w-5 text-primary" />
                <div className="flex justify-between items-center w-full">
                  <div className="ml-3">
                    <AlertTitle className="text-base font-bold text-primary">
                      Clave Activa
                    </AlertTitle>
                    <AlertDescription className="font-mono text-sm opacity-70 mt-1">
                      {userApiKey.substring(0, 8)}...
                      {userApiKey.substring(userApiKey.length - 4)}
                    </AlertDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDeleteKey}
                    disabled={isSaving}
                    className="text-destructive hover:bg-destructive/10 rounded-xl h-10 px-4 font-bold"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Eliminar
                  </Button>
                </div>
              </Alert>
            ) : hasEnvKey ? (
              <Alert className="bg-green-500/5 border-green-500/20 rounded-2xl p-6">
                <KeyRound className="h-5 w-5 text-green-600" />
                <div className="ml-3">
                  <AlertTitle className="text-base font-bold text-green-600">
                    Usando Variable de Entorno
                  </AlertTitle>
                  <AlertDescription className="text-sm opacity-70 mt-1">
                    Se ha detectado una clave en la variable{" "}
                    <code>{envVarName}</code>.
                  </AlertDescription>
                </div>
              </Alert>
            ) : (
              <Alert className="bg-amber-500/5 border-amber-500/20 rounded-2xl p-6">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                <div className="ml-3">
                  <AlertTitle className="text-base font-bold text-amber-600">
                    Configuración Pendiente
                  </AlertTitle>
                  <AlertDescription className="text-sm opacity-70 mt-1">
                    Necesitas una clave API de OpenRouter para usar las
                    funciones de IA.
                  </AlertDescription>
                </div>
              </Alert>
            )}

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type="password"
                  placeholder="Introduce tu OpenRouter API Key"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  className={cn(
                    "rounded-xl h-12 border-border bg-muted/30 focus-visible:ring-primary/20",
                    saveError &&
                      "border-destructive focus-visible:ring-destructive/20",
                  )}
                />
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={async () => {
                      const text = await navigator.clipboard.readText();
                      if (text) handleSaveKey(text);
                    }}
                    variant="outline"
                    className="rounded-xl h-12 w-12 p-0 border-border hover:bg-muted"
                  >
                    <Clipboard className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Pegar y guardar</TooltipContent>
              </Tooltip>
              <Button
                onClick={() => handleSaveKey(apiKeyInput)}
                disabled={isSaving || !apiKeyInput}
                className="rounded-xl h-12 px-6 font-bold"
              >
                {isSaving ? "Guardando..." : "Guardar"}
              </Button>
            </div>
            {saveError && (
              <p className="text-xs text-destructive px-1">{saveError}</p>
            )}
          </div>
        </div>

        {/* Utility Models Section */}
        <div className="pt-8 border-t border-border">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground/60 px-1">
                Títulos de Apps
              </Label>
              <div className="p-5 rounded-2xl bg-muted/30 border border-border space-y-4">
                <AppTitleModelSelector />
                <p className="text-[11px] text-muted-foreground leading-relaxed px-1">
                  Configura el modelo que OpenRouter utilizará para generar el
                  título de la aplicación a partir de tu prompt inicial. Por
                  defecto:{" "}
                  <code className="bg-muted px-1 rounded text-[10px]">
                    openai/gpt-4.1-nano
                  </code>
                </p>
              </div>
            </div>
            <div className="space-y-4">
              <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground/60 px-1">
                Análisis de Tareas (Smart Import)
              </Label>
              <div className="p-5 rounded-2xl bg-muted/30 border border-border space-y-4">
                <TodoAnalysisModelSelector />
                <p className="text-[11px] text-muted-foreground leading-relaxed px-1">
                  Este modelo extrae automáticamente tareas de archivos adjuntos
                  (PDF, imágenes, etc.). Por defecto:{" "}
                  <code className="bg-muted px-1 rounded text-[10px]">
                    google/gemini-3-flash-preview
                  </code>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Custom Models Section */}
        <div className="pt-6">
          <ModelsSection providerId={providerId} />
        </div>
      </div>
    </div>
  );
}
