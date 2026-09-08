import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { useSettings } from "@/hooks/useSettings";
import { Label } from "@/components/ui/label";
import { Trash2 } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
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
import { showSuccess } from "@/lib/toast";
import { ProviderHeader } from "./ProviderHeader";
import { useI18n } from "@/lib/i18n";
import { isLastConfiguredProvider } from "./CustomProviderSection";

/**
 * OpenRouter — provider en el mismo nivel que el resto (custom, Ollama).
 * Una única clave API; las opciones avanzadas (gasto, modelo personalizado,
 * modelos habilitados, playground) viven en la card "Deuda"
 * (ProvidersDebtSection) hasta replantear el diseño de esta sección.
 */
/**
 * Construye el objeto de updates para BORRAR el provider OpenRouter.
 *
 * Quitar el provider = enviar `providerSettings` SIN la entrada `openrouter`.
 * No vale con ponerla a `undefined`: el KV store de preferences salta los
 * valores null, y al serializar `providerSettings` entero como un único KV
 * entry la clave `openrouter: undefined` sobreviviría en el objeto viejo.
 * Borramos la clave del objeto (JSON.stringify la omite).
 */
export function buildRemoveProviderUpdates(
  settings: {
    providerSettings?: Record<string, any> | null;
    disabledProviders?: string[];
    activeProviderId?: string;
    customProviders?: Array<{ id: string }>;
    ollamaEnabled?: boolean;
  } | null,
): Record<string, any> {
  const providerId = "openrouter";
  const updates: Record<string, any> = {
    providerSettings: { ...(settings?.providerSettings ?? {}) },
    disabledProviders: (settings?.disabledProviders ?? []).filter(
      (id) => id !== providerId,
    ),
  };
  delete updates.providerSettings[providerId];
  // Si OpenRouter era el activeProviderId (o no había ninguno), caer al
  // primer provider válido.
  if (
    !settings?.activeProviderId ||
    settings.activeProviderId === providerId
  ) {
    const customs = settings?.customProviders ?? [];
    const ollamaOn = settings?.ollamaEnabled !== false;
    if (customs.length > 0) {
      updates.activeProviderId = customs[0].id;
    } else if (ollamaOn) {
      updates.activeProviderId = "ollama";
    }
  }
  return updates;
}

export function OpenRouterProviderSection() {
  const { t } = useI18n();
  const { settings, updateSettings } = useSettings();
  const queryClient = useQueryClient();
  const providerId = "openrouter";

  const [expanded, setExpanded] = useState(true);
  const [keyInput, setKeyInput] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const disabledProviders = settings?.disabledProviders ?? [];
  const enabled = !disabledProviders.includes(providerId);
  const isLastProvider = isLastConfiguredProvider(settings);

  const openRouterSettings = settings?.providerSettings?.[providerId] as any;
  const apiKey = openRouterSettings?.apiKey?.value ?? "";
  // null = "no editado todavía" (evita pisar la clave con "" durante el load inicial)
  const effectiveKey = keyInput ?? apiKey;
  const dirty = keyInput !== null && keyInput !== apiKey;

  useEffect(() => {
    if (keyInput !== null && keyInput === apiKey) setKeyInput(null);
  }, [apiKey, keyInput]);

  const handleToggle = async (on: boolean) => {
    const current = settings?.disabledProviders ?? [];
    const updated = on
      ? current.filter((id) => id !== providerId)
      : [...current, providerId];
    await updateSettings({ disabledProviders: updated });
  };

  const handleRemoveProvider = async () => {
    if (isLastProvider) return;
    const updates = buildRemoveProviderUpdates(settings);
    await updateSettings(updates);
    queryClient.invalidateQueries({
      queryKey: queryKeys.languageModels.providers,
    });
    queryClient.invalidateQueries({
      queryKey: queryKeys.languageModels.byProviders,
    });
    showSuccess(t("openRouter.removed"));
  };

  const handleSaveKey = async () => {
    const value = effectiveKey.trim();
    await updateSettings({
      providerSettings: {
        ...settings?.providerSettings,
        [providerId]: {
          ...openRouterSettings,
          // Una sola clave: se usa apiKey (precedencia 1 en el resolver).
          // Se limpia el legacy multi-key para no dejar dos fuentes de clave.
          apiKey: value ? { value } : undefined,
          keys: undefined,
          selectedKeyId: undefined,
        },
      },
    });
    setKeyInput(null);
    queryClient.invalidateQueries({
      queryKey: queryKeys.languageModels.providers,
    });
    queryClient.invalidateQueries({
      queryKey: queryKeys.languageModels.byProviders,
    });
  };

  // Migrate legacy multi-key → single apiKey (una sola vez, al montar).
  useEffect(() => {
    const keys = (openRouterSettings?.keys ?? []) as Array<{
      id: string;
      key?: { value?: string };
    }>;
    const selected = openRouterSettings?.selectedKeyId
      ? keys.find((k) => k.id === openRouterSettings.selectedKeyId)?.key?.value
      : undefined;
    const value = apiKey || selected || keys[0]?.key?.value;
    if (value && (!openRouterSettings || openRouterSettings.keys)) {
      updateSettings({
        providerSettings: {
          ...settings?.providerSettings,
          [providerId]: {
            ...openRouterSettings,
            apiKey: { value },
            keys: undefined,
            selectedKeyId: undefined,
          },
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const subtitle = apiKey
    ? `${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}`
    : t("openRouter.notConfigured");

  return (
    <>
      <div className="rounded-xl border border-border overflow-hidden">
        <ProviderHeader
          name="OpenRouter"
          enabled={enabled}
          onToggle={handleToggle}
          toggleDisabled={isLastProvider && enabled}
          expanded={expanded}
          onToggleExpand={() => setExpanded((e) => !e)}
          subtitle={subtitle}
          rightActions={
            <button
              type="button"
              disabled={isLastProvider}
              title={
                isLastProvider
                  ? t("customProvider.cannotDeleteLast")
                  : t("common.delete")
              }
              onClick={(e) => {
                e.stopPropagation();
                setConfirmRemove(true);
              }}
              className="p-1.5 rounded-md text-muted-foreground/40 hover:!text-red-600 hover:!bg-red-100 dark:hover:!bg-red-900/20 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          }
        />

        {expanded && (
          <div className="p-4 pt-0 space-y-4 border-t border-border bg-muted/10">
            <div className="grid gap-4 pt-4">
              <div className="space-y-2">
                <Label className="typo-label text-xs">
                  {t("openRouter.apiKey")}
                </Label>
                <div className="flex gap-2">
                  <Input
                    type="password"
                    value={effectiveKey}
                    onChange={(e) => setKeyInput(e.target.value)}
                    className="h-9 bg-background typo-input"
                    placeholder="sk-or-v1-..."
                  />
                  <button
                    type="button"
                    disabled={!dirty}
                    onClick={handleSaveKey}
                    className="px-4 h-9 typo-select rounded-lg bg-primary text-primary-foreground shadow-sm cursor-pointer hover:brightness-110 transition-[filter] duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {t("common.save")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Remove OpenRouter Provider Dialog (Card #160 T9) */}
      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("openRouter.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("openRouter.deleteDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                handleRemoveProvider();
                setConfirmRemove(false);
              }}
              className="bg-destructive hover:bg-destructive/90 text-white"
            >
              {t("openRouter.deleteConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
