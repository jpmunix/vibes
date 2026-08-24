import { useState, useEffect } from "react";
import { useI18n } from "@/lib/i18n";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info, CheckCircle2 } from "@/components/ui/icons";
import { useSettings } from "@/hooks/useSettings";
import type { UserSettings, VertexProviderSetting } from "@/lib/schemas";

export function VertexConfiguration() {
  const { t } = useI18n();
  const { settings, updateSettings } = useSettings();
  const existing =
    (settings?.providerSettings?.vertex as VertexProviderSetting) ?? {};

  const [projectId, setProjectId] = useState(existing.projectId || "");
  const [location, setLocation] = useState(existing.location || "");
  const [serviceAccountKey, setServiceAccountKey] = useState(
    existing.serviceAccountKey?.value || "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setProjectId(existing.projectId || "");
    setLocation(existing.location || "");
    setServiceAccountKey(existing.serviceAccountKey?.value || "");
  }, [settings?.providerSettings?.vertex]);

  const onSave = async () => {
    setError(null);
    setSaved(false);
    try {
      // If provided, ensure the service account JSON parses
      if (serviceAccountKey) {
        JSON.parse(serviceAccountKey);
      }
    } catch (e: any) {
      setError("Service account JSON is invalid: " + e.message);
      return;
    }

    setSaving(true);
    try {
      const settingsUpdate: Partial<UserSettings> = {
        providerSettings: {
          ...settings?.providerSettings,
          vertex: {
            ...existing,
            projectId: projectId.trim() || undefined,
            location: location || undefined,
            serviceAccountKey: serviceAccountKey
              ? { value: serviceAccountKey }
              : undefined,
          },
        },
      };
      await updateSettings(settingsUpdate);
      setSaved(true);
    } catch (e: any) {
      setError(e?.message || t("providersCloud.vertexSaveError"));
    } finally {
      setSaving(false);
    }
  };

  const isConfigured = Boolean(
    (projectId.trim() && location && serviceAccountKey) ||
    (existing.projectId &&
      existing.location &&
      existing.serviceAccountKey?.value),
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4">
        <div>
          <label className="block typo-label mb-1">Project ID</label>
          <Input
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            placeholder="your-gcp-project-id"
          />
        </div>
        <div>
          <label className="block typo-label mb-1">Location</label>
          <Input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="us-central1"
          />
          <p className="mt-1 typo-caption text-muted-foreground">
            {t("providersCloud.vertexHint")}
          </p>
        </div>
        <div>
          <label className="block typo-label mb-1">
            Service Account JSON Key
          </label>
          <Textarea
            value={serviceAccountKey}
            onChange={(e) => setServiceAccountKey(e.target.value)}
            placeholder={t("providersCloud.vertexKeyPlaceholder")}
            className="min-h-40"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={onSave} disabled={saving}>
          {saving ? t("common.saving") : t("common.saveSettings")}
        </Button>
        {saved && !error && (
          <span className="flex items-center text-green-600 text-sm">
            <CheckCircle2 className="h-4 w-4 mr-1" /> Guardado
          </span>
        )}
      </div>

      {!isConfigured && (
        <Alert variant="default">
          <Info className="h-4 w-4" />
          <AlertTitle>{t("providersCloud.vertexRequired")}</AlertTitle>
          {t("providersCloud.vertexInfo")}
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertTitle>{t("providersCloud.saveError")}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
