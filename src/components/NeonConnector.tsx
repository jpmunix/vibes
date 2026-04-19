import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ipc } from "@/ipc/types";
import { toast } from "sonner";
import { useSettings } from "@/hooks/useSettings";

import { useDeepLink } from "@/contexts/DeepLinkContext";
import { ExternalLink, NeonIcon } from "@/components/ui/icons";
import { useTheme } from "@/contexts/ThemeContext";
import { NeonDisconnectButton } from "@/components/NeonDisconnectButton";

export function NeonConnector() {
  const { settings, refreshSettings } = useSettings();
  const { lastDeepLink, clearLastDeepLink } = useDeepLink();
  const { isDarkMode } = useTheme();

  useEffect(() => {
    const handleDeepLink = async () => {
      if (lastDeepLink?.type === "neon-oauth-return") {
        await refreshSettings();
        toast.success("¡Conectado a Neon con éxito!");
        clearLastDeepLink();
      }
    };
    handleDeepLink();
  }, [lastDeepLink?.timestamp]);

  if (settings?.neon?.accessToken) {
    return (
      <div className="flex flex-col space-y-4 p-4 border bg-white dark:bg-gray-800 max-w-100 rounded-md">
        <div className="flex flex-col items-start justify-between">
          <div className="flex items-center justify-between w-full">
            <h2 className="text-lg font-medium pb-1">Base de datos Neon</h2>
            <Button
              variant="outline"
              onClick={() => {
                ipc.system.openExternalUrl("https://console.neon.tech/");
              }}
              className="ml-2 px-2 py-1 h-8 mb-2"
              style={{ display: "inline-flex", alignItems: "center" }}
              asChild
            >
              <div className="flex items-center gap-1">
                Neon
                <ExternalLink className="h-3 w-3" />
              </div>
            </Button>
          </div>
          <p className="text-sm text-muted-foreground pb-3">
            Estás conectado a la base de datos Neon
          </p>
          <NeonDisconnectButton />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-4 p-4 border bg-white dark:bg-gray-800 max-w-100 rounded-md">
      <div className="flex flex-col items-start justify-between">
        <h2 className="text-lg font-medium pb-1">Base de datos Neon</h2>
        <p className="text-sm text-muted-foreground pb-3">
          Neon Database tiene un buen plan gratuito con copias de seguridad y
          hasta 10 proyectos.
        </p>
        <div
          onClick={async () => {
            if (settings?.isTestMode) {
              await ipc.neon.fakeConnect();
            } else {
              await ipc.system.openExternalUrl(
                "https://oauth.dyad.sh/api/integrations/neon/login",
              );
            }
          }}
          className="w-auto h-10 cursor-pointer flex items-center justify-center px-4 py-2 rounded-md border-2 transition-colors font-medium text-sm dark:bg-gray-900 dark:border-gray-700"
          data-testid="connect-neon-button"
        >
          <span className="mr-2">Conectar a</span>
          <NeonIcon className="w-16 h-4" />
        </div>
      </div>
    </div>
  );
}
