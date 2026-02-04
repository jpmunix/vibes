import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useSettings } from "@/hooks/useSettings";

interface NeonDisconnectButtonProps {
  className?: string;
}

export function NeonDisconnectButton({ className }: NeonDisconnectButtonProps) {
  const { updateSettings, settings } = useSettings();

  const handleDisconnect = async () => {
    try {
      await updateSettings({
        neon: undefined,
      });
      toast.success("Desconectado de Neon con éxito");
    } catch (error) {
      toast.error("Error al desconectar de Neon");
    }
  };

  if (!settings?.neon?.accessToken) {
    return null;
  }

  return (
    <Button
      variant="destructive"
      onClick={handleDisconnect}
      className={className}
      size="sm"
    >
      Desconectar de Neon
    </Button>
  );
}
