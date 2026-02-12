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
  function NewBadge() {
    return (
      <span className="inline-flex items-center rounded-full px-2 text-[11px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
        beta
      </span>
    );
  }
  const getModeDisplayName = (mode: ChatMode) => {
    switch (mode) {
      case "build":
        return "Construir";
      case "agent":
        return "Build (MCP)";
      case "local-agent":
        return "Agente inteligente";
      case "ask":
      default:
        throw new Error(`Unknown chat mode: ${mode}`);
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
            <SelectItem value="local-agent">
              <div className="flex flex-col items-start">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium">Agente inteligente</span>
                  <NewBadge />
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
          </SelectContent>
        </Select>
      </div>
      <div className="text-sm text-gray-500 dark:text-gray-400">
        El modo de chat usado para crear nuevos chats
      </div>
    </div>
  );
}
