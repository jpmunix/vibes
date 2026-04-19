import { useSettings } from "@/hooks/useSettings";
import { Button } from "@/components/ui/button";
import { DatabaseZap } from "@/components/ui/icons";

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
    <div className="flex justify-between gap-8 p-4 rounded-xl hover:bg-muted/50 transition-colors items-center">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <DatabaseZap className="h-4 w-4 text-muted-foreground shrink-0" />
          <h3 className="text-base font-semibold text-foreground">
            Neon
          </h3>
        </div>
        <p className="typo-caption mt-1">
          Tu cuenta está conectada a Neon Database
        </p>
      </div>
      <div className="shrink-0">
        <Button
          onClick={handleDisconnect}
          variant="ghost"
          size="sm"
          className="rounded-lg h-auto px-4 py-1.5 font-bold text-sm bg-muted/50 border border-border hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 hover:border-red-200 dark:hover:border-red-900/30 transition-colors cursor-pointer"
        >
          Desconectar
        </Button>
      </div>
    </div>
  );
}
