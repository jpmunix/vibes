import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { useSettings } from "@/hooks/useSettings";
import { useLanguageModelProviders } from "@/hooks/useLanguageModelProviders";
import { Label } from "@/components/ui/label";
import {
  Plus,
  ChevronRight,
  Trash2,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Loader2,
} from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { cn } from "@/lib/utils";
import { ipc } from "@/ipc/types";
import type { CustomProviderConfig } from "@/lib/schemas";
import { CUSTOM_PROVIDER_PREFIX } from "@/ipc/shared/language_model_constants";
import { ProviderSwitchDialog } from "./ProviderSwitchDialog";

export function AIProvidersSection() {
  const { settings, loading: settingsLoading, updateSettings } = useSettings();
  const { data: allProviders, isLoading: providersLoading } = useLanguageModelProviders();
  const queryClient = useQueryClient();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newName, setNewName] = useState("");
  const [newBaseUrl, setNewBaseUrl] = useState("");
  const [newApiKey, setNewApiKey] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [providerToDelete, setProviderToDelete] = useState<string | null>(null);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; count?: number; error?: string }>>({});
  const [switchTarget, setSwitchTarget] = useState<CustomProviderConfig | null>(null);

  const customProviders = settings?.customProviders ?? [];
  const activeProviderId = settings?.activeProviderId || "openrouter";

  const handleAddProvider = async () => {
    if (!newName.trim()) {
      showError("El nombre es obligatorio.");
      return;
    }
    if (!newBaseUrl.trim()) {
      showError("La URL base es obligatoria.");
      return;
    }

    setIsSaving(true);
    try {
      const slug = newName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const id = `${CUSTOM_PROVIDER_PREFIX}${slug}`;

      // Check for duplicate
      if (customProviders.some(p => p.id === id)) {
        showError("Ya existe un proveedor con ese nombre.");
        return;
      }

      const newProvider: CustomProviderConfig = {
        id,
        name: newName.trim(),
        apiBaseUrl: newBaseUrl.trim().replace(/\/+$/, ""),
        ...(newApiKey.trim() ? { apiKey: { value: newApiKey.trim() } } : {}),
        modelsSource: "openai-compatible",
      };

      await updateSettings({
        customProviders: [...customProviders, newProvider],
      });

      // Invalidate providers/models queries so the new provider appears
      queryClient.invalidateQueries({ queryKey: queryKeys.languageModels.providers });
      queryClient.invalidateQueries({ queryKey: queryKeys.languageModels.byProviders });

      setNewName("");
      setNewBaseUrl("");
      setNewApiKey("");
      setShowAddDialog(false);
      showSuccess(`Proveedor "${newProvider.name}" añadido`);
    } catch (error: any) {
      showError(error.message || "Error al añadir el proveedor.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteProvider = async (id: string) => {
    setIsSaving(true);
    try {
      const filtered = customProviders.filter(p => p.id !== id);
      const updates: Record<string, any> = { customProviders: filtered };

      // If deleting the active provider, fall back to openrouter
      if (activeProviderId === id) {
        updates.activeProviderId = "openrouter";
      }

      // Clean up model config snapshot
      if (settings?.providerModelConfigs?.[id]) {
        const configs = { ...settings.providerModelConfigs };
        delete configs[id];
        updates.providerModelConfigs = configs;
      }

      await updateSettings(updates);
      queryClient.invalidateQueries({ queryKey: queryKeys.languageModels.providers });
      queryClient.invalidateQueries({ queryKey: queryKeys.languageModels.byProviders });
      showSuccess("Proveedor eliminado");
    } catch (error: any) {
      showError("Error al eliminar el proveedor");
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async (provider: CustomProviderConfig) => {
    setTestingProvider(provider.id);
    try {
      const normalizedUrl = provider.apiBaseUrl.replace(/\/+$/, "");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (provider.apiKey?.value) {
        headers["Authorization"] = `Bearer ${provider.apiKey.value}`;
      }

      const response = await fetch(`${normalizedUrl}/models`, {
        method: "GET",
        headers,
      });

      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const count = data?.data?.length ?? 0;
      setTestResults(prev => ({ ...prev, [provider.id]: { ok: true, count } }));
      showSuccess(`Conexión exitosa — ${count} modelos detectados`);
    } catch (error: any) {
      setTestResults(prev => ({ ...prev, [provider.id]: { ok: false, error: error.message } }));
      showError(`Error de conexión: ${error.message}`);
    } finally {
      setTestingProvider(null);
    }
  };

  const handleSelectActiveProvider = async (providerId: string) => {
    if (providerId === activeProviderId) return;

    // If switching to a custom provider for the first time (no snapshot), show switch dialog
    if (providerId !== "openrouter") {
      const hasSnapshot = !!settings?.providerModelConfigs?.[providerId];
      const config = customProviders.find(p => p.id === providerId);
      if (!hasSnapshot && config) {
        setSwitchTarget(config);
        return;
      }
    }

    await performProviderSwitch(providerId);
  };

  const performProviderSwitch = async (targetProviderId: string) => {
    try {
      // 1. Save snapshot of current provider's model config
      const currentSnapshot = {
        selectedModel: settings?.selectedModel,
        strategistModel: settings?.strategistModel,
        executorModel: settings?.executorModel,
        enabledModels: activeProviderId === "openrouter"
          ? settings?.enabledOpenRouterModels
          : settings?.providerModelConfigs?.[activeProviderId]?.enabledModels,
      };

      const updatedConfigs = {
        ...settings?.providerModelConfigs,
        [activeProviderId]: currentSnapshot,
      };

      // 2. Restore target provider's snapshot if it exists
      const targetSnapshot = updatedConfigs[targetProviderId];
      const updates: Record<string, any> = {
        activeProviderId: targetProviderId,
        providerModelConfigs: updatedConfigs,
      };

      if (targetSnapshot?.selectedModel) {
        updates.selectedModel = targetSnapshot.selectedModel;
      }
      if (targetSnapshot?.strategistModel) {
        updates.strategistModel = targetSnapshot.strategistModel;
      }
      if (targetSnapshot?.executorModel) {
        updates.executorModel = targetSnapshot.executorModel;
      }

      await updateSettings(updates);
      queryClient.invalidateQueries({ queryKey: queryKeys.languageModels.byProviders });
      showSuccess(`Proveedor activo: ${targetProviderId === "openrouter" ? "OpenRouter" : customProviders.find(p => p.id === targetProviderId)?.name}`);
    } catch (error: any) {
      showError("Error al cambiar de proveedor");
    }
  };

  if (providersLoading || settingsLoading) {
    return null;
  }

  return (
    <>
      <div className="bg-card rounded-2xl shadow-sm p-8 border border-border mb-6">
        <div className="mb-8">
          <h2 className="typo-section-title">Proveedores de IA</h2>
          <p className="typo-caption mt-1">
            Configura qué servicio de IA usa Vibes para todas las operaciones
          </p>
        </div>

        <div className="space-y-4">
          {/* Active Provider Selector */}
          <div className="flex justify-between gap-8 p-4 rounded-xl hover:bg-muted/50 transition-colors items-center">
            <div className="flex-1">
              <h3 className="typo-label">Proveedor activo</h3>
              <p className="typo-caption mt-1">
                Todos los modelos y operaciones usarán este proveedor
              </p>
            </div>
            <div onClick={(e) => e.stopPropagation()}>
              <div className="relative bg-muted/50 rounded-xl p-1 flex flex-wrap gap-1 w-fit border border-border">
                {/* OpenRouter — always first */}
                <button
                  onClick={() => handleSelectActiveProvider("openrouter")}
                  className={cn(
                    "px-4 py-1.5 typo-select !font-bold rounded-lg transition-colors duration-200 cursor-pointer whitespace-nowrap",
                    activeProviderId === "openrouter"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "hover:bg-primary/10",
                  )}
                >
                  OpenRouter
                </button>
                {/* Custom providers */}
                {customProviders.map((cp) => (
                  <button
                    key={cp.id}
                    onClick={() => handleSelectActiveProvider(cp.id)}
                    className={cn(
                      "px-4 py-1.5 typo-select !font-bold rounded-lg transition-colors duration-200 cursor-pointer whitespace-nowrap",
                      activeProviderId === cp.id
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "hover:bg-primary/10",
                    )}
                  >
                    {cp.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Custom Providers List */}
          {customProviders.map((cp) => {
            const isExpanded = expandedProvider === cp.id;
            const testResult = testResults[cp.id];
            const isTesting = testingProvider === cp.id;

            return (
              <div
                key={cp.id}
                className="rounded-xl border border-border overflow-hidden"
              >
                <div
                  className="flex items-center justify-between cursor-pointer group p-4 hover:bg-muted/50 transition-colors gap-4"
                  onClick={() => setExpandedProvider(isExpanded ? null : cp.id)}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="typo-label truncate">{cp.name}</h3>
                        {activeProviderId === cp.id && (
                          <span className="shrink-0 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-primary/10 text-primary">
                            Activo
                          </span>
                        )}
                        {testResult && (
                          <span className="shrink-0">
                            {testResult.ok ? (
                              <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                            ) : (
                              <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                            )}
                          </span>
                        )}
                      </div>
                      <p className="typo-caption truncate">{cp.apiBaseUrl}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setProviderToDelete(cp.id);
                      }}
                      className="p-1.5 rounded-md text-muted-foreground/40 hover:!text-red-600 hover:!bg-red-100 dark:hover:!bg-red-900/20 transition-colors cursor-pointer"
                      title="Eliminar proveedor"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <ChevronRight
                      className={cn(
                        "size-5 text-muted-foreground/50 group-hover:text-foreground transition-transform duration-200",
                        isExpanded && "rotate-90",
                      )}
                    />
                  </div>
                </div>

                {isExpanded && (
                  <div className="p-4 pt-0 space-y-4 border-t border-border bg-muted/20">
                    <div className="grid gap-4 pt-4">
                      <div className="space-y-2">
                        <Label className="typo-label">URL Base</Label>
                        <Input
                          value={cp.apiBaseUrl}
                          onChange={(e) => {
                            const updated = customProviders.map(p =>
                              p.id === cp.id ? { ...p, apiBaseUrl: e.target.value } : p
                            );
                            updateSettings({ customProviders: updated });
                          }}
                          className="h-10 bg-background typo-input font-mono"
                          placeholder="https://..."
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="typo-label">API Key</Label>
                        <Input
                          type="password"
                          value={cp.apiKey?.value ?? ""}
                          onChange={(e) => {
                            const updated = customProviders.map(p =>
                              p.id === cp.id
                                ? { ...p, apiKey: e.target.value ? { value: e.target.value } : undefined }
                                : p
                            );
                            updateSettings({ customProviders: updated });
                          }}
                          className="h-10 bg-background typo-input"
                          placeholder="sk-..."
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleTestConnection(cp)}
                          disabled={isTesting}
                          className="cursor-pointer"
                        >
                          {isTesting ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4 mr-2" />
                          )}
                          Verificar conexión
                        </Button>
                        {testResult && (
                          <span className="typo-caption">
                            {testResult.ok
                              ? `✓ ${testResult.count} modelos`
                              : `✗ ${testResult.error}`}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Add Provider Button */}
          <button
            type="button"
            onClick={() => setShowAddDialog(true)}
            className="w-full flex items-center justify-center gap-2 p-4 rounded-xl border border-dashed border-border hover:bg-muted/50 hover:border-primary/30 transition-colors cursor-pointer group"
          >
            <Plus className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
            <span className="typo-label text-muted-foreground group-hover:text-primary transition-colors">
              Añadir proveedor
            </span>
          </button>
        </div>
      </div>

      {/* Add Provider Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-4 w-4" /> Nuevo Proveedor de IA
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="provider-name" className="typo-label">Nombre</Label>
              <Input
                id="provider-name"
                placeholder="Ej: Mi Proxy LiteLLM"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="h-10 bg-background typo-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="provider-url" className="typo-label">URL Base</Label>
              <Input
                id="provider-url"
                placeholder="https://my-proxy.example.com/v1"
                value={newBaseUrl}
                onChange={(e) => setNewBaseUrl(e.target.value)}
                className="h-10 bg-background typo-input font-mono"
              />
              <p className="typo-caption">
                Endpoint compatible con la API de OpenAI (debe soportar /models y /chat/completions)
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="provider-key" className="typo-label">API Key (opcional)</Label>
              <Input
                id="provider-key"
                type="password"
                placeholder="sk-..."
                value={newApiKey}
                onChange={(e) => setNewApiKey(e.target.value)}
                className="h-10 bg-background typo-input"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setShowAddDialog(false)}
                className="h-10 px-4"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleAddProvider}
                disabled={isSaving || !newName || !newBaseUrl}
                className="h-10 px-6 font-bold"
              >
                {isSaving ? "Guardando..." : "Añadir"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!providerToDelete}
        onOpenChange={(open) => !open && setProviderToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar proveedor?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la configuración y los modelos asociados. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (providerToDelete) {
                  handleDeleteProvider(providerToDelete);
                  setProviderToDelete(null);
                }
              }}
              className="bg-destructive hover:bg-destructive/90 text-white"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Provider Switch Dialog (first-time setup for custom providers) */}
      {switchTarget && (
        <ProviderSwitchDialog
          provider={switchTarget}
          open={!!switchTarget}
          onOpenChange={(open) => !open && setSwitchTarget(null)}
          onConfirm={async (config) => {
            // Save the model config snapshot for the new provider
            const updatedConfigs = {
              ...settings?.providerModelConfigs,
              [switchTarget.id]: {
                selectedModel: config.selectedModel,
                strategistModel: config.strategistModel,
                executorModel: config.executorModel,
              },
            };

            // Save current provider snapshot first
            const currentSnapshot = {
              selectedModel: settings?.selectedModel,
              strategistModel: settings?.strategistModel,
              executorModel: settings?.executorModel,
              enabledModels: activeProviderId === "openrouter"
                ? settings?.enabledOpenRouterModels
                : settings?.providerModelConfigs?.[activeProviderId]?.enabledModels,
            };
            updatedConfigs[activeProviderId] = currentSnapshot;

            await updateSettings({
              activeProviderId: switchTarget.id,
              providerModelConfigs: updatedConfigs,
              selectedModel: config.selectedModel,
              strategistModel: config.strategistModel,
              executorModel: config.executorModel,
            });

            queryClient.invalidateQueries({ queryKey: queryKeys.languageModels.byProviders });
            setSwitchTarget(null);
            showSuccess(`Proveedor activo: ${switchTarget.name}`);
          }}
        />
      )}
    </>
  );
}
