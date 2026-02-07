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
    <div className="space-y-8 p-6 rounded-2xl bg-muted/30 border border-border">
      <div className="flex items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-xl bg-white dark:bg-gray-800 shadow-sm border border-border">
            <Github className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
              GitHub
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              Conectado como <span className="font-bold text-foreground">{(settings?.githubUser as any)?.email || settings?.githubUser || "usuario"}</span>
            </p>
          </div>
        </div>

        <Button
          onClick={handleDisconnectFromGithub}
          variant="ghost"
          size="sm"
          disabled={isDisconnecting}
          className="rounded-xl h-10 px-4 font-bold text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
        >
          {isDisconnecting ? "Desconectando..." : "Desconectar"}
        </Button>
      </div>

      <div
        className="flex items-start justify-between gap-8 p-4 rounded-xl hover:bg-white/50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer border border-transparent hover:border-border"
        onClick={() => updateSettings({ enableGithubAutoCommit: settings?.enableGithubAutoCommit === false })}
      >
        <div className="flex-1">
          <p className="text-base font-semibold text-foreground">
            Auto-commit inteligente
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Realiza commits automáticos antes de enviar cambios al repositorio.
            Si lo desactivas, podrás revisar cada cambio manualmente.
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
