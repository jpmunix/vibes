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
    <div className="flex items-center justify-between">
      <div>
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Integración de Vercel
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Tu cuenta está conectada a Vercel.
        </p>
      </div>

      <Button
        onClick={handleDisconnectFromVercel}
        variant="destructive"
        size="sm"
        disabled={isDisconnecting}
        className="flex items-center gap-2"
      >
        {isDisconnecting ? "Desconectando..." : "Desconectar de Vercel"}
        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M24 22.525H0l12-21.05 12 21.05z" />
        </svg>
      </Button>
    </div>
  );
}
