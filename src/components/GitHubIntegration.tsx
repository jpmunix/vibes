import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Github } from "lucide-react";
import { useSettings } from "@/hooks/useSettings";
import { showSuccess, showError } from "@/lib/toast";
import { Switch } from "./ui/switch";

export function GitHubIntegration() {
  const { settings, updateSettings } = useSettings();
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const handleDisconnectFromGithub = async () => {
    setIsDisconnecting(true);
    try {
      const result = await updateSettings({
        githubAccessToken: undefined,
        githubUser: undefined,
      });
      if (result) {
        showSuccess("Desconectado de GitHub con éxito");
      } else {
        showError("Error al desconectar de GitHub");
      }
    } catch (err: any) {
      showError(err.message || "Se produjo un error al desconectar de GitHub");
    } finally {
      setIsDisconnecting(false);
    }
  };

  const isConnected = !!settings?.githubAccessToken;

  if (!isConnected) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Integración de GitHub
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Tu cuenta está conectada a GitHub.
          </p>
        </div>

        <Button
          onClick={handleDisconnectFromGithub}
          variant="destructive"
          size="sm"
          disabled={isDisconnecting}
          className="flex items-center gap-2"
        >
          {isDisconnecting ? "Desconectando..." : "Desconectar de GitHub"}
          <Github className="h-4 w-4" />
        </Button>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <div className="space-y-1 pr-4">
          <p className="text-sm font-medium text-foreground">
            Auto-commit antes de push/conectar
          </p>
          <p className="text-xs text-muted-foreground">
            Si lo desactivas, podrás revisar y hacer commit manual antes de enviar a GitHub.
          </p>
        </div>
        <Switch
          checked={settings?.enableGithubAutoCommit !== false}
          onCheckedChange={(checked) =>
            updateSettings({ enableGithubAutoCommit: checked })
          }
        />
      </div>
    </div>
  );
}
