import React, { useState, useCallback, useEffect } from "react";
import { useSettings } from "@/hooks/useSettings";
import { ipc } from "@/ipc/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ProviderHeader } from "./ProviderHeader";

export function OllamaProviderSection() {
  const { settings, updateSettings } = useSettings();
  const [expanded, setExpanded] = useState(false);
  const [urlInput, setUrlInput] = useState(settings?.ollamaBaseUrl || "");
  const [status, setStatus] = useState<{ online: boolean; modelCount: number; url: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [models, setModels] = useState<{ modelName: string; displayName: string }[]>([]);

  const enabled = settings?.ollamaEnabled !== false; // default true

  useEffect(() => {
    if (settings?.ollamaBaseUrl !== undefined) setUrlInput(settings.ollamaBaseUrl || "");
  }, [settings?.ollamaBaseUrl]);

  const checkStatus = useCallback(async () => {
    setChecking(true);
    try {
      const result = await ipc.languageModel.checkOllamaStatus();
      setStatus(result);
      if (result.online) {
        const { models: m } = await ipc.languageModel.listOllamaModels();
        setModels(m);
      } else { setModels([]); }
    } catch { setStatus({ online: false, modelCount: 0, url: urlInput || "http://localhost:11434" }); setModels([]); }
    setChecking(false);
  }, [urlInput]);

  useEffect(() => { if (enabled) checkStatus(); }, []);

  const handleToggle = async (on: boolean) => {
    await updateSettings({ ollamaEnabled: on });
    if (on) setTimeout(checkStatus, 300);
  };

  const handleSaveUrl = async () => {
    await updateSettings({ ollamaBaseUrl: urlInput.trim() || undefined } as any, { showToast: true });
    setTimeout(checkStatus, 300);
  };

  const statusDot = !enabled ? null : status === null ? "checking" : status.online ? "online" : "offline";
  const subtitle = !enabled ? "Desactivado" : status?.online ? `${status.modelCount} modelo${status.modelCount !== 1 ? "s" : ""}` : "No disponible";

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <ProviderHeader
        name="Ollama"
        enabled={enabled}
        onToggle={handleToggle}
        expanded={expanded}
        onToggleExpand={() => setExpanded((e) => !e)}
        statusDot={statusDot as any}
        subtitle={subtitle}
      />

      {expanded && enabled && (
        <div className="p-4 pt-0 space-y-4 border-t border-border bg-muted/10">
          {/* Status */}
          <div className="flex items-center gap-2 pt-4">
            <span className="typo-caption text-muted-foreground">{status?.url || urlInput || "http://localhost:11434"}</span>
            <Button variant="ghost" size="sm" onClick={checkStatus} disabled={checking}
              className="h-7 px-2 cursor-pointer text-muted-foreground hover:text-primary text-xs">
              {checking ? <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" /> : "Verificar"}
            </Button>
          </div>

          {/* URL */}
          <div className="space-y-2">
            <label className="typo-label text-muted-foreground text-xs">URL del servidor</label>
            <div className="flex gap-2">
              <Input value={urlInput} onChange={(e) => setUrlInput(e.target.value)} placeholder="http://localhost:11434"
                className="flex-1 h-9 bg-muted/30 border-border rounded-lg typo-input" />
              <Button variant="outline" size="sm" onClick={handleSaveUrl} className="h-9 px-4 cursor-pointer rounded-lg">Guardar</Button>
            </div>
          </div>

          {/* Models */}
          {models.length > 0 && (
            <div className="space-y-1.5">
              <label className="typo-label text-muted-foreground text-xs">Modelos disponibles</label>
              {models.map((m) => (
                <div key={m.modelName} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/20 border border-border/50">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/60 shrink-0" />
                  <span className="typo-select font-medium text-sm">{m.displayName}</span>
                  <span className="typo-caption text-muted-foreground/60 ml-auto font-mono text-xs">{m.modelName}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
