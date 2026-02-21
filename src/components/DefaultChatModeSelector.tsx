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
    <Select
      value={effectiveDefault}
      onValueChange={handleDefaultChatModeChange}
    >
      <SelectTrigger className="border-0 bg-primary dark:bg-primary text-primary-foreground dark:text-primary-foreground shadow-sm rounded-lg px-4 py-1.5 h-auto text-sm font-bold hover:brightness-110 dark:hover:bg-primary transition-all duration-200 w-auto gap-2 cursor-pointer [&_svg]:!text-current [&_svg]:!opacity-100" id="default-chat-mode">
        <SelectValue>{getModeDisplayName(effectiveDefault)}</SelectValue>
      </SelectTrigger>
      <SelectContent align="end">
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
  );
}
