import { useSettings } from "@/hooks/useSettings";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { ipc } from "@/ipc/types";

export function AutoUpdateSwitch() {
  const { settings, updateSettings } = useSettings();

  if (!settings) {
    return null;
  }

  return (
    <div className="flex items-center space-x-2">
      <Switch
        id="enable-auto-update"
        checked={settings.enableAutoUpdate}
        onCheckedChange={(checked) => {
          updateSettings({ enableAutoUpdate: checked });
          toast("Ajustes de auto-actualización cambiados", {
            description:
              "Debes reiniciar Vibes para que los cambios surtan efecto.",
            action: {
              label: "Reiniciar Vibes",
              onClick: () => {
                ipc.system.restartDyad();
              },
            },
          });
        }}
      />
      <Label htmlFor="enable-auto-update">Auto-actualización</Label>
    </div>
  );
}
