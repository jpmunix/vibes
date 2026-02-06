import { useSettings } from "@/hooks/useSettings";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { showInfo } from "@/lib/toast";

export function AutoApproveSwitch({}: { showToast?: boolean }) {
  const { settings, updateSettings } = useSettings();
  return (
    <div className="flex items-center space-x-2">
      <Switch
        id="auto-approve"
        checked={settings?.autoApproveChanges}
        onCheckedChange={() => {
          updateSettings({ autoApproveChanges: !settings?.autoApproveChanges });
          showInfo("Puedes desactivar la auto-aprobación en Ajustes.");
        }}
      />
      <Label htmlFor="auto-approve">Auto aprobar</Label>
    </div>
  );
}
