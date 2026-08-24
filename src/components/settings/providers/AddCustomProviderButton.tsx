import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/lib/i18n";
import { queryKeys } from "@/lib/queryKeys";
import { useSettings } from "@/hooks/useSettings";
import { Plus, Loader2, RefreshCw, AlertCircle } from "@/components/ui/icons";
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
import { ipc } from "@/ipc/types";
import { CUSTOM_PROVIDER_PREFIX } from "@/ipc/shared/language_model_constants";
import { VerifiedModelsList } from "./VerifiedModelsList";
import type { CustomProviderConfig } from "@/lib/schemas";

export function AddCustomProviderButton() {
  const { t, tPlural } = useI18n();
  const { settings, updateSettings } = useSettings();
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [newName, setNewName] = useState("");
  const [newBaseUrl, setNewBaseUrl] = useState("");
  const [newApiKey, setNewApiKey] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{
    ok: boolean;
    count?: number;
    models?: { id: string }[];
    error?: string;
  } | null>(null);

  const customProviders = settings?.customProviders ?? [];

  const handleVerify = async () => {
    if (!newBaseUrl.trim()) {
      showError(t("customProvider.urlRequiredVerify"));
      return;
    }
    setIsVerifying(true);
    setVerifyResult(null);
    try {
      const result = await ipc.languageModel.verifyCustomProvider({
        apiBaseUrl: newBaseUrl.trim(),
        apiKey: newApiKey.trim() || undefined,
      });
      setVerifyResult(result);
      if (result.ok) {
        showSuccess(
          tPlural("customProvider.connected", result.count ?? 0),
        );
      } else {
        showError(`Error: ${result.error}`);
      }
    } catch (error: any) {
      setVerifyResult({ ok: false, error: error.message });
      showError(`Error: ${error.message}`);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleAdd = async () => {
    if (!newName.trim()) {
      showError(t("customProvider.nameRequired"));
      return;
    }
    if (!newBaseUrl.trim()) {
      showError(t("customProvider.urlRequired"));
      return;
    }

    setIsSaving(true);
    try {
      const slug = newName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-");
      const id = `${CUSTOM_PROVIDER_PREFIX}${slug}`;
      if (customProviders.some((p) => p.id === id)) {
        showError(t("customProvider.duplicateName"));
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

      await updateSettings({
        customProviders: [...customProviders, newProvider],
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.languageModels.providers,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.languageModels.byProviders,
      });

      setNewName("");
      setNewBaseUrl("");
      setNewApiKey("");
      setShowDialog(false);
      showSuccess(t("customProvider.addedSuccess", { name: newProvider.name }));
    } catch (error: any) {
      showError(error.message || t("customProvider.addError"));
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
          {t("customProvider.addButton")}
        </span>
      </button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-4 w-4" /> {t("customProvider.newProviderTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="provider-name" className="typo-label">
                {t("customProvider.name")}
              </Label>
              <Input
                id="provider-name"
                placeholder={t("customProvider.namePlaceholder")}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="h-10 bg-background typo-input"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="provider-url" className="typo-label">
                {t("customProvider.urlBase")}
              </Label>
              <Input
                id="provider-url"
                placeholder="https://my-proxy.example.com/v1"
                value={newBaseUrl}
                onChange={(e) => {
                  setNewBaseUrl(e.target.value);
                  setVerifyResult(null);
                }}
                className="h-10 bg-background typo-input font-mono"
              />
              <p className="typo-caption">
                {t("customProvider.endpointHint")}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="provider-key" className="typo-label">
                {t("customProvider.apiKeyOptional")}
              </Label>
              <Input
                id="provider-key"
                type="password"
                placeholder="sk-..."
                value={newApiKey}
                onChange={(e) => {
                  setNewApiKey(e.target.value);
                  setVerifyResult(null);
                }}
                className="h-10 bg-background typo-input"
              />
            </div>
            <div className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleVerify}
                disabled={isVerifying || !newBaseUrl.trim()}
                className="cursor-pointer h-8"
              >
                {isVerifying ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                )}
                {t("customProvider.verify")}
              </Button>
              {verifyResult && (
                <div className="space-y-2 pt-1">
                  {verifyResult.ok ? (
                    <VerifiedModelsList models={verifyResult.models ?? []} />
                  ) : (
                    <p className="typo-caption flex items-center gap-1 text-destructive">
                      <AlertCircle className="h-3.5 w-3.5" />
                      {verifyResult.error}
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => setShowDialog(false)}
                className="h-10 px-4"
              >
                {t("customProvider.cancel")}
              </Button>
              <Button
                onClick={handleAdd}
                disabled={isSaving || !newName || !newBaseUrl}
                className="h-10 px-6 font-bold"
              >
                {isSaving ? t("customProvider.saving") : t("customProvider.add")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
