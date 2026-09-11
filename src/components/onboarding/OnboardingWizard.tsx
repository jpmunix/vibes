import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSettings } from "@/hooks/useSettings";
import { useLanguageModelProviders } from "@/hooks/useLanguageModelProviders";
import { useTheme } from "@/contexts/ThemeContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CheckCircle,
  AlertCircle,
  Loader2,
  Sparkles,
  RefreshCw,
  User,
  Bot,
  Palette,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  Check,
  Monitor,
  Settings2,
  Cog,
  HelpCircle,
} from "@/components/ui/icons";
import { showError, showSuccess } from "@/lib/toast";
import { queryKeys } from "@/lib/queryKeys";
import { ipc } from "@/ipc/types";
import { CUSTOM_PROVIDER_PREFIX } from "@/ipc/shared/language_model_constants";
import { useI18n } from "@/lib/i18n";
import { PROVIDER_PRESETS, getPresetById } from "@/lib/providerPresets";
import { FONT_OPTIONS } from "@/shared/fonts";
import { VIBES_PERMISSION_DEFAULTS } from "@/ipc/runtime/permission_defaults";
import { parseModelReference } from "@/ipc/utils/model_reference";

type OnboardingStep =
  | "name"
  | "experience"
  | "provider"
  | "model"
  | "appearance"
  | "summary";

export function OnboardingWizard() {
  const { t } = useI18n();
  const { settings, loading: settingsLoading, updateSettings } = useSettings();
  const { isAnyProviderSetup, isLoading: providersLoading } =
    useLanguageModelProviders();
  const {
    theme,
    setTheme,
    applyFont,
    applyChatFont,
    currentFontId,
    currentChatFontId,
  } = useTheme();
  const queryClient = useQueryClient();

  const [currentStep, setCurrentStep] = useState<OnboardingStep>("name");

  // Step 1: Name
  const [userName, setUserName] = useState("");

  // Step 2: Provider
  const [selectedPresetId, setSelectedPresetId] = useState("openrouter");
  const [providerName, setProviderName] = useState(
    getPresetById("openrouter")?.defaultName ?? "OpenRouter",
  );
  const [apiBaseUrl, setApiBaseUrl] = useState(
    getPresetById("openrouter")?.defaultBaseUrl ?? "https://openrouter.ai/api/v1",
  );
  const [apiKey, setApiKey] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{
    ok: boolean;
    count?: number;
    models?: { id: string }[];
    error?: string;
  } | null>(null);

  // Step 3: Model — `settings.selectedModel` es un objeto LargeLanguageModel; usamos string id
  const [selectedModelId, setSelectedModelId] = useState<string>(
    typeof settings?.selectedModel === "string"
      ? settings.selectedModel
      : "google/gemini-2.5-flash-lite",
  );

  // Step 5: Experience Level
  const [experienceLevel, setExperienceLevel] = useState<"expert" | "beginner">(
    "expert",
  );

  // Step 6: Start tips checkbox
  const [showStartTips, setShowStartTips] = useState(true);

  const [isSaving, setIsSaving] = useState(false);

  const stepsList: OnboardingStep[] = [
    "name",
    "experience",
    "provider",
    "model",
    "appearance",
    "summary",
  ];

  const currentStepIndex = stepsList.indexOf(currentStep);

  const canGoNext = useMemo(() => {
    switch (currentStep) {
      case "name":
        return userName.trim().length > 0;
      case "experience":
        return experienceLevel === "expert" || experienceLevel === "beginner";
      case "provider":
        return verifyResult?.ok === true;
      case "model":
        return selectedModelId.trim().length > 0;
      case "appearance":
      case "summary":
        return true;
      default:
        return false;
    }
  }, [currentStep, userName, experienceLevel, verifyResult, selectedModelId]);

  // El onboarding es obligatorio: se muestra hasta que el usuario lo ha
  // completado (hasRunBefore) Y tiene al menos un proveedor configurado.
  if (settingsLoading || providersLoading) return null;
  if (settings?.hasRunBefore && isAnyProviderSetup()) {
    return null;
  }

  const handlePresetChange = (presetId: string) => {
    setSelectedPresetId(presetId);
    setVerifyResult(null);
    const preset = getPresetById(presetId);
    if (!preset) return;
    if (!preset.isCustom) {
      setProviderName(preset.defaultName);
      setApiBaseUrl(preset.defaultBaseUrl);
    }
  };

  const handleTestConnection = async () => {
    if (!apiBaseUrl.trim()) {
      showError(t("customProvider.urlRequiredVerify"));
      return;
    }
    setIsVerifying(true);
    setVerifyResult(null);
    try {
      if (selectedPresetId === "openrouter" && apiKey.trim()) {
        const response = await fetch("https://openrouter.ai/api/v1/auth/key", {
          headers: { Authorization: `Bearer ${apiKey.trim()}` },
        });
        if (!response.ok)
          throw new Error(`API key inválida (HTTP ${response.status})`);
        const data = await response.json();
        if (data?.data) {
          let fetchedModels: { id: string }[] | undefined;
          try {
            const modelsRes = await fetch("https://openrouter.ai/api/v1/models", {
              headers: { Authorization: `Bearer ${apiKey.trim()}` },
            });
            if (modelsRes.ok) {
              const modelsJson = await modelsRes.json();
              if (Array.isArray(modelsJson?.data)) {
                fetchedModels = modelsJson.data.map((m: any) => ({
                  id: m.id || m.name,
                }));
              }
            }
          } catch {
            /* OpenRouter models list is secondary */
          }

          setVerifyResult({
            ok: true,
            models: fetchedModels,
            count: fetchedModels?.length,
          });
          if (fetchedModels && fetchedModels.length > 0) {
            setSelectedModelId(fetchedModels[0].id);
          }
          showSuccess(t("onboarding.connectionSuccess"));
        } else throw new Error("Respuesta inesperada de OpenRouter");
      } else {
        const result = await ipc.languageModel.verifyCustomProvider({
          apiBaseUrl: apiBaseUrl.trim(),
          apiKey: apiKey.trim() || undefined,
        });
        setVerifyResult(result);
        if (result.ok) {
          showSuccess(t("onboarding.connectionSuccess"));
          if (result.models && result.models.length > 0) {
            setSelectedModelId(result.models[0].id);
          }
        } else {
          showError(`Error: ${result.error}`);
        }
      }
    } catch (err: any) {
      setVerifyResult({ ok: false, error: err.message });
      showError(`Error: ${err.message}`);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleFinishWizard = async () => {
    setIsSaving(true);
    try {
      // 1. Guardar nombre y experiencia en el perfil de usuario
      if (userName.trim()) {
        try {
          const authUser = await ipc.auth.updateProfile({
            userId: "default-user",
            displayName: userName.trim(),
            experienceLevel,
          });
          queryClient.setQueryData(["auth-user"], authUser);
        } catch {
          /* ignore if auth not initialized in local standalone */
        }
      }

      // 2. Guardar proveedor según la elección
      if (selectedPresetId === "openrouter") {
        if (apiKey.trim()) {
          await updateSettings({
            providerSettings: {
              ...settings?.providerSettings,
              openrouter: { apiKey: { value: apiKey.trim() } },
            },
          });
        }
      } else {
        const slug = (providerName || selectedPresetId)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-");
        const id = `${CUSTOM_PROVIDER_PREFIX}${slug}`;
        const existing = settings?.customProviders ?? [];
        const newProvider = {
          id,
          name: providerName.trim() || "Custom Provider",
          apiBaseUrl: apiBaseUrl.trim().replace(/\/+$/, ""),
          ...(apiKey.trim() ? { apiKey: { value: apiKey.trim() } } : {}),
          presetId: selectedPresetId !== "custom" ? selectedPresetId : undefined,
          modelsSource: "openai-compatible" as const,
        };
        await updateSettings({
          customProviders: [...existing, newProvider],
        });
      }

      // 3. Permisos según el nivel de experiencia
      const baseTools: Record<string, "allow" | "ask" | "deny"> = {
        ...VIBES_PERMISSION_DEFAULTS,
      };
      if (experienceLevel === "expert") {
        baseTools.read_file = "allow";
        baseTools.glob = "allow";
        baseTools.grep = "allow";
      }

      const parsedModel = parseModelReference(selectedModelId) ?? {
        model: selectedModelId,
        provider: selectedPresetId === "openrouter" ? "openrouter" : "custom",
      };

      await updateSettings({
        selectedModel: {
          name: parsedModel.model,
          provider: parsedModel.provider,
        },
        hasRunBefore: true,
        permissions: {
          ...settings?.permissions,
          tools: baseTools,
        },
        experienceLevel,
        showStartTips,
      } as any);

      queryClient.invalidateQueries({
        queryKey: queryKeys.languageModels.providers,
      });

      showSuccess(t("onboarding.ready"));
    } catch (err: any) {
      showError(err.message || t("customProvider.addError"));
    } finally {
      setIsSaving(false);
    }
  };

  const goNext = () => {
    if (!canGoNext) {
      if (currentStep === "provider" && !verifyResult?.ok) {
        showError(t("onboarding.connectionRequired"));
      }
      return;
    }
    if (currentStepIndex < stepsList.length - 1) {
      setCurrentStep(stepsList[currentStepIndex + 1]);
    }
  };

  const goPrev = () => {
    if (currentStepIndex > 0) {
      setCurrentStep(stepsList[currentStepIndex - 1]);
    }
  };

  const availableModels: { id: string }[] = verifyResult?.models ?? [];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/95 backdrop-blur-md p-4 overflow-y-auto">
      <div className="w-full max-w-2xl bg-card border border-border rounded-3xl p-8 shadow-2xl space-y-6">
        {/* Header con icono y progreso */}
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-primary/10 text-primary">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">
                {t("wizard.welcomeTitle")}
              </h1>
              <p className="text-xs text-muted-foreground">
                {t("onboarding.progressLabel", {
                  current: currentStepIndex + 1,
                  total: stepsList.length,
                })}
              </p>
            </div>
          </div>
        </div>

        {/* Indicador de pasos (stepper no interactivo para evitar saltos hacia adelante) */}
        <div className="flex items-center justify-between gap-1 overflow-x-auto py-1">
          {stepsList.map((step, idx) => {
            const isActive = step === currentStep;
            const isCompleted = idx < currentStepIndex;
            const stepLabelKey: Record<OnboardingStep, string> = {
              name: "onboarding.stepLabelName",
              experience: "onboarding.stepLabelExperience",
              provider: "onboarding.stepLabelProvider",
              model: "onboarding.stepLabelModel",
              appearance: "onboarding.stepLabelAppearance",
              summary: "onboarding.stepLabelSummary",
            };
            return (
              <div
                key={step}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors select-none ${
                  isActive
                    ? "bg-primary text-primary-foreground font-bold"
                    : isCompleted
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {isCompleted ? <Check className="h-3 w-3" /> : idx + 1}
                <span>{t(stepLabelKey[step])}</span>
              </div>
            );
          })}
        </div>

        {/* Paso 1: Nombre */}
        {currentStep === "name" && (
          <div className="space-y-6 animate-in fade-in-0 duration-300">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                {t("onboarding.nameTitle")}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t("onboarding.nameSubtitle")}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="onboarding-user-name" className="typo-label">
                {t("onboarding.nameLabel")}
              </Label>
              <Input
                id="onboarding-user-name"
                placeholder={t("onboarding.namePlaceholder")}
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canGoNext) goNext();
                }}
                className="h-12 bg-background typo-input text-base"
                autoFocus
              />
            </div>
          </div>
        )}

        {/* Paso 2: Nivel de Experiencia */}
        {currentStep === "experience" && (
          <div className="space-y-6 animate-in fade-in-0 duration-300">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                {t("onboarding.experienceTitle")}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t("onboarding.experienceSubtitle")}
              </p>
            </div>

            <div className="grid gap-4">
              <button
                type="button"
                onClick={() => setExperienceLevel("expert")}
                className={`p-5 rounded-2xl border text-left transition-all cursor-pointer ${
                  experienceLevel === "expert"
                    ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                    : "border-border hover:bg-muted/30"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-bold text-sm">
                    {t("onboarding.expertTitle")}
                  </h3>
                  {experienceLevel === "expert" && (
                    <CheckCircle className="h-5 w-5 text-primary" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t("onboarding.expertDesc")}
                </p>
              </button>

              <button
                type="button"
                onClick={() => setExperienceLevel("beginner")}
                className={`p-5 rounded-2xl border text-left transition-all cursor-pointer ${
                  experienceLevel === "beginner"
                    ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                    : "border-border hover:bg-muted/30"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-bold text-sm">
                    {t("onboarding.beginnerTitle")}
                  </h3>
                  {experienceLevel === "beginner" && (
                    <CheckCircle className="h-5 w-5 text-primary" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t("onboarding.beginnerDesc")}
                </p>
              </button>
            </div>
          </div>
        )}

        {/* Paso 3: Proveedor de IA (100% OpenAI compatible) */}
        {currentStep === "provider" && (
          <div className="space-y-6 animate-in fade-in-0 duration-300">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Bot className="h-5 w-5 text-primary" />
                {t("onboarding.providerTitle")}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t("onboarding.providerSubtitle")}
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="onboarding-preset-select" className="typo-label">
                  {t("customProvider.preset")}
                </Label>
                <select
                  id="onboarding-preset-select"
                  value={selectedPresetId}
                  onChange={(e) => handlePresetChange(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-border bg-background typo-input text-sm cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {PROVIDER_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              {selectedPresetId !== "openrouter" && (
                <div className="space-y-2">
                  <Label htmlFor="onboarding-provider-name" className="typo-label">
                    {t("customProvider.name")}
                  </Label>
                  <Input
                    id="onboarding-provider-name"
                    value={providerName}
                    onChange={(e) => setProviderName(e.target.value)}
                    className="h-10 bg-background typo-input"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="onboarding-base-url" className="typo-label">
                  {t("customProvider.urlBase")}
                </Label>
                <Input
                  id="onboarding-base-url"
                  value={apiBaseUrl}
                  onChange={(e) => {
                    setApiBaseUrl(e.target.value);
                    setVerifyResult(null);
                  }}
                  className="h-10 bg-background typo-input font-mono text-xs"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="onboarding-api-key" className="typo-label">
                  {t("customProvider.apiKeyOptional")}
                </Label>
                <Input
                  id="onboarding-api-key"
                  type="password"
                  placeholder="sk-..."
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setVerifyResult(null);
                  }}
                  className="h-10 bg-background typo-input font-mono"
                />
              </div>

              <div className="pt-2 flex items-center justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTestConnection}
                  disabled={isVerifying || !apiBaseUrl.trim()}
                  className="cursor-pointer"
                >
                  {isVerifying ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  {t("onboarding.testConnection")}
                </Button>

                {verifyResult && (
                  <div className="flex items-center gap-2 text-xs font-medium">
                    {verifyResult.ok ? (
                      <span className="text-green-600 flex items-center gap-1">
                        <CheckCircle className="h-4 w-4" />
                        {t("onboarding.connectionSuccess")}
                        {verifyResult.count !== undefined && verifyResult.count > 0 && (
                          <span className="text-muted-foreground ml-1">
                            ({verifyResult.count} modelos)
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-destructive flex items-center gap-1">
                        <AlertCircle className="h-4 w-4" />
                        {verifyResult.error}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Paso 4: Modelo principal (desplegable de modelos detectados) */}
        {currentStep === "model" && (
          <div className="space-y-6 animate-in fade-in-0 duration-300">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Settings2 className="h-5 w-5 text-primary" />
                {t("onboarding.modelTitle")}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t("onboarding.modelSubtitle")}
              </p>
            </div>

            <div className="space-y-4">
              {availableModels.length > 0 ? (
                <div className="space-y-2">
                  <Label htmlFor="onboarding-model-select" className="typo-label">
                    {t("onboarding.modelSelectLabel")}
                  </Label>
                  <select
                    id="onboarding-model-select"
                    value={selectedModelId}
                    onChange={(e) => setSelectedModelId(e.target.value)}
                    className="w-full h-11 px-3 rounded-xl border border-border bg-background typo-input font-mono text-sm cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {availableModels.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.id}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="onboarding-model-id" className="typo-label">
                    {t("onboarding.modelSelectLabel")}
                  </Label>
                  <Input
                    id="onboarding-model-id"
                    placeholder="deepseek/deepseek-chat"
                    value={selectedModelId}
                    onChange={(e) => setSelectedModelId(e.target.value)}
                    className="h-11 bg-background typo-input font-mono"
                  />
                </div>
              )}

              {availableModels.length > 0 && (
                <div className="space-y-2 pt-2">
                  <Label
                    htmlFor="onboarding-model-custom"
                    className="typo-caption text-muted-foreground"
                  >
                    {t("onboarding.modelCustomFallback")}
                  </Label>
                  <Input
                    id="onboarding-model-custom"
                    placeholder="Ej: deepseek-chat"
                    value={selectedModelId}
                    onChange={(e) => setSelectedModelId(e.target.value)}
                    className="h-9 bg-background typo-input font-mono text-xs"
                  />
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                {t("onboarding.modelManualHint")}
              </p>
            </div>
          </div>
        )}

        {/* Paso 5: Apariencia y fuentes */}
        {currentStep === "appearance" && (
          <div className="space-y-6 animate-in fade-in-0 duration-300">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Palette className="h-5 w-5 text-primary" />
                {t("onboarding.appearanceTitle")}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t("onboarding.appearanceSubtitle")}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[
                { id: "system", label: t("onboarding.themeSystem"), icon: Monitor },
                { id: "light", label: t("onboarding.themeLight"), icon: Sparkles },
                { id: "dark", label: t("onboarding.themeDark"), icon: Cog },
              ].map((tOption) => {
                const Icon = tOption.icon;
                const isSel = theme === tOption.id;
                return (
                  <button
                    key={tOption.id}
                    type="button"
                    onClick={() => setTheme(tOption.id as any)}
                    className={`flex flex-col items-center justify-center p-4 rounded-2xl border transition-all cursor-pointer ${
                      isSel
                        ? "border-primary bg-primary/10 text-primary font-bold shadow-sm"
                        : "border-border hover:bg-muted/40 text-muted-foreground"
                    }`}
                  >
                    <Icon className="h-6 w-6 mb-2" />
                    <span className="text-xs">{tOption.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="space-y-2">
              <Label className="typo-label">{t("onboarding.fontUILabel")}</Label>
              <select
                value={currentFontId}
                onChange={(e) => applyFont(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-border bg-background typo-input cursor-pointer"
              >
                {FONT_OPTIONS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label className="typo-label">{t("onboarding.fontChatLabel")}</Label>
              <select
                value={currentChatFontId}
                onChange={(e) => applyChatFont(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-border bg-background typo-input cursor-pointer"
              >
                {FONT_OPTIONS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Paso 6: Resumen en prosa + ¿Qué va a pasar ahora? + Checkbox Start Tips */}
        {currentStep === "summary" && (
          <div className="space-y-6 animate-in fade-in-0 duration-300">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                {t("onboarding.summaryTitle")}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t("onboarding.summarySubtitle")}
              </p>
            </div>

            {/* Resumen en prosa */}
            <div className="bg-muted/30 rounded-2xl p-5 border border-border space-y-4">
              <p className="text-sm leading-relaxed text-foreground">
                {t("onboarding.summaryProse", {
                  name: userName.trim() || "Colega",
                  provider: providerName || selectedPresetId,
                  model: selectedModelId,
                  experience:
                    experienceLevel === "expert"
                      ? t("onboarding.expertTitle")
                      : t("onboarding.beginnerTitle"),
                })}
              </p>

              {/* ¿Qué va a pasar ahora? */}
              <div className="pt-3 border-t border-border/60 space-y-1.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <HelpCircle className="h-3.5 w-3.5 text-primary" />
                  {t("onboarding.whatHappensNextTitle")}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t("onboarding.whatHappensNextDesc")}
                </p>
              </div>

              {/* Checkbox de consejos de inicio (start tips) */}
              <div className="pt-3 border-t border-border/60 flex items-center gap-3">
                <Checkbox
                  id="onboarding-start-tips"
                  checked={showStartTips}
                  onCheckedChange={(checked) => setShowStartTips(checked === true)}
                />
                <Label
                  htmlFor="onboarding-start-tips"
                  className="text-xs text-foreground cursor-pointer select-none"
                >
                  {t("onboarding.showStartTipsLabel")}
                </Label>
              </div>
            </div>
          </div>
        )}

        {/* Botones de navegación del footer */}
        <div className="flex items-center justify-between border-t border-border pt-4">
          <Button
            variant="ghost"
            onClick={goPrev}
            disabled={currentStepIndex === 0}
            className="cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t("onboarding.prevStep")}
          </Button>

          {currentStep === "summary" ? (
            <Button
              onClick={handleFinishWizard}
              disabled={isSaving}
              className="font-bold px-8 cursor-pointer"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Check className="h-4 w-4 mr-2" />
              )}
              {t("onboarding.finishButton")}
            </Button>
          ) : (
            <Button
              onClick={goNext}
              disabled={!canGoNext}
              className="font-bold cursor-pointer"
            >
              {t("onboarding.nextStep")}
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
