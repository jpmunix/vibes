import { Zap } from "@/components/ui/icons";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface AutoRouterBadgeProps {
  selectedModelName?: string;
  reasoning?: string;
  complexity?: number;
}

export function AutoRouterBadge({
  selectedModelName,
  reasoning,
  complexity,
}: AutoRouterBadgeProps) {
  const complexityLabel =
    complexity === 1 || complexity === 2
      ? "Simple"
      : complexity === 3
        ? "Media"
        : "Compleja";

  const tooltipContent = selectedModelName
    ? `Auto-seleccionado: ${selectedModelName}\nComplejidad: ${complexityLabel}${reasoning ? `\n${reasoning}` : ""}`
    : "Analizando tarea para seleccionar el mejor modelo...";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium border border-primary/20">
          <Zap className="w-3 h-3" />
          <span>Auto</span>
          <span className="text-xs leading-none uppercase tracking-wide rounded-sm bg-primary/20 px-1 py-0.5 border border-primary/30">
            Beta
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs whitespace-pre-wrap">
        {tooltipContent}
      </TooltipContent>
    </Tooltip>
  );
}
