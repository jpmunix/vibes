import { useState, useCallback } from "react";
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
} from "@/components/ui/icons";
import { showError, showSuccess } from "@/lib/toast";
import { cn } from "@/lib/utils";
// @ts-ignore
import openrouterLogo from "../../../assets/ai-logos/openrouter-logo.png";

type WizardStep = "welcome" | "key" | "verify";

/**
 * Full-screen wizard shown after login if no OpenRouter API key is configured.
 * Blocks access to the entire app until the user provides a valid key.
 */
export function OpenRouterSetupWizard() {
  const { settings, loading: settingsLoading, updateSettings } = useSettings();
  const { isProviderSetup, isLoading: providersLoading } = useLanguageModelProviders();

  const [step, setStep] = useState<WizardStep>("welcome");
  const [apiKey, setApiKey] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ ok: boolean; error?: string } | null>(null);

  // Don't show the wizard while settings/providers are loading
  if (settingsLoading || providersLoading) return null;

  // If OpenRouter is already set up, don't show the wizard
  if (isProviderSetup("openrouter")) return null;

  const handleVerify = useCallback(async () => {
    if (!apiKey.trim()) {
      showError("Introduce tu API key de OpenRouter");
      return;
    }

    setIsVerifying(true);
    setVerifyResult(null);

    try {
      // Test the key by calling OpenRouter /auth/key
      const response = await fetch("https://openrouter.ai/api/v1/auth/key", {
        headers: { Authorization: `Bearer ${apiKey.trim()}` },
      });

      if (!response.ok) {
        throw new Error(`API key inválida (HTTP ${response.status})`);
      }

      const data = await response.json();
      if (data?.data) {
        setVerifyResult({ ok: true });

        // Save the key
        const keyId = `key_${Date.now()}`;
        await updateSettings({
          providerSettings: {
            ...settings?.providerSettings,
            openrouter: {
              keys: [{ id: keyId, key: { value: apiKey.trim() } }],
              selectedKeyId: keyId,
            },
          },
        });

        showSuccess("¡OpenRouter configurado correctamente!");
      } else {
        throw new Error("Respuesta inesperada de OpenRouter");
      }
    } catch (error: any) {
      setVerifyResult({ ok: false, error: error.message });
    } finally {
      setIsVerifying(false);
    }
  }, [apiKey, settings, updateSettings]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/95 backdrop-blur-md">
      <div className="w-full max-w-lg mx-4">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className="relative">
            <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full" />
            <Sparkles className="h-12 w-12 text-primary relative z-10" />
          </div>
        </div>

        {step === "welcome" && (
          <div className="text-center space-y-6 animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                Bienvenido a Vibes
              </h1>
              <p className="text-muted-foreground mt-2 max-w-md mx-auto">
                Para empezar necesitas una clave API de <strong>OpenRouter</strong>, 
                el servicio que conecta Vibes con los mejores modelos de IA.
              </p>
            </div>

            <div className="bg-card rounded-2xl border border-border p-6 text-left space-y-4">
              <div className="flex items-center gap-3">
                <img src={openrouterLogo} alt="OpenRouter" className="h-8 w-8 rounded-lg" />
                <div>
                  <h3 className="font-semibold text-sm">OpenRouter</h3>
                  <p className="text-xs text-muted-foreground">Acceso a 300+ modelos de IA</p>
                </div>
              </div>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  <span>Registro gratuito con Google o GitHub</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  <span>Modelos gratuitos disponibles para empezar</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  <span>Paga solo por uso — sin suscripciones</span>
                </li>
              </ul>
            </div>

            <div className="flex flex-col gap-3">
              <Button
                size="lg"
                className="w-full h-12 font-bold text-base cursor-pointer"
                onClick={() => {
                  window.open("https://openrouter.ai/settings/keys", "_blank");
                  setStep("key");
                }}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Crear cuenta en OpenRouter
              </Button>
              <Button
                variant="ghost"
                className="text-muted-foreground cursor-pointer"
                onClick={() => setStep("key")}
              >
                Ya tengo una API key
              </Button>
            </div>
          </div>
        )}

        {step === "key" && (
          <div className="space-y-6 animate-in fade-in-0 slide-in-from-bottom-4 duration-500">
            <div className="text-center">
              <h2 className="text-xl font-bold tracking-tight">
                Introduce tu API Key
              </h2>
              <p className="text-muted-foreground mt-2 text-sm">
                Ve a{" "}
                <a
                  href="https://openrouter.ai/settings/keys"
                  target="_blank"
                  rel="noopener"
                  className="text-primary hover:underline font-medium"
                >
                  openrouter.ai/settings/keys
                </a>
                , crea una key y pégala aquí.
              </p>
            </div>

            <div className="bg-card rounded-2xl border border-border p-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="wizard-api-key" className="typo-label flex items-center gap-2">
                  <Key className="h-3.5 w-3.5" />
                  API Key
                </Label>
                <Input
                  id="wizard-api-key"
                  type="password"
                  placeholder="sk-or-v1-..."
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setVerifyResult(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && apiKey.trim()) handleVerify();
                  }}
                  className="h-12 bg-background typo-input font-mono"
                  autoFocus
                />
              </div>

              {verifyResult && !verifyResult.ok && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{verifyResult.error}</span>
                </div>
              )}

              {verifyResult?.ok && (
                <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
                  <CheckCircle className="h-4 w-4 shrink-0" />
                  <span>API key verificada correctamente</span>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 h-11 cursor-pointer"
                onClick={() => setStep("welcome")}
              >
                Atrás
              </Button>
              <Button
                className="flex-1 h-11 font-bold cursor-pointer"
                disabled={!apiKey.trim() || isVerifying || verifyResult?.ok}
                onClick={handleVerify}
              >
                {isVerifying ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Verificando...
                  </>
                ) : verifyResult?.ok ? (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    ¡Listo!
                  </>
                ) : (
                  "Verificar y guardar"
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
