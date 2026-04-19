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
  MoveUpRight,
  Clipboard,
  Download,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ToolbarColorPicker } from "./ToolbarColorPicker";

type ToolType = "select" | "draw" | "rect" | "text" | "arrow";

interface AnnotatorToolbarProps {
  tool: ToolType;
  color: string;
  selectedId: string | null;
  historyStep: number;
  historyLength: number;
  onToolChange: (tool: ToolType) => void;
  onColorChange: (color: string) => void;
  onDelete: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSubmit: () => void;
  onCopyToClipboard: () => void;
  onSaveAsFile: () => void;
  onDeactivate: () => void;
  hasSubmitHandler: boolean;
}

const activeClass =
  "bg-primary text-primary-foreground hover:bg-primary/90";
const inactiveClass =
  "text-primary hover:bg-primary/15";
const actionClass =
  "p-1 rounded transition-colors duration-200 text-primary hover:bg-primary/15 disabled:opacity-50 disabled:cursor-not-allowed";

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
  onCopyToClipboard,
  onSaveAsFile,
  onDeactivate,
  hasSubmitHandler,
}: AnnotatorToolbarProps) => {
  const toolBtn = (
    id: ToolType,
    label: string,
    Icon: React.ElementType,
  ) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={() => onToolChange(id)}
          aria-label={label}
          className={cn(
            "p-1 rounded transition-colors duration-200",
            tool === id ? activeClass : inactiveClass,
          )}
        >
          <Icon size={16} />
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{label}</p>
      </TooltipContent>
    </Tooltip>
  );

  const Divider = () => (
    <div className="w-px bg-border h-4" />
  );

  return (
    <div className="flex items-center justify-center p-2 border-b border-border bg-muted/50 space-x-2">
      <TooltipProvider>
        <div className="flex space-x-1">
          {toolBtn("select", "Seleccionar", MousePointer2)}
          {toolBtn("draw", "Dibujar", Pencil)}
          {toolBtn("rect", "Rectángulo", Square)}
          {toolBtn("arrow", "Flecha", MoveUpRight)}
          {toolBtn("text", "Texto", Type)}

          <Tooltip>
            <TooltipTrigger asChild>
              <div className="p-1 rounded transition-colors duration-200 hover:bg-primary/15">
                <ToolbarColorPicker color={color} onChange={onColorChange} />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Color</p>
            </TooltipContent>
          </Tooltip>

          <Divider />

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onDelete}
                aria-label="Eliminar"
                className={actionClass}
                disabled={!selectedId}
              >
                <Trash2 size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Eliminar seleccionado</p>
            </TooltipContent>
          </Tooltip>

          <Divider />

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onUndo}
                aria-label="Deshacer"
                className={actionClass}
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
                className={actionClass}
                disabled={historyStep === historyLength - 1}
              >
                <Redo size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Rehacer</p>
            </TooltipContent>
          </Tooltip>

          <Divider />

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onCopyToClipboard}
                aria-label="Copiar al portapapeles"
                className={actionClass}
              >
                <Clipboard size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Copiar al portapapeles</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onSaveAsFile}
                aria-label="Guardar como archivo"
                className={actionClass}
              >
                <Download size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Guardar como archivo</p>
            </TooltipContent>
          </Tooltip>

          <Divider />

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onSubmit}
                aria-label="Añadir al chat"
                className={actionClass}
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
                className="p-1 rounded transition-colors duration-200 text-primary hover:bg-primary/15"
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
