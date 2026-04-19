import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/hooks/useSettings";
import { showSuccess, showError } from "@/lib/toast";
import { Triangle } from "@/components/ui/icons";

export function VercelIntegration() {
  const { settings, updateSettings } = useSettings();
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const handleDisconnectFromVercel = async () => {
    setIsDisconnecting(true);
    try {
      const result = await updateSettings({
        vercelAccessToken: undefined,
      });
      if (result) {
        showSuccess("Desconectado de Vercel con éxito");
      } else {
        showError("Error al desconectar de Vercel");
      }
    } catch (err: any) {
      showError(err.message || "Se produjo un error al desconectar de Vercel");
    } finally {
      setIsDisconnecting(false);
    }
  };

  const isConnected = !!settings?.vercelAccessToken;

  if (!isConnected) {
    return null;
  }

  return (
    <div className="flex justify-between gap-8 p-4 rounded-xl hover:bg-muted/50 transition-colors items-center">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Triangle className="h-4 w-4 text-muted-foreground shrink-0 fill-current" />
          <h3 className="typo-label flex items-center gap-2">
            Vercel
          </h3>
        </div>
        <p className="typo-caption mt-1">
          Tu cuenta está conectada a Vercel
        </p>
      </div>
      <div className="shrink-0">
        <Button
          onClick={handleDisconnectFromVercel}
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
