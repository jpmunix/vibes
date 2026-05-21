import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { useSettings } from "@/hooks/useSettings";
import { Trash2, RefreshCw, Loader2, CheckCircle, AlertCircle } from "@/components/ui/icons";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { showError, showSuccess } from "@/lib/toast";
import { ProviderHeader } from "./ProviderHeader";
import type { CustomProviderConfig } from "@/lib/schemas";

export function CustomProviderSection({ provider }: { provider: CustomProviderConfig }) {
  const { settings, updateSettings } = useSettings();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; count?: number; error?: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const disabledProviders = settings?.disabledProviders ?? [];
  const enabled = !disabledProviders.includes(provider.id);
  const customProviders = settings?.customProviders ?? [];

  const handleToggle = async (on: boolean) => {
    const current = settings?.disabledProviders ?? [];
    const updated = on ? current.filter((id) => id !== provider.id) : [...current, provider.id];
    await updateSettings({ disabledProviders: updated });
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const url = provider.apiBaseUrl.replace(/\/+$/, "");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (provider.apiKey?.value) headers["Authorization"] = `Bearer ${provider.apiKey.value}`;
      const response = await fetch(`${url}/models`, { method: "GET", headers });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const data = await response.json();
      const count = data?.data?.length ?? 0;
      setTestResult({ ok: true, count });
      showSuccess(`Conexión exitosa — ${count} modelos`);
    } catch (error: any) {
      setTestResult({ ok: false, error: error.message });
      showError(`Error: ${error.message}`);
    } finally { setTesting(false); }
  };

  const handleDelete = async () => {
    const filtered = customProviders.filter((p) => p.id !== provider.id);
    const updates: Record<string, any> = { customProviders: filtered };
    // Clean disabled list
    const cleanDisabled = (settings?.disabledProviders ?? []).filter((id) => id !== provider.id);
    updates.disabledProviders = cleanDisabled;
    if (settings?.providerModelConfigs?.[provider.id]) {
      const configs = { ...settings.providerModelConfigs };
      delete configs[provider.id];
      updates.providerModelConfigs = configs;
    }
    await updateSettings(updates);
    queryClient.invalidateQueries({ queryKey: queryKeys.languageModels.providers });
    queryClient.invalidateQueries({ queryKey: queryKeys.languageModels.byProviders });
    showSuccess("Proveedor eliminado");
  };

  const handleFieldChange = (field: "apiBaseUrl" | "apiKey", value: string) => {
    const updated = customProviders.map((p) =>
      p.id === provider.id
        ? field === "apiKey"
          ? { ...p, apiKey: value ? { value } : undefined }
          : { ...p, [field]: value }
        : p,
    );
    updateSettings({ customProviders: updated });
  };

  const statusDot = testResult ? (testResult.ok ? "online" : "offline") : null;

  return (
    <>
      <div className="rounded-xl border border-border overflow-hidden">
        <ProviderHeader
          name={provider.name}
          enabled={enabled}
          onToggle={handleToggle}
          expanded={expanded}
          onToggleExpand={() => setExpanded((e) => !e)}
          statusDot={statusDot as any}
          subtitle={provider.apiBaseUrl}
          rightActions={
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
              className="p-1.5 rounded-md text-muted-foreground/40 hover:!text-red-600 hover:!bg-red-100 dark:hover:!bg-red-900/20 transition-colors cursor-pointer"
              title="Eliminar"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          }
        />

        {expanded && (
          <div className="p-4 pt-0 space-y-4 border-t border-border bg-muted/10">
            <div className="grid gap-4 pt-4">
              <div className="space-y-2">
                <Label className="typo-label text-xs">URL Base</Label>
                <Input value={provider.apiBaseUrl} onChange={(e) => handleFieldChange("apiBaseUrl", e.target.value)}
                  className="h-9 bg-background typo-input font-mono" placeholder="https://..." />
              </div>
              <div className="space-y-2">
                <Label className="typo-label text-xs">API Key</Label>
                <Input type="password" value={provider.apiKey?.value ?? ""} onChange={(e) => handleFieldChange("apiKey", e.target.value)}
                  className="h-9 bg-background typo-input" placeholder="sk-..." />
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleTest} disabled={testing} className="cursor-pointer h-8">
                  {testing ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                  Verificar
                </Button>
                {testResult && (
                  <span className="typo-caption flex items-center gap-1">
                    {testResult.ok ? <><CheckCircle className="h-3.5 w-3.5 text-green-500" /> {testResult.count} modelos</> : <><AlertCircle className="h-3.5 w-3.5 text-destructive" /> {testResult.error}</>}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar proveedor?</AlertDialogTitle>
            <AlertDialogDescription>Se eliminará la configuración de "{provider.name}". Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { handleDelete(); setConfirmDelete(false); }} className="bg-destructive hover:bg-destructive/90 text-white">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
