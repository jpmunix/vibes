import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { useSettings } from "@/hooks/useSettings";
import { Plus } from "@/components/ui/icons";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { showError, showSuccess } from "@/lib/toast";
import { CUSTOM_PROVIDER_PREFIX } from "@/ipc/shared/language_model_constants";
import type { CustomProviderConfig } from "@/lib/schemas";

export function AddCustomProviderButton() {
  const { settings, updateSettings } = useSettings();
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [newName, setNewName] = useState("");
  const [newBaseUrl, setNewBaseUrl] = useState("");
  const [newApiKey, setNewApiKey] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const customProviders = settings?.customProviders ?? [];

  const handleAdd = async () => {
    if (!newName.trim()) { showError("El nombre es obligatorio."); return; }
    if (!newBaseUrl.trim()) { showError("La URL base es obligatoria."); return; }

    setIsSaving(true);
    try {
      const slug = newName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const id = `${CUSTOM_PROVIDER_PREFIX}${slug}`;
      if (customProviders.some((p) => p.id === id)) {
        showError("Ya existe un proveedor con ese nombre.");
        setIsSaving(false);
        return;
      }

      const newProvider: CustomProviderConfig = {
        id,
        name: newName.trim(),
        apiBaseUrl: newBaseUrl.trim().replace(/\/+$/, ""),
        ...(newApiKey.trim() ? { apiKey: { value: newApiKey.trim() } } : {}),
        modelsSource: "openai-compatible",
      };

      await updateSettings({ customProviders: [...customProviders, newProvider] });
      queryClient.invalidateQueries({ queryKey: queryKeys.languageModels.providers });
      queryClient.invalidateQueries({ queryKey: queryKeys.languageModels.byProviders });

      setNewName(""); setNewBaseUrl(""); setNewApiKey("");
      setShowDialog(false);
      showSuccess(`Proveedor "${newProvider.name}" añadido`);
    } catch (error: any) {
      showError(error.message || "Error al añadir el proveedor.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setShowDialog(true)}
        className="w-full flex items-center justify-center gap-2 p-4 rounded-xl border border-dashed border-border hover:bg-muted/30 hover:border-primary/30 transition-colors cursor-pointer group"
      >
        <Plus className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
        <span className="typo-label text-muted-foreground group-hover:text-primary transition-colors">
          Añadir proveedor personalizado
        </span>
      </button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-4 w-4" /> Nuevo Proveedor de IA
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="provider-name" className="typo-label">Nombre</Label>
              <Input id="provider-name" placeholder="Ej: Mi Proxy LiteLLM" value={newName}
                onChange={(e) => setNewName(e.target.value)} className="h-10 bg-background typo-input" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="provider-url" className="typo-label">URL Base</Label>
              <Input id="provider-url" placeholder="https://my-proxy.example.com/v1" value={newBaseUrl}
                onChange={(e) => setNewBaseUrl(e.target.value)} className="h-10 bg-background typo-input font-mono" />
              <p className="typo-caption">Endpoint compatible con la API de OpenAI (/models y /chat/completions)</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="provider-key" className="typo-label">API Key (opcional)</Label>
              <Input id="provider-key" type="password" placeholder="sk-..." value={newApiKey}
                onChange={(e) => setNewApiKey(e.target.value)} className="h-10 bg-background typo-input" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowDialog(false)} className="h-10 px-4">Cancelar</Button>
              <Button onClick={handleAdd} disabled={isSaving || !newName || !newBaseUrl} className="h-10 px-6 font-bold">
                {isSaving ? "Guardando..." : "Añadir"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
