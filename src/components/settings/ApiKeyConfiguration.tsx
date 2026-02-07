import { Info, KeyRound, Trash2, Clipboard } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { AzureConfiguration } from "./AzureConfiguration";
import { VertexConfiguration } from "./VertexConfiguration";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { UserSettings } from "@/lib/schemas";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { showError } from "@/lib/toast";

// Helper function to mask ENV API keys (move or duplicate if needed elsewhere)
const maskEnvApiKey = (key: string | undefined): string => {
  if (!key) return "Not Set";
  if (key.length < 8) return "****";
  return `${key.substring(0, 4)}...${key.substring(key.length - 4)}`;
};

interface ApiKeyConfigurationProps {
  provider: string;
  providerDisplayName: string;
  settings: UserSettings | null | undefined;
  envVars: Record<string, string | undefined>;
  envVarName?: string;
  isSaving: boolean;
  saveError: string | null;
  apiKeyInput: string;
  onApiKeyInputChange: (value: string) => void;
  onSaveKey: (value: string) => Promise<void>;
  onDeleteKey: () => Promise<void>;
  isDyad: boolean;
  updateSettings: (settings: Partial<UserSettings>) => Promise<UserSettings>;
}

export function ApiKeyConfiguration({
  provider,
  providerDisplayName,
  settings,
  envVars,
  envVarName,
  isSaving,
  saveError,
  apiKeyInput,
  onApiKeyInputChange,
  onSaveKey,
  onDeleteKey,
  isDyad,
  updateSettings,
}: ApiKeyConfigurationProps) {
  // Special handling for Azure OpenAI which requires environment variables
  if (provider === "azure") {
    return (
      <AzureConfiguration
        settings={settings}
        envVars={envVars}
        updateSettings={updateSettings}
      />
    );
  }
  // Special handling for Google Vertex AI which uses service account credentials
  if (provider === "vertex") {
    return <VertexConfiguration />;
  }

  const envApiKey = envVarName ? envVars[envVarName] : undefined;
  const userApiKey = settings?.providerSettings?.[provider]?.apiKey?.value;

  const isValidUserKey =
    !!userApiKey &&
    !userApiKey.startsWith("Invalid Key") &&
    userApiKey !== "Not Set";
  const hasEnvKey = !!envApiKey;

  const activeKeySource = isValidUserKey
    ? "settings"
    : hasEnvKey
      ? "env"
      : "none";

  const defaultAccordionValue = [];
  if (isValidUserKey || !hasEnvKey) {
    defaultAccordionValue.push("settings-key");
  }
  if (!isDyad && hasEnvKey) {
    defaultAccordionValue.push("env-key");
  }

  return (
    <Accordion
      type="multiple"
      className="w-full space-y-4"
      defaultValue={defaultAccordionValue}
    >
      <AccordionItem
        value="settings-key"
        className="border rounded-lg px-4 bg-(--background-lightest)"
      >
        <AccordionTrigger className="text-lg font-medium hover:no-underline cursor-pointer">
          Clave API desde Configuración
        </AccordionTrigger>
        <AccordionContent className="pt-4 ">
          {isValidUserKey && (
            <Alert variant="default" className="mb-4">
              <KeyRound className="h-4 w-4" />
              <AlertTitle className="flex justify-between items-center">
                <span>Clave Actual (Configuración)</span>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={onDeleteKey}
                  disabled={isSaving}
                  className="flex items-center gap-1 h-7 px-2"
                >
                  <Trash2 className="h-4 w-4" />
                  {isSaving ? "Eliminando..." : "Eliminar"}
                </Button>
              </AlertTitle>
              <AlertDescription>
                <p className="font-mono text-sm">{userApiKey}</p>
                {activeKeySource === "settings" && (
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                    Key activa
                  </p>
                )}
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <label
              htmlFor="apiKeyInput"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              {isValidUserKey ? "Actualizar" : "Configurar"} API Key de{" "}
              {providerDisplayName}
            </label>
            <div className="flex items-start space-x-2">
              <Input
                id="apiKeyInput"
                value={apiKeyInput}
                onChange={(e) => onApiKeyInputChange(e.target.value)}
                placeholder={`Introduce la nueva API Key de ${providerDisplayName} aquí`}
                className={`flex-grow ${saveError ? "border-red-500" : ""}`}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={async () => {
                      try {
                        const text = await navigator.clipboard.readText();
                        if (text) {
                          onSaveKey(text);
                        }
                      } catch (error) {
                        showError("Error al pegar del portapapeles");
                        console.error("Failed to paste from clipboard", error);
                      }
                    }}
                    disabled={isSaving}
                    variant="outline"
                    size="icon"
                    title="Pegar del portapapeles y guardar"
                    aria-label="Pegar del portapapeles y guardar"
                  >
                    <Clipboard className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Pegar del portapapeles y guardar
                </TooltipContent>
              </Tooltip>

              <Button
                onClick={() => onSaveKey(apiKeyInput)}
                disabled={isSaving || !apiKeyInput}
              >
                {isSaving ? "Guardando..." : "Guardar clave"}
              </Button>
            </div>
            {saveError && <p className="text-xs text-red-600">{saveError}</p>}
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Establecer una clave aquí anulará la variable de entorno (si está
              establecida).stablecida).stablecida).stablecida).stablecida).
            </p>
          </div>
        </AccordionContent>
      </AccordionItem>

      {!isDyad && envVarName && (
        <AccordionItem
          value="env-key"
          className="border rounded-lg px-4 bg-(--background-lightest)"
        >
          <AccordionTrigger className="text-lg font-medium hover:no-underline cursor-pointer">
            Clave API de variable de entornotorno
          </AccordionTrigger>
          <AccordionContent className="pt-4">
            {hasEnvKey ? (
              <Alert variant="default">
                <KeyRound className="h-4 w-4" />
                <AlertTitle>
                  Clave de Variable de Entorno ({envVarName})
                </AlertTitle>
                <AlertDescription>
                  <p className="font-mono text-sm">
                    {maskEnvApiKey(envApiKey)}
                  </p>
                  {activeKeySource === "env" && (
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                      Esta clave está actualmente activa (no hay clave de
                      configuración establecida).
                    </p>
                  )}
                  {activeKeySource === "settings" && (
                    <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                      Esta clave está siendo reemplazada actualmente por la
                      clave establecida en Configuración.
                    </p>
                  )}
                </AlertDescription>
              </Alert>
            ) : (
              <Alert variant="default">
                <Info className="h-4 w-4" />
                <AlertTitle>Variable de Entorno No Establecida</AlertTitle>
                <AlertDescription>
                  La variable de entorno{" "}
                  <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1 rounded text-xs">
                    {envVarName}
                  </code>{" "}
                  no está establecida.
                </AlertDescription>
              </Alert>
            )}
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
              Esta clave se establece fuera de la aplicación. """ If present, it
              will be used only if no key is configured in the Settings section
              above. Requires app restart to detect changes.
            </p>
          </AccordionContent>
        </AccordionItem>
      )}
    </Accordion>
  );
}
