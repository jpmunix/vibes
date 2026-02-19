import { useSettings } from "@/hooks/useSettings";
import { useFreeAgentQuota } from "@/hooks/useFreeAgentQuota";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ChatMode } from "@/lib/schemas";
import { getEffectiveDefaultChatMode } from "@/lib/schemas";

export function DefaultChatModeSelector() {
  const { settings, updateSettings, envVars } = useSettings();
  const { isQuotaExceeded, isLoading: isQuotaLoading } = useFreeAgentQuota();

  if (!settings) {
    return null;
  }

  // Wait for quota status to load before determining effective default
  const freeAgentQuotaAvailable = !isQuotaLoading && !isQuotaExceeded;
  const effectiveDefault = getEffectiveDefaultChatMode(
    settings,
    envVars,
    freeAgentQuotaAvailable,
  );
  // Show Basic Agent option if user is Pro OR if they have free quota available

  const handleDefaultChatModeChange = (value: ChatMode) => {
    updateSettings({ defaultChatMode: value });
  };

  const getModeDisplayName = (mode: ChatMode) => {
    switch (mode) {
      case "build":
        return "Construir";
      case "plan":
        return "Planificación";
      case "local-agent":
        return "Agente inteligente";
      case "ask":
        return "Preguntar";
      default:
        return "Construir";
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center space-x-2">
        {/*<label*/}
        {/*  htmlFor="default-chat-mode"*/}
        {/*  className="text-sm font-medium text-gray-700 dark:text-gray-300"*/}
        {/*>*/}
        {/*  Modo de chat por defecto*/}
        {/*</label>*/}
        <Select
          value={effectiveDefault}
          onValueChange={handleDefaultChatModeChange}
        >
          <SelectTrigger className="w-60" id="default-chat-mode">
            <SelectValue>{getModeDisplayName(effectiveDefault)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="plan">
              <div className="flex flex-col items-start">
                <span className="font-medium">Planificación</span>
                <span className="text-xs text-muted-foreground">
                  Transforma tu idea en un plan de acción editable
                </span>
              </div>
            </SelectItem>
            <SelectItem value="local-agent">
              <div className="flex flex-col items-start">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium">Agente inteligente</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  El mejor modo de trabajo para el día a día
                </span>
              </div>
            </SelectItem>
            <SelectItem value="build">
              <div className="flex flex-col items-start">
                <span className="font-medium">Build</span>
                <span className="text-xs text-muted-foreground">
                  Genera y edita con una gestion de contexto algo peor
                </span>
              </div>
            </SelectItem>
            <SelectItem value="ask">
              <div className="flex flex-col items-start">
                <span className="font-medium">Preguntar</span>
                <span className="text-xs text-muted-foreground">
                  Pregunta sobre cosas de la app pero sin editar
                </span>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="text-sm text-gray-500 dark:text-gray-400">
        El modo de chat usado para crear nuevos chats
      </div>
    </div >
  );
}
