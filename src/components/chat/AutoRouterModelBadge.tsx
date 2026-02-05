import { Bot } from "lucide-react";
import type { AutoRouterModelInfo } from "@/atoms/chatAtoms";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";

interface AutoRouterModelBadgeProps {
  modelInfo: AutoRouterModelInfo;
  showInline?: boolean; // true para mostrar después del análisis, false para mostrar al final
}

const COMPLEXITY_LABELS: Record<number, string> = {
  1: "muy baja",
  2: "baja",
  3: "media",
  4: "alta",
  5: "muy alta",
};

const TASK_TYPE_LABELS: Record<string, string> = {
  "bug-fix": "corrección de bug",
  feature: "nueva funcionalidad",
  refactor: "refactorización",
  architecture: "arquitectura",
  documentation: "documentación",
  explanation: "explicación",
  optimization: "optimización",
};

// Mapeo de nombres de modelos de la ruta completa a nombres más legibles
const MODEL_DISPLAY_NAMES: Record<string, string> = {
  "openrouter/google/gemini-3-flash-preview": "Gemini 3 Flash",
  "openrouter/google/gemini-2.5-flash": "Gemini 2.5 Flash",
  "openrouter/anthropic/claude-sonnet-4.5": "Claude Sonnet 4.5",
  "openrouter/openai/gpt-5.1-codex-mini": "GPT 5.1 Codex mini",
  "openrouter/openai/gpt-4.1": "GPT 4.1",
};

export function AutoRouterModelBadge({
  modelInfo,
  showInline = false,
}: AutoRouterModelBadgeProps) {
  // Get model display name from constants or use provider/name
  const fullModelPath = `${modelInfo.model.provider}/${modelInfo.model.name}`;
  const modelName = MODEL_DISPLAY_NAMES[fullModelPath] || modelInfo.model.name;
  const complexityLabel = COMPLEXITY_LABELS[modelInfo.complexity] || "media";
  const taskTypeLabel =
    TASK_TYPE_LABELS[modelInfo.taskType] || modelInfo.taskType;

  if (showInline) {
    // Inline badge shown after analysis
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2 my-2 max-w-3xl mx-auto">
        <Bot
          size={14}
          className="text-blue-600 dark:text-blue-400 flex-shrink-0"
        />
        <span>
          <span className="font-medium text-blue-700 dark:text-blue-300">
            Usando {modelName}
          </span>
          {" · "}
          <span className="text-xs">complejidad: {complexityLabel}</span>
        </span>
      </div>
    );
  }

  // Compact badge shown at the end of message with tooltip
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1 text-gray-500 dark:text-gray-400 w-full sm:w-auto cursor-help">
            <Bot className="h-4 w-4 flex-shrink-0" />
            <span className="text-xs">auto → {modelName}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs">
            <div>
              <strong>Complejidad:</strong> {complexityLabel}
            </div>
            <div>
              <strong>Tipo:</strong> {taskTypeLabel}
            </div>
            {modelInfo.reasoning && (
              <div className="mt-1 text-[10px] text-muted-foreground max-w-xs">
                {modelInfo.reasoning}
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
