import { useSettings } from "@/hooks/useSettings";
import { NeonDisconnectButton } from "@/components/NeonDisconnectButton";

export function NeonIntegration() {
  const { settings } = useSettings();

  const isConnected = !!settings?.neon?.accessToken;

  if (!isConnected) {
    return null;
  }

  return (
    <div className="flex items-center justify-between">
      <div>
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Integración de Neon
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Tu cuenta está conectada a Neon.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <NeonDisconnectButton />
      </div>
    </div>
  );
}
