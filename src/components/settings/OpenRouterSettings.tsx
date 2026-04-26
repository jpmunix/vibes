import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { useSettings } from "@/hooks/useSettings";
import { useLanguageModelProviders } from "@/hooks/useLanguageModelProviders";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Trash2,
  Plus,
  ChevronRight,
} from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Button } from "@/components/ui/button";
import { showError, showSuccess } from "@/lib/toast";
import { ModelsSection } from "./ModelsSection";
import { AddModelDialog } from "./AddModelDialog";
import { cn } from "@/lib/utils";

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

  const queryClient = useQueryClient();
  const providerId = "openrouter";
  const providerData = allProviders?.find((p) => p.id === providerId);

  const [newKeyInput, setNewKeyInput] = useState("");
  const [newKeyAlias, setNewKeyAlias] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [keyToDelete, setKeyToDelete] = useState<string | null>(null);
  const [modelsExpanded, setModelsExpanded] = useState(false);
  const openAddModelsRef = useRef<(() => void) | null>(null);



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

      // If it's the first key, refetch credits for the new key
      if (keys.length === 0) {
        queryClient.invalidateQueries({ queryKey: queryKeys.system.openRouterCredits });
      }

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
      queryClient.invalidateQueries({ queryKey: queryKeys.system.openRouterCredits });
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
      // Refetch credits for the newly selected key
      queryClient.invalidateQueries({ queryKey: queryKeys.system.openRouterCredits });
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
        id="models-connectivity"
        className={cn(
          "bg-card rounded-2xl shadow-sm p-8 border border-border transition-[border-color,box-shadow] duration-300",
          isHighlighted
            ? "ring-2 ring-primary ring-offset-4 ring-offset-muted/30"
            : "",
        )}
      >
        <div className="mb-8">
          <h2 className="typo-section-title">
            OpenRouter
          </h2>
          <p className="typo-caption mt-1">
            Configura tu acceso a cientos de modelos de IA a través de OpenRouter
          </p>
        </div>

        <div className="space-y-4">
          {/* API Keys - Pill Select */}
          <div className="flex justify-between gap-8 p-4 rounded-xl hover:bg-muted/50 transition-colors items-center">
            <div className="flex-1">
              <h3 className="typo-label">Clave API activa</h3>
              <p className="typo-caption mt-1">
                Gestiona tus claves de acceso a OpenRouter
              </p>
            </div>
            <div onClick={(e) => e.stopPropagation()}>
              {keys.length === 0 ? (
                <button
                  type="button"
                  onClick={() => setShowAddForm(true)}
                  className="px-4 py-1.5 typo-select rounded-lg bg-primary text-primary-foreground shadow-sm cursor-pointer hover:brightness-110 transition-all duration-200"
                >
                  Añadir clave
                </button>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="border-0 bg-primary dark:bg-primary text-primary-foreground dark:text-primary-foreground shadow-sm rounded-lg px-4 py-1.5 h-auto typo-select hover:brightness-110 dark:hover:bg-primary transition-all duration-200 w-auto gap-2 cursor-pointer flex items-center"
                    >
                      {keys.find(k => k.id === selectedKeyId)?.alias || "Seleccionar"}
                      <ChevronRight className="h-4 w-4 rotate-90 opacity-70" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[260px]">
                    {keys.map((key) => {
                      const isSelected = key.id === selectedKeyId;
                      return (
                        <DropdownMenuItem
                          key={key.id}
                          className={cn(
                            "cursor-pointer flex items-center justify-between gap-4 py-2.5",
                            isSelected && "bg-primary/10"
                          )}
                          onSelect={(e) => {
                            e.preventDefault();
                            handleSelectKey(key.id);
                          }}
                        >
                          <div className="flex flex-col min-w-0">
                            <span className={cn("!font-semibold truncate", isSelected && "")}>
                              {key.alias || "Sin nombre"}
                            </span>
                            <span className="typo-mono-xs truncate">
                              {`${key.key.value.substring(0, 8)}...${key.key.value.substring(key.key.value.length - 4)}`}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              setKeyToDelete(key.id);
                            }}
                            className="shrink-0 p-1.5 rounded-md text-muted-foreground/40 hover:!text-red-600 hover:!bg-red-100 dark:hover:!bg-red-900/20 transition-colors cursor-pointer"
                            title="Eliminar clave"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </DropdownMenuItem>
                      );
                    })}
                    <DropdownMenuItem
                      className="cursor-pointer text-primary py-2.5 border-t border-border mt-1"
                      onSelect={() => setShowAddForm(true)}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Añadir nueva...
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>


          {/* Add New Key Dialog */}
          <Dialog open={showAddForm} onOpenChange={setShowAddForm}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Plus className="h-4 w-4" /> Añadir Nueva Clave
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="alias" className="typo-label">Alias (Opcional)</Label>
                  <Input
                    id="alias"
                    placeholder="Ej: Clave Personal"
                    value={newKeyAlias}
                    onChange={(e) => setNewKeyAlias(e.target.value)}
                    className="h-10 bg-background typo-input"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="apiKey" className="typo-label">API Key</Label>
                  <Input
                    id="apiKey"
                    type="password"
                    placeholder="sk-or-v1-..."
                    value={newKeyInput}
                    onChange={(e) => setNewKeyInput(e.target.value)}
                    className="h-10 bg-background typo-input"
                  />
                </div>
                <div className="flex justify-end gap-2">
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
            </DialogContent>
          </Dialog>



          {/* Custom Models Section - Collapsible */}
          <div className="space-y-4">
            <div
              className="flex items-center justify-between cursor-pointer group p-4 rounded-xl border border-border hover:bg-muted/50 transition-colors gap-4"
              onClick={() => setModelsExpanded(e => !e)}
            >
              <div className="flex-1">
                <h3 className="typo-label">Modelos</h3>
                <p className="typo-caption mt-1">
                  Modelos habilitados en el selector del chat
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); openAddModelsRef.current?.(); }}
                  className="px-4 py-1.5 typo-select rounded-lg bg-primary text-primary-foreground shadow-sm cursor-pointer hover:brightness-110 transition-all duration-200 flex items-center gap-2"
                >
                  <Plus className="h-3.5 w-3.5" /> Añadir
                </button>
                <ChevronRight
                  className={cn(
                    "size-5 text-muted-foreground/50 group-hover:text-foreground transition-transform duration-200 shrink-0",
                    modelsExpanded && "rotate-90",
                  )}
                />
              </div>
            </div>
            {modelsExpanded && (
              <div className="pl-8">
                <ModelsSection providerId={providerId} onAddRef={(fn) => { openAddModelsRef.current = fn; }} />
              </div>
            )}
            {/* Hidden render when collapsed so ref is available */}
            {!modelsExpanded && (
              <div className="hidden">
                <ModelsSection providerId={providerId} onAddRef={(fn) => { openAddModelsRef.current = fn; }} />
              </div>
            )}
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
