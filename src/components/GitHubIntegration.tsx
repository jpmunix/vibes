import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Github } from "lucide-react";
import { useSettings } from "@/hooks/useSettings";
import { showSuccess, showError } from "@/lib/toast";


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
    <div className="flex justify-between gap-8 p-4 rounded-xl hover:bg-muted/50 transition-colors items-center">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Github className="h-4 w-4 text-muted-foreground shrink-0" />
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            GitHub
          </h3>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Conectado como{" "}
          <span className="font-bold text-foreground">
            {(settings?.githubUser as any)?.email ||
              settings?.githubUser ||
              "usuario"}
          </span>
        </p>
      </div>
      <div className="shrink-0">
        <Button
          onClick={handleDisconnectFromGithub}
          variant="ghost"
          size="sm"
          disabled={isDisconnecting}
          className="rounded-lg h-auto px-4 py-1.5 font-bold text-sm bg-muted/50 border border-border hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 hover:border-red-200 dark:hover:border-red-900/30 transition-colors cursor-pointer"
        >
          {isDisconnecting ? "Desconectando..." : "Desconectar"}
        </Button>
      </div>
    </div>
  );
}
