import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSettings } from "@/hooks/useSettings";
import { showError } from "@/lib/toast";
import { ipc } from "@/ipc/types";

export function RuntimeModeSelector() {
  const { settings, updateSettings } = useSettings();

  if (!settings) {
    return null;
  }

  const isDockerMode = settings?.runtimeMode2 === "docker";

  const handleRuntimeModeChange = async (value: "host" | "docker") => {
    try {
      await updateSettings({ runtimeMode2: value });
    } catch (error: any) {
      showError(`Error al actualizar el modo de ejecución: ${error.message}`);
    }
  };

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <div className="flex items-center space-x-2">
          <Label className="text-sm font-medium" htmlFor="runtime-mode">
            Modo de ejecución
          </Label>
          <Select
            value={settings.runtimeMode2 ?? "host"}
            onValueChange={handleRuntimeModeChange}
          >
            <SelectTrigger className="w-48" id="runtime-mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="host">Local (predeterminado)</SelectItem>
              <SelectItem value="docker">Docker (experimental)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Elige si quieres ejecutar las aplicaciones directamente en la máquina
          local o en contenedores Docker
        </div>
      </div>
      {isDockerMode && (
        <div className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-2 rounded">
          ⚠️ El modo Docker es <b>experimental</b> y requiere que{" "}
          <button
            type="button"
            className="underline font-medium cursor-pointer"
            onClick={() =>
              ipc.system.openExternalUrl(
                "https://www.docker.com/products/docker-desktop/",
              )
            }
          >
            Docker Desktop
          </button>{" "}
          esté instalado y en ejecución
        </div>
      )}
    </div>
  );
}
