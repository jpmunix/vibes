import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { CheckCircle2, Info, KeyRound } from "lucide-react";
import type { AzureProviderSetting, UserSettings } from "@/lib/schemas";

interface AzureConfigurationProps {
  settings: UserSettings | null | undefined;
  envVars: Record<string, string | undefined>;
  updateSettings: (settings: Partial<UserSettings>) => Promise<UserSettings>;
}

const AZURE_API_KEY_VAR = "AZURE_API_KEY";
const AZURE_RESOURCE_NAME_VAR = "AZURE_RESOURCE_NAME";

export function AzureConfiguration({
  settings,
  envVars,
  updateSettings,
}: AzureConfigurationProps) {
  const existing =
    (settings?.providerSettings?.azure as AzureProviderSetting | undefined) ??
    {};
  const existingApiKey = existing.apiKey?.value ?? "";
  const existingResourceName = existing.resourceName ?? "";

  const [apiKey, setApiKey] = useState(existingApiKey);
  const [resourceName, setResourceName] = useState(existingResourceName);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setApiKey(existingApiKey);
    setResourceName(existingResourceName);
  }, [existingApiKey, existingResourceName]);

  const envApiKey = envVars[AZURE_API_KEY_VAR];
  const envResourceName = envVars[AZURE_RESOURCE_NAME_VAR];

  const hasSavedSettings = Boolean(existingApiKey && existingResourceName);
  const hasEnvConfiguration = Boolean(envApiKey && envResourceName);
  const isConfigured = hasSavedSettings || hasEnvConfiguration;
  const usingEnvironmentOnly = hasEnvConfiguration && !hasSavedSettings;

  const hasUnsavedChanges = useMemo(() => {
    return apiKey !== existingApiKey || resourceName !== existingResourceName;
  }, [apiKey, existingApiKey, resourceName, existingResourceName]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const trimmedApiKey = apiKey.trim();
      const trimmedResourceName = resourceName.trim();

      const azureSettings: AzureProviderSetting = {
        ...existing,
      };

      if (trimmedResourceName) {
        azureSettings.resourceName = trimmedResourceName;
      } else {
        delete azureSettings.resourceName;
      }

      if (trimmedApiKey) {
        azureSettings.apiKey = { value: trimmedApiKey };
      } else {
        delete azureSettings.apiKey;
      }

      const providerSettings = {
        ...settings?.providerSettings,
        azure: azureSettings,
      };

      await updateSettings({
        providerSettings,
      });

      setSaved(true);
    } catch (e: any) {
      setError(e?.message || "Failed to save Azure settings");
    } finally {
      setSaving(false);
    }
  };

  const status = useMemo(() => {
    if (hasSavedSettings) {
      return {
        variant: "default" as const,
        title: "Azure OpenAI configurado",
        description:
          "Vibes utilizará las credenciales guardadas en Ajustes para los modelos de Azure OpenAI.",
        icon: KeyRound,
        titleClassName: "",
        descriptionClassName: "",
        alertClassName: "",
      };
    }
    if (usingEnvironmentOnly) {
      return {
        variant: "default" as const,
        title: "Usando variables de entorno",
        description:
          "AZURE_API_KEY y AZURE_RESOURCE_NAME están configuradas. Los valores guardados a continuación las sobrescribirán.",
        icon: Info,
        titleClassName: "",
        descriptionClassName: "",
        alertClassName: "",
      };
    }
    return {
      variant: "destructive" as const,
      title: "Configuración de Azure OpenAI requerida",
      description:
        "Proporciona tu nombre de recurso de Azure y la clave API a continuación, o configura las variables de entorno AZURE_API_KEY y AZURE_RESOURCE_NAME.",
      icon: Info,
      titleClassName: "text-red-800 dark:text-red-400",
      descriptionClassName: "text-red-800 dark:text-red-400",
      alertClassName:
        "border-red-200 bg-red-100 dark:border-red-800/50 dark:bg-red-800/20",
    };
  }, [hasSavedSettings, usingEnvironmentOnly]);

  const StatusIcon = status.icon;

  return (
    <div className="space-y-4">
      <Alert variant={status.variant} className={status.alertClassName}>
        <StatusIcon className="h-4 w-4" />
        <AlertTitle className={status.titleClassName}>
          {status.title}
        </AlertTitle>
        <AlertDescription className={status.descriptionClassName}>
          {status.description}
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 gap-4">
        <div>
          <label
            htmlFor="azure-resource-name"
            className="block text-sm font-medium mb-1"
          >
            Nombre del recurso
          </label>
          <Input
            id="azure-resource-name"
            value={resourceName}
            onChange={(e) => {
              setResourceName(e.target.value);
              setSaved(false);
              setError(null);
            }}
            placeholder="your-azure-openai-resource"
            autoComplete="off"
          />
        </div>
        <div>
          <label
            htmlFor="azure-api-key"
            className="block text-sm font-medium mb-1"
          >
            Clave API
          </label>
          <Input
            id="azure-api-key"
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              setSaved(false);
              setError(null);
            }}
            placeholder="Introduce tu clave API de Azure OpenAI"
            autoComplete="off"
            type="password"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={handleSave} disabled={saving || !hasUnsavedChanges}>
          {saving ? "Guardando..." : "Guardar Ajustes"}
        </Button>
        {saved && !error && (
          <span className="flex items-center text-green-600 text-sm">
            <CheckCircle2 className="h-4 w-4 mr-1" /> Guardado
          </span>
        )}
      </div>

      {!isConfigured && !error && (
        <Alert variant="default">
          <Info className="h-4 w-4" />
          <AlertTitle>Configuración necesaria</AlertTitle>
          <AlertDescription>
            Las solicitudes de Azure OpenAI requieren tanto un nombre de recurso
            como una clave API. Introdúcelos arriba o proporciona las variables
            de entorno en su lugar.
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Error al guardar</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Accordion
        type="single"
        collapsible
        defaultValue="azure-env"
        className="w-full space-y-4"
      >
        <AccordionItem
          value="azure-env"
          className="border rounded-lg px-4 bg-background"
        >
          <AccordionTrigger className="text-lg font-medium hover:no-underline cursor-pointer">
            Variables de entorno (opcional)
          </AccordionTrigger>
          <AccordionContent className="pt-4 space-y-4">
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center p-3 bg-muted rounded border">
                <code className="font-mono text-foreground">
                  {AZURE_API_KEY_VAR}
                </code>
                <span
                  data-testid="azure-api-key-status"
                  className={`px-2 py-1 rounded text-xs font-medium ${envApiKey ? "bg-green-100 text-green-800 dark:bg-green-800/20 dark:text-green-400" : "bg-red-100 text-red-800 dark:bg-red-800/20 dark:text-red-400"}`}
                >
                  {envApiKey ? "Configurada" : "No configurada"}
                </span>
              </div>
              <div className="flex justify-between items-center p-3 bg-muted rounded border">
                <code className="font-mono text-foreground">
                  {AZURE_RESOURCE_NAME_VAR}
                </code>
                <span
                  data-testid="azure-resource-name-status"
                  className={`px-2 py-1 rounded text-xs font-medium ${envResourceName ? "bg-green-100 text-green-800 dark:bg-green-800/20 dark:text-green-400" : "bg-red-100 text-red-800 dark:bg-red-800/20 dark:text-red-400"}`}
                >
                  {envResourceName ? "Configurada" : "No configurada"}
                </span>
              </div>
            </div>
            <div className="text-sm text-muted-foreground space-y-2">
              <p>
                Puedes continuar configurando Azure a través de variables de
                entorno. Si ambas variables están presentes y no hay ajustes
                guardados, Vibes las utilizará automáticamente.
              </p>
              <p>
                Los valores guardados en Ajustes tienen prioridad sobre las
                variables de entorno. Reinicia Vibes después de cambiar las
                variables de entorno.
              </p>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
