import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/hooks/useSettings";
import { showSuccess, showError } from "@/lib/toast";

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
    <div className="space-y-8 p-6 rounded-2xl bg-muted/30 border border-border">
      <div className="flex items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-xl bg-white dark:bg-gray-800 shadow-sm border border-border">
            <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M24 22.525H0l12-21.05 12 21.05z" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
              Vercel
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              Tu cuenta está conectada a Vercel
            </p>
          </div>
        </div>

        <Button
          onClick={handleDisconnectFromVercel}
          variant="ghost"
          size="sm"
          disabled={isDisconnecting}
          className="rounded-xl h-10 px-4 font-bold text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
        >
          {isDisconnecting ? "Desconectando..." : "Desconectar"}
        </Button>
      </div>
    </div>
  );
}
