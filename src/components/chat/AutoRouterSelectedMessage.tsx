import {
  Bot,
  Sparkles,
  Loader,
  ChevronsDownUp,
  ChevronsUpDown,
} from "lucide-react";
import type { AutoRouterModelInfo } from "@/atoms/chatAtoms";
import { useState } from "react";

interface AutoRouterSelectedMessageProps {
  modelInfo?: AutoRouterModelInfo;
  isSelecting?: boolean;
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

export function AutoRouterSelectedMessage({
  modelInfo,
  isSelecting = false,
}: AutoRouterSelectedMessageProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Get model info if available
  const fullModelPath = modelInfo
    ? `${modelInfo.model.provider}/${modelInfo.model.name}`
    : "";
  const modelName = modelInfo
    ? MODEL_DISPLAY_NAMES[fullModelPath] || modelInfo.model.name
    : "";
  const complexityLabel = modelInfo
    ? COMPLEXITY_LABELS[modelInfo.complexity] || "media"
    : "";
  const taskTypeLabel = modelInfo
    ? TASK_TYPE_LABELS[modelInfo.taskType] || modelInfo.taskType
    : "";

  return (
    <div className="px-4 my-2">
      <div className="max-w-3xl mx-auto">
        <div
          className={`bg-(--background-lightest) hover:bg-(--background-lighter) rounded-lg px-4 py-2 border my-2 cursor-pointer ${
            isSelecting ? "border-blue-500" : "border-border"
          }`}
          onClick={() => !isSelecting && setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="relative">
                <Bot size={16} className="text-blue-600 dark:text-blue-400" />
                {!isSelecting && (
                  <Sparkles
                    size={10}
                    className="absolute -top-1 -right-1 text-yellow-500 dark:text-yellow-400"
                  />
                )}
              </div>
              {isSelecting ? (
                <div className="flex items-center text-blue-600 dark:text-blue-400 text-sm">
                  <Loader size={14} className="mr-2 animate-spin" />
                  <span className="font-medium">Seleccionando modelo...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-gray-700 dark:text-gray-300 font-medium text-sm">
                    {modelName}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    · {complexityLabel}
                  </span>
                </div>
              )}
            </div>
            {!isSelecting && (
              <div className="flex items-center">
                {isExpanded ? (
                  <ChevronsDownUp
                    size={20}
                    className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  />
                ) : (
                  <ChevronsUpDown
                    size={20}
                    className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  />
                )}
              </div>
            )}
          </div>

          {!isSelecting && modelInfo && (
            <>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                <span className="font-medium">Tipo:</span> {taskTypeLabel}
              </div>
              {isExpanded && modelInfo.reasoning && (
                <div
                  className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 text-xs cursor-text"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="text-gray-600 dark:text-gray-300 mb-1 font-medium">
                    Razonamiento:
                  </div>
                  <div className="text-gray-600 dark:text-gray-400 leading-relaxed">
                    {modelInfo.reasoning}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
