import {
  MousePointer2,
  Pencil,
  Square,
  Type,
  Trash2,
  Undo,
  Redo,
  Check,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ToolbarColorPicker } from "./ToolbarColorPicker";

interface AnnotatorToolbarProps {
  tool: "select" | "draw" | "rect" | "text";
  color: string;
  selectedId: string | null;
  historyStep: number;
  historyLength: number;
  onToolChange: (tool: "select" | "draw" | "rect" | "text") => void;
  onColorChange: (color: string) => void;
  onDelete: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSubmit: () => void;
  onDeactivate: () => void;
  hasSubmitHandler: boolean;
}

export const AnnotatorToolbar = ({
  tool,
  color,
  selectedId,
  historyStep,
  historyLength,
  onToolChange,
  onColorChange,
  onDelete,
  onUndo,
  onRedo,
  onSubmit,
  onDeactivate,
  hasSubmitHandler,
}: AnnotatorToolbarProps) => {
  return (
    <div className="flex items-center justify-center p-2 border-b space-x-2">
      <TooltipProvider>
        {/* Tool Selection Buttons */}
        <div className="flex space-x-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => onToolChange("select")}
                aria-label="Seleccionar"
                className={cn(
                  "p-1 rounded transition-colors duration-200",
                  tool === "select"
                    ? "bg-blue-500 text-white hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700"
                    : " text-blue-700 hover:bg-blue-200  dark:text-blue-300 dark:hover:bg-blue-900",
                )}
              >
                <MousePointer2 size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Seleccionar</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => onToolChange("draw")}
                aria-label="Dibujar"
                className={cn(
                  "p-1 rounded transition-colors duration-200",
                  tool === "draw"
                    ? "bg-blue-500 text-white hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700"
                    : " text-blue-700 hover:bg-blue-200  dark:text-blue-300 dark:hover:bg-blue-900",
                )}
              >
                <Pencil size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Dibujar</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => onToolChange("rect")}
                aria-label="Rectángulo"
                className={cn(
                  "p-1 rounded transition-colors duration-200",
                  tool === "rect"
                    ? "bg-blue-500 text-white hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700"
                    : " text-blue-700 hover:bg-blue-200  dark:text-blue-300 dark:hover:bg-blue-900",
                )}
              >
                <Square size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Rectángulo</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => onToolChange("text")}
                aria-label="Texto"
                className={cn(
                  "p-1 rounded transition-colors duration-200",
                  tool === "text"
                    ? "bg-blue-500 text-white hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700"
                    : "text-blue-700 hover:bg-blue-200  dark:text-blue-300 dark:hover:bg-blue-900",
                )}
              >
                <Type size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Texto</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div className="p-1 rounded transition-colors duration-200 hover:bg-blue-200 dark:hover:bg-blue-900">
                <ToolbarColorPicker color={color} onChange={onColorChange} />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Color</p>
            </TooltipContent>
          </Tooltip>

          <div className="w-px bg-gray-200 dark:bg-gray-700 h-4" />

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onDelete}
                aria-label="Eliminar"
                className="p-1 rounded transition-colors duration-200 text-blue-700 hover:bg-blue-200  dark:text-blue-300 dark:hover:bg-blue-900 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!selectedId}
              >
                <Trash2 size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Eliminar seleccionado</p>
            </TooltipContent>
          </Tooltip>

          <div className="w-px bg-gray-200 dark:bg-gray-700 h-4" />

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onUndo}
                aria-label="Deshacer"
                className="p-1 rounded transition-colors duration-200 text-blue-700 hover:bg-blue-200  dark:text-blue-300 dark:hover:bg-blue-900 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={historyStep === 0}
              >
                <Undo size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Deshacer</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onRedo}
                aria-label="Rehacer"
                className="p-1 rounded transition-colors duration-200 text-blue-700 hover:bg-blue-200  dark:text-blue-300 dark:hover:bg-blue-900 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={historyStep === historyLength - 1}
              >
                <Redo size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Rehacer</p>
            </TooltipContent>
          </Tooltip>

          <div className="w-px bg-gray-200 dark:bg-gray-700 h-4" />

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onSubmit}
                aria-label="Añadir al chat"
                className="p-1 rounded transition-colors duration-200 text-blue-700 hover:bg-blue-200 dark:text-blue-300 dark:hover:bg-blue-900 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!hasSubmitHandler}
              >
                <Check size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Añadir al chat</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onDeactivate}
                aria-label="Cerrar anotador"
                className="p-1 rounded transition-colors duration-200 text-blue-700 hover:bg-blue-200 dark:text-blue-300 dark:hover:bg-blue-900"
              >
                <X size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Cerrar anotador</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </div>
  );
};
