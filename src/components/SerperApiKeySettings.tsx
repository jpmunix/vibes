import { useState, useEffect } from "react";
import { useSettings } from "@/hooks/useSettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { showSuccess, showError } from "@/lib/toast";
import { Eye, EyeOff, Pencil, Trash2 } from "lucide-react";

export function SerperApiKeySettings() {
  const { settings, updateSettings } = useSettings();
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveErrorMsg, setSaveErrorMsg] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  const userApiKey = settings?.serperApiKey?.value;
  const isConfigured = !!userApiKey && userApiKey.trim() !== "";

  const handleSaveKey = async () => {
    if (!apiKeyInput.trim()) {
      setSaveErrorMsg("La API Key no puede estar vacía.");
      return;
    }
    setIsSaving(true);
    setSaveErrorMsg(null);
    try {
      await updateSettings({
        serperApiKey: {
          value: apiKeyInput.trim(),
        },
      });
      setApiKeyInput("");
      setIsEditing(false);
      setShowApiKey(false);
      showSuccess("API Key de Serper guardada correctamente");
    } catch (error: any) {
      console.error("Error saving Serper API key:", error);
      const errorMessage = error.message || "Error al guardar la API Key.";
      setSaveErrorMsg(errorMessage);
      showError(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteKey = async () => {
    setIsSaving(true);
    setSaveErrorMsg(null);
    try {
      await updateSettings({
        serperApiKey: undefined,
      });
      setIsEditing(false);
      setShowApiKey(false);
      showSuccess("API Key de Serper eliminada correctamente");
    } catch (error: any) {
      console.error("Error deleting Serper API key:", error);
      const errorMessage = error.message || "Error al eliminar la API Key.";
      setSaveErrorMsg(errorMessage);
      showError(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditKey = () => {
    setApiKeyInput(userApiKey || "");
    setIsEditing(true);
    setShowApiKey(false);
  };

  const handleCancelEdit = () => {
    setApiKeyInput("");
    setIsEditing(false);
    setShowApiKey(false);
    setSaveErrorMsg(null);
  };

  useEffect(() => {
    if (saveErrorMsg) {
      setSaveErrorMsg(null);
    }
  }, [apiKeyInput]);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Serper.dev API Key
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Configura tu API key de Serper.dev para habilitar búsquedas web en el
          agente.{" "}
          <a
            href="https://serper.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:underline"
          >
            Obtén tu API key aquí
          </a>
        </p>
      </div>

      {isConfigured && !isEditing ? (
        <div className="space-y-2">
          <Label htmlFor="serper-api-key">API Key</Label>
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <Input
                id="serper-api-key"
                type={showApiKey ? "text" : "password"}
                value={userApiKey}
                readOnly
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                {showApiKey ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            <Button
              onClick={handleEditKey}
              variant="outline"
              size="sm"
              disabled={isSaving}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              onClick={handleDeleteKey}
              variant="destructive"
              size="sm"
              disabled={isSaving}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-green-600 dark:text-green-400">
            ✓ API Key configurada
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="serper-api-key-input">API Key</Label>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Input
                id="serper-api-key-input"
                type={showApiKey ? "text" : "password"}
                placeholder="Ingresa tu API key de Serper.dev"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSaveKey();
                  } else if (e.key === "Escape") {
                    handleCancelEdit();
                  }
                }}
                disabled={isSaving}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                {showApiKey ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            <Button onClick={handleSaveKey} disabled={isSaving || !apiKeyInput}>
              {isSaving ? "Guardando..." : "Guardar"}
            </Button>
            {isEditing && (
              <Button
                onClick={handleCancelEdit}
                variant="outline"
                disabled={isSaving}
              >
                Cancelar
              </Button>
            )}
          </div>
          {saveErrorMsg && (
            <p className="text-xs text-red-600 dark:text-red-400">
              {saveErrorMsg}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
