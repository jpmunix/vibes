import { Zap } from "lucide-react";
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
        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-medium border border-blue-500/20">
          <Zap className="w-3 h-3" />
          <span>Auto</span>
        </div>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs whitespace-pre-wrap">
        {tooltipContent}
      </TooltipContent>
    </Tooltip>
  );
}
