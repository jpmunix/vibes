import { Terminal } from "@/components/ui/icons";
import { ipc } from "@/ipc/types";
import { useI18n } from "@/lib/i18n";
import { useSettings } from "@/hooks/useSettings";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Context debug (temporal) — botón de la cabecera que abre (o focus) la
 * ventana aparte con el JSON raw del contexto que el LLM recibe en cada
 * iteración (system prompt + messages con tools).
 *
 * Semántica: ABRIR la ventana = debug ON (main activa loopConfig.debugContext
 * en caliente), CERRARLA = debug OFF. El botón solo abre/focus; el estado de
 * "activo" se refleja en el icono (verde) cuando hay una entrada recibida.
 */
export function ContextDebugButton() {
  const { t } = useI18n();
  const { settings } = useSettings();

  const handleOpen = async () => {
    try {
      await ipc.system.openContextDebugWindow({
        theme: settings?.theme,
        themeIntensity: settings?.themeIntensity,
      });
    } catch (err) {
      console.error("[ContextDebug] error opening window:", err);
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={handleOpen}
          title={t("contextDebug.tooltip")}
        >
          <Terminal size={16} />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-center">
        {t("contextDebug.tooltip")}
      </TooltipContent>
    </Tooltip>
  );
}
