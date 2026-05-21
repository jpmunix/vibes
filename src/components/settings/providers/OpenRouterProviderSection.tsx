import React, { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { useSettings } from "@/hooks/useSettings";
import { useLanguageModelProviders } from "@/hooks/useLanguageModelProviders";
import { Label } from "@/components/ui/label";
import { Trash2, Plus, ChevronRight } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { showError, showSuccess } from "@/lib/toast";
import { ModelsSection } from "../ModelsSection";
import { cn } from "@/lib/utils";
import { ipc } from "@/ipc/types";
import { CreateCustomModelDialog } from "@/components/CreateCustomModelDialog";
import { ProviderHeader } from "./ProviderHeader";
import { useTheme } from "@/contexts/ThemeContext";

export function OpenRouterProviderSection() {
  const { settings, loading: settingsLoading, updateSettings } = useSettings();
  const queryClient = useQueryClient();
  const providerId = "openrouter";
  const { theme, intensity } = useTheme();

  const [expanded, setExpanded] = useState(false);
  const [showAddKeyForm, setShowAddKeyForm] = useState(false);
  const [newKeyInput, setNewKeyInput] = useState("");
  const [newKeyAlias, setNewKeyAlias] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [keyToDelete, setKeyToDelete] = useState<string | null>(null);
  const [modelsExpanded, setModelsExpanded] = useState(false);
  const [isCustomModelDialogOpen, setIsCustomModelDialogOpen] = useState(false);
  const openAddModelsRef = useRef<(() => void) | null>(null);

  const disabledProviders = settings?.disabledProviders ?? [];

  // Keys management
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
  }, [legacyApiKey, keys]);

  const handleAddKey = async () => {
    if (!newKeyInput.trim()) { showError("La clave API no puede estar vacía."); return; }
    setIsSaving(true);
    try {
      const newId = crypto.randomUUID();
      const newKeys = [...keys, { id: newId, key: { value: newKeyInput.trim() }, alias: newKeyAlias.trim() || `Clave ${keys.length + 1}` }];
      const newSelectedId = keys.length === 0 ? newId : selectedKeyId;
      await updateSettings({
        providerSettings: { ...settings?.providerSettings, [providerId]: { ...openRouterSettings, keys: newKeys, selectedKeyId: newSelectedId } },
      });
      if (keys.length === 0) queryClient.invalidateQueries({ queryKey: queryKeys.system.openRouterCredits });
      setNewKeyInput(""); setNewKeyAlias(""); setShowAddKeyForm(false);
      showSuccess("Clave API añadida");
    } catch (error: any) { showError(error.message || "Error al añadir la clave."); }
    finally { setIsSaving(false); }
  };

  const handleDeleteKey = async (id: string) => {
    setIsSaving(true);
    try {
      const newKeys = keys.filter((k) => k.id !== id);
      let newSelectedId = selectedKeyId;
      if (id === selectedKeyId) newSelectedId = newKeys.length > 0 ? newKeys[0].id : undefined;
      await updateSettings({
        providerSettings: { ...settings?.providerSettings, [providerId]: { ...openRouterSettings, keys: newKeys, selectedKeyId: newSelectedId } },
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.system.openRouterCredits });
      showSuccess("Clave eliminada");
    } catch { showError("Error al eliminar la clave"); }
    finally { setIsSaving(false); }
  };

  const handleSelectKey = async (id: string) => {
    await updateSettings({
      providerSettings: { ...settings?.providerSettings, [providerId]: { ...openRouterSettings, selectedKeyId: id } },
    });
    queryClient.invalidateQueries({ queryKey: queryKeys.system.openRouterCredits });
    showSuccess("Clave seleccionada");
  };

  return (
    <>
      <div className="rounded-xl border border-border overflow-hidden">
        <ProviderHeader
          name="OpenRouter"
          enabled={true}
          onToggle={null}
          expanded={expanded}
          onToggleExpand={() => setExpanded((e) => !e)}
          subtitle={keys.length > 0 ? `${keys.length} clave${keys.length !== 1 ? "s" : ""}` : "Sin configurar"}
        />

        {expanded && (
          <div className="border-t border-border bg-muted/10 space-y-0">
            {/* API Keys */}
            <div className="flex justify-between gap-8 p-4 items-center">
              <div className="flex-1">
                <h4 className="typo-label text-sm">Clave API activa</h4>
                <p className="typo-caption mt-0.5">Gestiona tus claves de acceso</p>
              </div>
              <div onClick={(e) => e.stopPropagation()}>
                {keys.length === 0 ? (
                  <button type="button" onClick={() => setShowAddKeyForm(true)}
                    className="px-4 py-1.5 typo-select rounded-lg bg-primary text-primary-foreground shadow-sm cursor-pointer hover:brightness-110 transition-all duration-200">
                    Añadir clave
                  </button>
                ) : (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button"
                        className="border-0 bg-primary text-primary-foreground shadow-sm rounded-lg px-4 py-1.5 h-auto typo-select hover:brightness-110 transition-all duration-200 w-auto gap-2 cursor-pointer flex items-center">
                        {keys.find((k) => k.id === selectedKeyId)?.alias || "Seleccionar"}
                        <ChevronRight className="h-4 w-4 rotate-90 opacity-70" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-[260px]">
                      {keys.map((key) => (
                        <DropdownMenuItem key={key.id}
                          className={cn("cursor-pointer flex items-center justify-between gap-4 py-2.5", key.id === selectedKeyId && "bg-primary/10")}
                          onSelect={(e) => { e.preventDefault(); handleSelectKey(key.id); }}>
                          <div className="flex flex-col min-w-0">
                            <span className="!font-semibold truncate">{key.alias || "Sin nombre"}</span>
                            <span className="typo-mono-xs truncate">{`${key.key.value.substring(0, 8)}...${key.key.value.substring(key.key.value.length - 4)}`}</span>
                          </div>
                          <button type="button" onClick={(e) => { e.stopPropagation(); e.preventDefault(); setKeyToDelete(key.id); }}
                            className="shrink-0 p-1.5 rounded-md text-muted-foreground/40 hover:!text-red-600 hover:!bg-red-100 dark:hover:!bg-red-900/20 transition-colors cursor-pointer">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuItem className="cursor-pointer text-primary py-2.5 border-t border-border mt-1" onSelect={() => setShowAddKeyForm(true)}>
                        <Plus className="h-4 w-4 mr-2" /> Añadir nueva...
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>

            {/* Cost display toggle */}
            <div className="flex justify-between gap-8 p-4 items-center">
              <div className="flex-1">
                <h4 className="typo-label text-sm">Mostrar gasto en chats</h4>
                <p className="typo-caption mt-0.5">Coste acumulado y por mensaje</p>
              </div>
              <div onClick={(e) => e.stopPropagation()}>
                <div className="relative bg-muted/50 rounded-xl p-1 flex w-fit border border-border">
                  {([false, true] as const).map((value) => (
                    <button key={String(value)} onClick={() => updateSettings({ showCostDisplay: value })}
                      className={cn(
                        "px-4 py-1.5 typo-select !font-bold rounded-lg transition-colors duration-200 cursor-pointer",
                        (settings?.showCostDisplay ?? false) === value ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-primary/10",
                      )}>
                      {value ? "Activado" : "Desactivado"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Custom model */}
            <div className="flex justify-between gap-8 p-4 items-center">
              <div className="flex-1">
                <h4 className="typo-label text-sm">Modelo personalizado</h4>
                <p className="typo-caption mt-0.5">Presets o IDs arbitrarios de OpenRouter</p>
              </div>
              <button type="button" onClick={() => setIsCustomModelDialogOpen(true)}
                className="px-4 py-1.5 typo-select rounded-lg bg-primary text-primary-foreground shadow-sm cursor-pointer hover:brightness-110 transition-all duration-200">
                Crear
              </button>
            </div>

            <CreateCustomModelDialog isOpen={isCustomModelDialogOpen} onClose={() => setIsCustomModelDialogOpen(false)}
              onSuccess={() => { setIsCustomModelDialogOpen(false); queryClient.invalidateQueries({ queryKey: queryKeys.languageModels.byProviders }); queryClient.invalidateQueries({ queryKey: queryKeys.languageModels.forProvider({ providerId }) }); }}
              providerId={providerId} />

            {/* Models section - collapsible */}
            <div className="space-y-0">
              <div className="flex items-center justify-between cursor-pointer group p-4 hover:bg-muted/20 transition-colors gap-4"
                onClick={() => setModelsExpanded((e) => !e)}>
                <div className="flex-1">
                  <h4 className="typo-label text-sm">Modelos habilitados</h4>
                  <p className="typo-caption mt-0.5">Modelos visibles en el selector del chat</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button type="button" onClick={(e) => { e.stopPropagation(); openAddModelsRef.current?.(); }}
                    className="px-3 py-1 typo-select rounded-lg bg-primary text-primary-foreground shadow-sm cursor-pointer hover:brightness-110 transition-all duration-200 flex items-center gap-1.5 text-xs">
                    <Plus className="h-3 w-3" /> Añadir
                  </button>
                  <ChevronRight className={cn("size-4 text-muted-foreground/50 group-hover:text-foreground transition-transform duration-200 shrink-0", modelsExpanded && "rotate-90")} />
                </div>
              </div>
              {modelsExpanded && (
                <div className="pl-8 pb-4">
                  <ModelsSection providerId={providerId} onAddRef={(fn) => { openAddModelsRef.current = fn; }} />
                </div>
              )}
              {!modelsExpanded && (
                <div className="hidden">
                  <ModelsSection providerId={providerId} onAddRef={(fn) => { openAddModelsRef.current = fn; }} />
                </div>
              )}
            </div>

            {/* Playground */}
            <div
              className="flex items-center justify-between cursor-pointer group p-4 hover:bg-muted/20 transition-colors gap-4"
              onClick={() => {
                ipc.system.openPlaygroundWindow({
                  theme: theme as "light" | "dark" | "system",
                  themeIntensity: intensity,
                });
              }}
            >
              <div className="flex-1">
                <h4 className="typo-label text-sm">Playground</h4>
                <p className="typo-caption mt-0.5">Compara modelos con el mismo prompt</p>
              </div>
              <ChevronRight className="size-4 text-muted-foreground/50 group-hover:text-foreground transition-colors duration-200 shrink-0" />
            </div>
          </div>
        )}
      </div>

      {/* Add Key Dialog */}
      <Dialog open={showAddKeyForm} onOpenChange={setShowAddKeyForm}>
        <DialogContent>
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Plus className="h-4 w-4" /> Añadir Nueva Clave</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="alias" className="typo-label">Alias (Opcional)</Label>
              <Input id="alias" placeholder="Ej: Clave Personal" value={newKeyAlias} onChange={(e) => setNewKeyAlias(e.target.value)} className="h-10 bg-background typo-input" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="apiKey" className="typo-label">API Key</Label>
              <Input id="apiKey" type="password" placeholder="sk-or-v1-..." value={newKeyInput} onChange={(e) => setNewKeyInput(e.target.value)} className="h-10 bg-background typo-input" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowAddKeyForm(false)} className="h-10 px-4">Cancelar</Button>
              <Button onClick={handleAddKey} disabled={isSaving || !newKeyInput} className="h-10 px-6 font-bold">{isSaving ? "Guardando..." : "Añadir"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Key Dialog */}
      <AlertDialog open={!!keyToDelete} onOpenChange={(open) => !open && setKeyToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>¿Eliminar clave API?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (keyToDelete) { handleDeleteKey(keyToDelete); setKeyToDelete(null); } }} className="bg-destructive hover:bg-destructive/90 text-white">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
