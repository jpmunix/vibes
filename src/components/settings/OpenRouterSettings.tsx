import { useState, useEffect } from "react";
import { useSettings } from "@/hooks/useSettings";
import { useLanguageModelProviders } from "@/hooks/useLanguageModelProviders";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  KeyRound,
  Trash2,
  Valid, // Wait, Lucide might not have Valid. Check or use Check.
  Check,
  Plus,
  ExternalLink,
  MoreVertical,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { showError, showSuccess } from "@/lib/toast";
import { ModelsSection } from "./ModelsSection";
import { cn } from "@/lib/utils";
import { TurboEditModelSelector } from "@/components/TurboEditModelSelector";
import { AppTitleModelSelector } from "@/components/AppTitleModelSelector";
import { TodoAnalysisModelSelector } from "@/components/TodoAnalysisModelSelector";
import { DebateModelSelector } from "@/components/debate/DebateModelSelector";
import { SummaryModelSelector } from "@/components/debate/SummaryModelSelector";
import { KnowledgeModelSelector } from "@/components/KnowledgeModelSelector";
import { DossierModelSelector } from "@/components/DossierModelSelector";

export function OpenRouterSettings({
  isHighlighted,
}: {
  isHighlighted?: boolean;
}) {
  const {
    settings,
    loading: settingsLoading,
    updateSettings,
  } = useSettings();

  const { data: allProviders, isLoading: providersLoading } =
    useLanguageModelProviders();

  const providerId = "openrouter";
  const providerData = allProviders?.find((p) => p.id === providerId);

  const [newKeyInput, setNewKeyInput] = useState("");
  const [newKeyAlias, setNewKeyAlias] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [keyToDelete, setKeyToDelete] = useState<string | null>(null);

  // Cast to any to access new custom properties if TS doesn't pick them up immediately
  const openRouterSettings = settings?.providerSettings?.[providerId] as any;
  const keys = (openRouterSettings?.keys || []) as Array<{ id: string; key: { value: string }; alias?: string }>;
  const selectedKeyId = openRouterSettings?.selectedKeyId;
  const legacyApiKey = openRouterSettings?.apiKey?.value;

  // Auto-migrate legacy key
  useEffect(() => {
    if (legacyApiKey && (!keys || keys.length === 0)) {
      const newId = crypto.randomUUID();
      updateSettings({
        providerSettings: {
          ...settings?.providerSettings,
          [providerId]: {
            ...openRouterSettings,
            keys: [{ id: newId, key: { value: legacyApiKey }, alias: "Clave Principal" }],
            selectedKeyId: newId,
            apiKey: undefined,
          },
        },
      });
    }
  }, [legacyApiKey, keys, updateSettings, settings, openRouterSettings]);

  const handleAddKey = async () => {
    if (!newKeyInput.trim()) {
      showError("La clave API no puede estar vacía.");
      return;
    }

    setIsSaving(true);
    try {
      const newId = crypto.randomUUID();
      const newKeyEntry = {
        id: newId,
        key: { value: newKeyInput.trim() },
        alias: newKeyAlias.trim() || `Clave ${keys.length + 1}`,
      };

      const newKeys = [...keys, newKeyEntry];
      // If it's the first key, make it selected
      const newSelectedId = keys.length === 0 ? newId : selectedKeyId;

      await updateSettings({
        providerSettings: {
          ...settings?.providerSettings,
          [providerId]: {
            ...openRouterSettings,
            keys: newKeys,
            selectedKeyId: newSelectedId,
          },
        },
      });

      setNewKeyInput("");
      setNewKeyAlias("");
      setShowAddForm(false);
      showSuccess("Clave API añadida con éxito");
    } catch (error: any) {
      showError(error.message || "Error al añadir la clave API.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteKey = async (id: string) => {
    setIsSaving(true);
    try {
      const newKeys = keys.filter((k) => k.id !== id);
      let newSelectedId = selectedKeyId;

      // If we deleted the selected key, select another one if available
      if (id === selectedKeyId) {
        newSelectedId = newKeys.length > 0 ? newKeys[0].id : undefined;
      }

      await updateSettings({
        providerSettings: {
          ...settings?.providerSettings,
          [providerId]: {
            ...openRouterSettings,
            keys: newKeys,
            selectedKeyId: newSelectedId,
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

  const handleSelectKey = async (id: string) => {
    setIsSaving(true);
    try {
      await updateSettings({
        providerSettings: {
          ...settings?.providerSettings,
          [providerId]: {
            ...openRouterSettings,
            selectedKeyId: id,
          },
        },
      });
      showSuccess("Clave API seleccionada como predeterminada");
    } catch (error: any) {
      showError("Error al seleccionar la clave API");
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
    <>
      <div
        id="openrouter-settings"
        className={cn(
          "bg-card rounded-2xl shadow-sm p-8 border border-border transition-[border-color,box-shadow] duration-300",
          isHighlighted
            ? "ring-2 ring-primary ring-offset-4 ring-offset-muted/30"
            : "",
        )}
      >
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Modelos e IA
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Configura tu acceso a cientos de modelos de IA a través de OpenRouter
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
          {/* API Keys List Section */}
          <div className="space-y-4">
            <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground/60 px-1">
              Mis Claves API
            </Label>

            {keys.length === 0 ? (
              <Alert className="bg-amber-500/5 border-amber-500/20 rounded-2xl p-6">
                <KeyRound className="h-5 w-5 text-amber-600" />
                <div className="ml-3">
                  <AlertTitle className="text-base font-bold text-amber-600">
                    Sin claves configuradas
                  </AlertTitle>
                  <AlertDescription className="text-sm opacity-70 mt-1">
                    Añade una clave API para comenzar a usar los servicios.
                  </AlertDescription>
                </div>
              </Alert>
            ) : (
              <div className="space-y-3">
                {keys.map((key) => {
                  const isSelected = key.id === selectedKeyId;
                  return (
                    <div
                      key={key.id}
                      className={cn(
                        "flex items-center justify-between p-4 rounded-xl border transition-colors",
                        isSelected
                          ? "bg-primary/5 border-primary/30 shadow-sm"
                          : "bg-card border-border hover:border-border/80"
                      )}
                    >
                      <div className="flex items-center gap-4 overflow-hidden">
                        <div className={cn(
                          "flex items-center justify-center w-10 h-10 rounded-full shrink-0",
                          isSelected ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                        )}>
                          <KeyRound className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-sm truncate">
                              {key.alias || "Sin nombre"}
                            </p>
                          </div>
                          <p className="text-xs font-mono text-muted-foreground truncate">
                            {key.key.value.substring(0, 8)}...{key.key.value.substring(key.key.value.length - 4)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {!isSelected ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSelectKey(key.id)}
                            disabled={isSaving}
                            className="h-8 px-3 text-xs"
                          >
                            Usar
                          </Button>
                        ) : (
                          <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary hover:bg-primary/20 border-primary/20">
                            Predeterminada
                          </Badge>
                        )}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive cursor-pointer"
                              onClick={() => setKeyToDelete(key.id)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              <span>Eliminar</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Add New Key Section */}
          <div className="p-6 rounded-2xl bg-muted/30 border border-border space-y-4">

            {!showAddForm ? (
              <Button
                variant="ghost"
                className="w-full justify-start text-muted-foreground hover:text-primary"
                onClick={() => setShowAddForm(true)}
              >
                <Plus className="h-4 w-4 mr-2" /> Añadir Nueva Clave
              </Button>
            ) : (
              <>
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Plus className="h-4 w-4" /> Añadir Nueva Clave
                </h3>
                <div className="grid gap-4 md:grid-cols-[1fr,2fr,auto]">
                  <div className="space-y-2">
                    <Label htmlFor="alias" className="text-xs">Alias (Opcional)</Label>
                    <Input
                      id="alias"
                      placeholder="Ej: Clave Personal"
                      value={newKeyAlias}
                      onChange={(e) => setNewKeyAlias(e.target.value)}
                      className="h-10 bg-background"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="apiKey" className="text-xs">API Key</Label>
                    <Input
                      id="apiKey"
                      type="password"
                      placeholder="sk-or-v1-..."
                      value={newKeyInput}
                      onChange={(e) => setNewKeyInput(e.target.value)}
                      className="h-10 bg-background"
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <Button
                      variant="ghost"
                      onClick={() => setShowAddForm(false)}
                      className="h-10 px-4"
                    >
                      Cancelar
                    </Button>
                    <Button
                      onClick={handleAddKey}
                      disabled={isSaving || !newKeyInput}
                      className="h-10 px-6 font-bold"
                    >
                      {isSaving ? "Guardando..." : "Añadir"}
                    </Button>
                  </div>
                </div>
              </>
            )}
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
                    Genera el título de la aplicación a partir de tu prompt
                    inicial.
                  </p>
                </div>
              </div>
              <div className="space-y-4">
                <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground/60 px-1">
                  Turbo Edits
                </Label>
                <div className="p-5 rounded-2xl bg-muted/30 border border-border space-y-4">
                  <TurboEditModelSelector />
                  <p className="text-[11px] text-muted-foreground leading-relaxed px-1">
                    Modelo optimizado para ediciones rápidas de archivos.
                  </p>
                </div>
              </div>
              <div className="space-y-4">
                <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground/60 px-1">
                  Análisis de Tareas
                </Label>
                <div className="p-5 rounded-2xl bg-muted/30 border border-border space-y-4">
                  <TodoAnalysisModelSelector />
                  <p className="text-[11px] text-muted-foreground leading-relaxed px-1">
                    Extrae tareas de archivos adjuntos (PDF, imágenes, etc.).
                  </p>
                </div>
              </div>
              <div className="space-y-4">
                <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground/60 px-1">
                  Módulo de Debate
                </Label>
                <div className="p-5 rounded-2xl bg-muted/30 border border-border space-y-4">
                  <DebateModelSelector />
                  <p className="text-[11px] text-muted-foreground leading-relaxed px-1">
                    Modelo principal para los hilos de debate.
                  </p>
                </div>
              </div>
              <div className="space-y-4">
                <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground/60 px-1">
                  Resúmenes de Debates
                </Label>
                <div className="p-5 rounded-2xl bg-muted/30 border border-border space-y-4">
                  <SummaryModelSelector />
                  <p className="text-[11px] text-muted-foreground leading-relaxed px-1">
                    Modelo ligero para generar los puntos clave de un debate.
                  </p>
                </div>
              </div>
              <div className="space-y-4">
                <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground/60 px-1">
                  Base de Conocimientos
                </Label>
                <div className="p-5 rounded-2xl bg-muted/30 border border-border space-y-4">
                  <KnowledgeModelSelector />
                  <p className="text-[11px] text-muted-foreground leading-relaxed px-1">
                    Modelo para analizar conversaciones y extraer reglas del
                    proyecto automáticamente.
                  </p>
                </div>
              </div>
              <div className="space-y-4">
                <Label className="text-sm font-bold uppercase tracking-widest text-muted-foreground/60 px-1">
                  Dossier de la App
                </Label>
                <div className="p-5 rounded-2xl bg-muted/30 border border-border space-y-4">
                  <DossierModelSelector />
                  <p className="text-[11px] text-muted-foreground leading-relaxed px-1">
                    Modelo para generar el dossier técnico (tutorial + memoria).
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

      {/* Delete Key Confirmation Dialog */}
      <AlertDialog
        open={!!keyToDelete}
        onOpenChange={(open) => !open && setKeyToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar clave API?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. La clave será eliminada permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (keyToDelete) {
                  handleDeleteKey(keyToDelete);
                  setKeyToDelete(null);
                }
              }}
              className="bg-destructive hover:bg-destructive/90 text-white"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
