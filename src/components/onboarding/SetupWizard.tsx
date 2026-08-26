import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSettings } from "@/hooks/useSettings";
import { useLanguageModelProviders } from "@/hooks/useLanguageModelProviders";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CheckCircle,
  AlertCircle,
  Loader2,
  ExternalLink,
  Key,
  Sparkles,
  Server,
  Cloud,
  RefreshCw,
} from "@/components/ui/icons";
import { showError, showSuccess } from "@/lib/toast";
import { queryKeys } from "@/lib/queryKeys";
import { ipc } from "@/ipc/types";
import { CUSTOM_PROVIDER_PREFIX } from "@/ipc/shared/language_model_constants";
import { VerifiedModelsList } from "@/components/settings/providers/VerifiedModelsList";
import { useI18n } from "@/lib/i18n";
// @ts-ignore
import openrouterLogo from "../../../assets/ai-logos/openrouter-logo.png";

type WizardStep = "provider" | "key";
type ProviderChoice = "openrouter" | "custom" | "ollama";

/**
 * Full-screen wizard — blocking overlay shown when no provider is configured.
 * Offers 3 paths: OpenRouter (recommended), Custom OpenAI-compatible, Ollama local.
 * Card #160 T10 — replaces OpenRouterSetupWizard.tsx (now de-privileged).
 */
export function SetupWizard() {
  const { t } = useI18n();
  const { settings, loading: settingsLoading, updateSettings } = useSettings();
  const { isAnyProviderSetup, isLoading: providersLoading } =
    useLanguageModelProviders();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<WizardStep>("provider");
  const [chosen, setChosen] = useState<ProviderChoice | null>(null);

  // OpenRouter path
  const [apiKey, setApiKey] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ ok: boolean; error?: string } | null>(null);

  // Custom path
  const [customName, setCustomName] = useState("");
  const [customUrl, setCustomUrl] = useState("");
  const [customKey, setCustomKey] = useState("");
  const [isCustomVerifying, setIsCustomVerifying] = useState(false);
  const [customVerifyResult, setCustomVerifyResult] = useState<{
    ok: boolean;
    count?: number;
    models?: { id: string }[];
    error?: string;
  } | null>(null);
  const [isSavingCustom, setIsSavingCustom] = useState(false);

  const handleVerifyOpenRouter = useCallback(async () => {
    if (!apiKey.trim()) { showError(t("wizard.enterApiKey")); return; }
    setIsVerifying(true); setVerifyResult(null);
    try {
      const response = await fetch("https://openrouter.ai/api/v1/auth/key", {
        headers: { Authorization: `Bearer ${apiKey.trim()}` },
      });
      if (!response.ok) throw new Error(`API key inválida (HTTP ${response.status})`);
      const data = await response.json();
      if (data?.data) {
        setVerifyResult({ ok: true });
        const keyId = `key_${Date.now()}`;
        await updateSettings({
          providerSettings: {
            ...settings?.providerSettings,
            openrouter: { keys: [{ id: keyId, key: { value: apiKey.trim() } }], selectedKeyId: keyId },
          },
        });
        showSuccess(t("wizard.configured"));
      } else throw new Error("Respuesta inesperada de OpenRouter");
    } catch (error: any) { setVerifyResult({ ok: false, error: error.message }); }
    finally { setIsVerifying(false); }
  }, [apiKey, settings, updateSettings, t]);

  const handleVerifyCustom = useCallback(async () => {
    if (!customUrl.trim()) { showError(t("customProvider.urlRequiredVerify")); return; }
    setIsCustomVerifying(true); setCustomVerifyResult(null);
    try {
      const result = await ipc.languageModel.verifyCustomProvider({
        apiBaseUrl: customUrl.trim(), apiKey: customKey.trim() || undefined,
      });
      setCustomVerifyResult(result);
      if (result.ok) showSuccess(result.count ? `${result.count} modelos encontrados` : "Conexión exitosa");
      else showError(`Error: ${result.error}`);
    } catch (error: any) {
      setCustomVerifyResult({ ok: false, error: error.message });
      showError(`Error: ${error.message}`);
    } finally { setIsCustomVerifying(false); }
  }, [customUrl, customKey, t]);

  const handleSaveCustom = useCallback(async () => {
    if (!customName.trim()) { showError(t("customProvider.nameRequired")); return; }
    if (!customUrl.trim()) { showError(t("customProvider.urlRequired")); return; }
    const slug = customName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const id = `${CUSTOM_PROVIDER_PREFIX}${slug}`;
    const existing = (settings?.customProviders ?? []) as any[];
    if (existing.some((p: any) => p.id === id)) { showError(t("customProvider.duplicateName")); return; }
    setIsSavingCustom(true);
    try {
      const newProvider: any = {
        id, name: customName.trim(), apiBaseUrl: customUrl.trim().replace(/\/+$/, ""),
        ...(customKey.trim() ? { apiKey: { value: customKey.trim() } } : {}),
        modelsSource: "openai-compatible",
      };
      await updateSettings({ customProviders: [...existing, newProvider] });
      queryClient.invalidateQueries({ queryKey: queryKeys.languageModels.providers });
      queryClient.invalidateQueries({ queryKey: queryKeys.languageModels.byProviders });
      showSuccess(t("customProvider.addedSuccess", { name: newProvider.name }));
    } catch (error: any) { showError(error.message || t("customProvider.addError")); }
    finally { setIsSavingCustom(false); }
  }, [customName, customUrl, customKey, settings, updateSettings, queryClient, t]);

  const handleEnableOllama = useCallback(async () => {
    await updateSettings({ ollamaEnabled: true });
    showSuccess("Ollama activado — modelos locales disponibles");
  }, [updateSettings]);

  if (settingsLoading || providersLoading) return null;
  if (isAnyProviderSetup()) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/95 backdrop-blur-md">
      <div className="w-full max-w-lg mx-4">
        <div className="flex justify-center mb-8">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full" />
            <Sparkles className="h-12 w-12 text-primary relative z-10" />
          </div>
        </div>

        {step === "provider" && (
          <div className="space-y-6 animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
            <div className="text-center">
              <h1 className="text-2xl font-bold tracking-tight">Bienvenido a Vibes</h1>
              <p className="text-muted-foreground mt-2 max-w-md mx-auto text-sm">Elige cómo quieres conectar Vibes con modelos de IA.</p>
            </div>

            {/* 3 provider cards */}
            <div className="space-y-3">
              {/* OpenRouter — recommended */}
              <button
                type="button"
                onClick={() => { setChosen("openrouter"); setStep("key"); }}
                className="w-full text-left bg-card rounded-2xl border-2 border-primary/30 hover:border-primary/60 p-5 space-y-3 transition-colors relative overflow-hidden cursor-pointer group"
              >
                <span className="absolute top-3 right-3 text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded-full bg-primary text-primary-foreground">Recomendado</span>
                <div className="flex items-center gap-3">
                  <img loading="lazy" decoding="async" src={openrouterLogo} alt="OpenRouter" className="h-8 w-8 rounded-lg" />
                  <div>
                    <h3 className="font-semibold text-sm">OpenRouter</h3>
                    <p className="text-xs text-muted-foreground">300+ modelos en la nube</p>
                  </div>
                </div>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li className="flex items-start gap-2"><CheckCircle className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" /><span>{t("wizard.registerFree")}</span></li>
                  <li className="flex items-start gap-2"><CheckCircle className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" /><span>{t("wizard.freeModels")}</span></li>
                  <li className="flex items-start gap-2"><CheckCircle className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" /><span>{t("wizard.payPerUse")}</span></li>
                </ul>
              </button>

              {/* Custom provider */}
              <button
                type="button"
                onClick={() => { setChosen("custom"); setStep("key"); }}
                className="w-full text-left bg-card rounded-2xl border border-border hover:border-primary/30 p-5 space-y-2 transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center"><Cloud className="h-4 w-4 text-muted-foreground" /></div>
                  <div>
                    <h3 className="font-semibold text-sm">Proveedor compatible</h3>
                    <p className="text-xs text-muted-foreground">Cualquier endpoint OpenAI-compatible (vLLM, LiteLLM, proxy…)</p>
                  </div>
                </div>
              </button>

              {/* Ollama local */}
              <button
                type="button"
                onClick={handleEnableOllama}
                className="w-full text-left bg-card rounded-2xl border border-border hover:border-primary/30 p-5 space-y-2 transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center"><Server className="h-4 w-4 text-muted-foreground" /></div>
                  <div>
                    <h3 className="font-semibold text-sm">Ollama (local)</h3>
                    <p className="text-xs text-muted-foreground">Modelos locales sin API key — requiere Ollama instalado</p>
                  </div>
                </div>
              </button>
            </div>
          </div>
        )}

        {step === "key" && chosen === "openrouter" && (
          <div className="space-y-6 animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
            <div className="text-center">
              <h2 className="text-xl font-bold tracking-tight">Introduce tu API Key</h2>
              <p className="text-muted-foreground mt-2 text-sm">Ve a <a href="https://openrouter.ai/settings/keys" target="_blank" rel="noopener" className="text-primary hover:underline font-medium">openrouter.ai/settings/keys</a>, crea una key y pégala aquí.</p>
            </div>
            <div className="bg-card rounded-2xl border border-border p-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="wizard-api-key" className="typo-label flex items-center gap-2"><Key className="h-3.5 w-3.5" /> API Key</Label>
                <Input id="wizard-api-key" type="password" placeholder="sk-or-v1-..." value={apiKey} onChange={(e) => { setApiKey(e.target.value); setVerifyResult(null); }} onKeyDown={(e) => { if (e.key === "Enter" && apiKey.trim()) handleVerifyOpenRouter(); }} className="h-12 bg-background typo-input font-mono" autoFocus />
              </div>
              {verifyResult && !verifyResult.ok && (<div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-lg"><AlertCircle className="h-4 w-4 shrink-0" /><span>{verifyResult.error}</span></div>)}
              {verifyResult?.ok && (<div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 dark:bg-green-900/20 p-3 rounded-lg"><CheckCircle className="h-4 w-4 shrink-0" /><span>API key verificada correctamente</span></div>)}
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 h-11 cursor-pointer" onClick={() => { setStep("provider"); setChosen(null); }}>Atrás</Button>
              <Button className="flex-1 h-11 font-bold cursor-pointer" disabled={!apiKey.trim() || isVerifying || verifyResult?.ok} onClick={handleVerifyOpenRouter}>
                {isVerifying ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Verificando...</>) : verifyResult?.ok ? (<><CheckCircle className="h-4 w-4 mr-2" /> ¡Listo!</>) : ("Verificar y guardar")}
              </Button>
            </div>
            <div className="text-center"><Button variant="ghost" size="sm" className="text-muted-foreground cursor-pointer" onClick={() => window.open("https://openrouter.ai/settings/keys", "_blank")}><ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Crear cuenta en OpenRouter</Button></div>
          </div>
        )}

        {step === "key" && chosen === "custom" && (
          <div className="space-y-6 animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
            <div className="text-center">
              <h2 className="text-xl font-bold tracking-tight">Proveedor compatible</h2>
              <p className="text-muted-foreground mt-2 text-sm">Endpoint OpenAI-compatible (vLLM, LiteLLM, proxy…)</p>
            </div>
            <div className="bg-card rounded-2xl border border-border p-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="wizard-custom-name" className="typo-label">Nombre</Label>
                <Input id="wizard-custom-name" placeholder="Ej: Mi Proxy LiteLLM" value={customName} onChange={(e) => setCustomName(e.target.value)} className="h-10 bg-background typo-input" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wizard-custom-url" className="typo-label">URL Base</Label>
                <Input id="wizard-custom-url" placeholder="https://my-proxy.example.com/v1" value={customUrl} onChange={(e) => { setCustomUrl(e.target.value); setCustomVerifyResult(null); }} className="h-10 bg-background typo-input font-mono" />
                <p className="typo-caption">{t("customProvider.endpointHint")}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="wizard-custom-key" className="typo-label">API Key (opcional)</Label>
                <Input id="wizard-custom-key" type="password" placeholder="sk-..." value={customKey} onChange={(e) => { setCustomKey(e.target.value); setCustomVerifyResult(null); }} className="h-10 bg-background typo-input" />
              </div>
              <div className="space-y-2">
                <Button variant="outline" size="sm" onClick={handleVerifyCustom} disabled={isCustomVerifying || !customUrl.trim()} className="cursor-pointer h-8">
                  {isCustomVerifying ? (<Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />) : (<RefreshCw className="h-3.5 w-3.5 mr-1.5" />)}
                  {t("customProvider.verify")}
                </Button>
                {customVerifyResult && (
                  <div className="pt-1">
                    {customVerifyResult.ok ? (<VerifiedModelsList models={customVerifyResult.models ?? []} />) : (<p className="typo-caption flex items-center gap-1 text-destructive"><AlertCircle className="h-3.5 w-3.5" /> {customVerifyResult.error}</p>)}
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 h-11 cursor-pointer" onClick={() => { setStep("provider"); setChosen(null); }}>Atrás</Button>
              <Button className="flex-1 h-11 font-bold cursor-pointer" disabled={isSavingCustom || !customName.trim() || !customUrl.trim()} onClick={handleSaveCustom}>{isSavingCustom ? t("customProvider.saving") : t("customProvider.add")}</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
