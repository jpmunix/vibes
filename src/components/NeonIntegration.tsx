import { useSettings } from "@/hooks/useSettings";
import { Button } from "@/components/ui/button";
import { DatabaseZap } from "lucide-react";

export function NeonIntegration() {
  const { settings, updateSettings } = useSettings();

  const isConnected = !!settings?.neon?.accessToken;

  const handleDisconnect = async () => {
    try {
      await updateSettings({
        neon: undefined,
      });
    } catch (err) {
      console.error("Error disconnecting Neon", err);
    }
  };

  if (!isConnected) {
    return null;
  }

  return (
    <div className="space-y-8 p-6 rounded-2xl bg-muted/30 border border-border">
      <div className="flex items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-xl bg-white dark:bg-gray-800 shadow-sm border border-border">
            <DatabaseZap className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
              Neon
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              Tu cuenta está conectada a Neon Database
            </p>
          </div>
        </div>

        <Button
          onClick={handleDisconnect}
          variant="ghost"
          size="sm"
          className="rounded-xl h-10 px-4 font-bold text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
        >
          Desconectar
        </Button>
      </div>
    </div>
  );
}
