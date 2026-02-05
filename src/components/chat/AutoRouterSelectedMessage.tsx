import { Bot, Sparkles } from "lucide-react";
import type { AutoRouterModelInfo } from "@/atoms/chatAtoms";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface AutoRouterSelectedMessageProps {
  modelInfo: AutoRouterModelInfo;
}

const COMPLEXITY_LABELS: Record<number, string> = {
  1: "muy baja",
  2: "baja",
  3: "media",
  4: "alta",
  5: "muy alta",
};

const COMPLEXITY_COLORS: Record<number, string> = {
  1: "text-green-600 dark:text-green-400",
  2: "text-lime-600 dark:text-lime-400",
  3: "text-yellow-600 dark:text-yellow-400",
  4: "text-orange-600 dark:text-orange-400",
  5: "text-red-600 dark:text-red-400",
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

export function AutoRouterSelectedMessage({
  modelInfo,
}: AutoRouterSelectedMessageProps) {
  const fullModelPath = `${modelInfo.model.provider}/${modelInfo.model.name}`;
  const modelName = MODEL_DISPLAY_NAMES[fullModelPath] || modelInfo.model.name;
  const complexityLabel = COMPLEXITY_LABELS[modelInfo.complexity] || "media";
  const complexityColor =
    COMPLEXITY_COLORS[modelInfo.complexity] || COMPLEXITY_COLORS[3];
  const taskTypeLabel =
    TASK_TYPE_LABELS[modelInfo.taskType] || modelInfo.taskType;

  return (
    <div className="px-4 my-3">
      <div className="max-w-3xl mx-auto">
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800 rounded-lg shadow-sm">
          <div className="flex items-start gap-3 px-4 py-3">
            <div className="flex-shrink-0 mt-0.5">
              <div className="relative">
                <Bot size={20} className="text-blue-600 dark:text-blue-400" />
                <Sparkles
                  size={12}
                  className="absolute -top-1 -right-1 text-yellow-500 dark:text-yellow-400"
                />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide">
                  Auto-Router
                </span>
              </div>
              <div className="text-sm text-gray-700 dark:text-gray-300">
                <span className="font-medium">Modelo seleccionado:</span>{" "}
                <span className="font-semibold text-blue-700 dark:text-blue-300">
                  {modelName}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-2 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-600 dark:text-gray-400">
                    Complejidad:
                  </span>
                  <span className={`font-semibold ${complexityColor}`}>
                    {complexityLabel}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-gray-600 dark:text-gray-400">
                    Tipo:
                  </span>
                  <span className="font-semibold text-gray-700 dark:text-gray-300">
                    {taskTypeLabel}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {modelInfo.reasoning && (
            <Accordion
              type="single"
              collapsible
              className="border-t border-blue-200 dark:border-blue-800"
            >
              <AccordionItem value="reasoning" className="border-0">
                <AccordionTrigger className="px-4 py-2 text-xs font-medium text-blue-700 dark:text-blue-300 hover:no-underline hover:bg-blue-100/50 dark:hover:bg-blue-900/30">
                  Ver razonamiento
                </AccordionTrigger>
                <AccordionContent className="px-4 pb-3">
                  <div className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                    {modelInfo.reasoning}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}
        </div>
      </div>
    </div>
  );
}
