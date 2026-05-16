import React, { useState, useCallback, useEffect } from "react";
import { useSettings } from "@/hooks/useSettings";
import { ipc } from "@/ipc/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * OllamaSettings — Settings UI for configuring the local Ollama server.
 * Shows connection status, allows URL configuration, and displays available models.
 */
export function OllamaSettings() {
  const { settings, updateSettings } = useSettings();
  const [urlInput, setUrlInput] = useState(settings?.ollamaBaseUrl || "");
  const [status, setStatus] = useState<{
    online: boolean;
    modelCount: number;
    url: string;
  } | null>(null);
  const [checking, setChecking] = useState(false);
  const [models, setModels] = useState<{ modelName: string; displayName: string }[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  // Sync urlInput when settings change externally
  useEffect(() => {
    if (settings?.ollamaBaseUrl !== undefined) {
      setUrlInput(settings.ollamaBaseUrl || "");
    }
  }, [settings?.ollamaBaseUrl]);

  const checkStatus = useCallback(async () => {
    setChecking(true);
    try {
      const result = await ipc.languageModel.checkOllamaStatus();
      setStatus(result);

      if (result.online) {
        setLoadingModels(true);
        try {
          const { models: ollamaModels } = await ipc.languageModel.listOllamaModels();
          setModels(ollamaModels);
        } catch {
          setModels([]);
        }
        setLoadingModels(false);
      } else {
        setModels([]);
      }
    } catch {
      setStatus({ online: false, modelCount: 0, url: urlInput || "http://localhost:11434" });
      setModels([]);
    }
    setChecking(false);
  }, [urlInput]);

  // Auto-check status on mount
  useEffect(() => {
    checkStatus();
  }, []);

  const handleSaveUrl = async () => {
    const trimmed = urlInput.trim() || undefined;
    await updateSettings({ ollamaBaseUrl: trimmed } as any, { showToast: true });
    // Re-check with new URL
    setTimeout(checkStatus, 300);
  };

  const defaultUrl = "http://localhost:11434";
  const displayUrl = status?.url || urlInput || defaultUrl;

  return (
    <div className="space-y-4">
      {/* Connection Status */}
      <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 border border-border">
        <div
          className={cn(
            "w-2.5 h-2.5 rounded-full shrink-0 transition-colors",
            status === null
              ? "bg-muted-foreground/40"
              : status.online
                ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]"
                : "bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.3)]",
          )}
        />
        <div className="flex-1 min-w-0">
          <div className="typo-label">
            {status === null
              ? "Verificando conexión..."
              : status.online
                ? `Ollama conectado — ${status.modelCount} modelo${status.modelCount !== 1 ? "s" : ""}`
                : "Ollama no disponible"}
          </div>
          <div className="typo-caption text-muted-foreground truncate mt-0.5">
            {displayUrl}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={checkStatus}
          disabled={checking}
          className="h-8 px-3 cursor-pointer text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors shrink-0"
        >
          {checking ? (
            <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            "Verificar"
          )}
        </Button>
      </div>

      {/* URL Configuration */}
      <div className="space-y-2">
        <label className="typo-label text-muted-foreground">URL del servidor Ollama</label>
        <div className="flex gap-2">
          <Input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder={defaultUrl}
            className="flex-1 h-9 bg-muted/30 border-border rounded-lg typo-input"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handleSaveUrl}
            className="h-9 px-4 cursor-pointer rounded-lg"
          >
            Guardar
          </Button>
        </div>
        <p className="typo-caption text-muted-foreground/70">
          Cambia la URL si tu servidor Ollama está en una máquina remota o en un puerto distinto.
        </p>
      </div>

      {/* Models List */}
      {status?.online && models.length > 0 && (
        <div className="space-y-2">
          <label className="typo-label text-muted-foreground">Modelos disponibles</label>
          <div className="grid gap-1.5">
            {models.map((m) => (
              <div
                key={m.modelName}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/20 border border-border/50"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/60 shrink-0" />
                <span className="typo-select font-medium">{m.displayName}</span>
                <span className="typo-caption text-muted-foreground/60 ml-auto font-mono">
                  {m.modelName}
                </span>
              </div>
            ))}
          </div>
          <p className="typo-caption text-muted-foreground/70">
            Usa el formato <code className="bg-muted/50 px-1 py-0.5 rounded text-[0.85em]">ollama::nombre-modelo</code> para asignar un modelo de Ollama como estratega o ejecutor.
          </p>
        </div>
      )}

      {loadingModels && (
        <div className="flex items-center gap-2 px-3 py-2 text-muted-foreground typo-caption">
          <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
          Cargando modelos...
        </div>
      )}
    </div>
  );
}
