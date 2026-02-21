import { useSettings } from "@/hooks/useSettings";
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

  if (!settings) {
    return null;
  }

  const effectiveDefault = getEffectiveDefaultChatMode(
    settings,
    envVars,
  );

  const handleDefaultChatModeChange = (value: ChatMode) => {
    updateSettings({ defaultChatMode: value });
  };

  const getModeDisplayName = (mode: ChatMode) => {
    switch (mode) {
      case "plan":
        return "Planificar";
      case "ask":
        return "Preguntar";
      case "build":
      case "local-agent":
      default:
        return "Agente";
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center space-x-2">
        <Select
          value={effectiveDefault}
          onValueChange={handleDefaultChatModeChange}
        >
          <SelectTrigger className="w-60" id="default-chat-mode">
            <SelectValue>{getModeDisplayName(effectiveDefault)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="local-agent">
              <div className="flex flex-col items-start">
                <span className="font-medium">Agente</span>
                <span className="text-xs text-muted-foreground">
                  Desarrolla, edita y depura con acceso a herramientas
                </span>
              </div>
            </SelectItem>
            <SelectItem value="plan">
              <div className="flex flex-col items-start">
                <span className="font-medium">Planificar</span>
                <span className="text-xs text-muted-foreground">
                  Diseña un plan de acción antes de implementar
                </span>
              </div>
            </SelectItem>
            <SelectItem value="ask">
              <div className="flex flex-col items-start">
                <span className="font-medium">Preguntar</span>
                <span className="text-xs text-muted-foreground">
                  Consulta sobre tu código sin realizar cambios
                </span>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="text-sm text-gray-500 dark:text-gray-400">
        El modo de chat usado para crear nuevos chats
      </div>
    </div>
  );
}
