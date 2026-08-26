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
import { useI18n } from "@/lib/i18n";
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

const activeClass = "bg-primary text-primary-foreground hover:bg-primary/90";
const inactiveClass = "text-primary hover:bg-primary/15";
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
  const { t } = useI18n();
  const toolBtn = (id: ToolType, label: string, Icon: React.ElementType) => (
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

  const Divider = () => <div className="w-px bg-border h-4" />;

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
              <p>{t("previewPanel.color")}</p>
            </TooltipContent>
          </Tooltip>

          <Divider />

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onDelete}
                aria-label={t("common.delete")}
                className={actionClass}
                disabled={!selectedId}
              >
                <Trash2 size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t("previewPanel.deleteSelected")}</p>
            </TooltipContent>
          </Tooltip>

          <Divider />

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onUndo}
                aria-label={t("common.undo")}
                className={actionClass}
                disabled={historyStep === 0}
              >
                <Undo size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t("previewPanel.undo")}</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onRedo}
                aria-label={t("common.redo")}
                className={actionClass}
                disabled={historyStep === historyLength - 1}
              >
                <Redo size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t("previewPanel.redo")}</p>
            </TooltipContent>
          </Tooltip>

          <Divider />

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onCopyToClipboard}
                aria-label={t("common.copyToClipboard")}
                className={actionClass}
              >
                <Clipboard size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t("previewPanel.copyClipboard")}</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onSaveAsFile}
                aria-label={t("common.saveAsFile")}
                className={actionClass}
              >
                <Download size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t("previewPanel.saveAsFile")}</p>
            </TooltipContent>
          </Tooltip>

          <Divider />

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onSubmit}
                aria-label={t("common.addToChat")}
                className={actionClass}
                disabled={!hasSubmitHandler}
              >
                <Check size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t("previewPanel.addToChat")}</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onDeactivate}
                aria-label={t("common.closeAnnotator")}
                className="p-1 rounded transition-colors duration-200 text-primary hover:bg-primary/15"
              >
                <X size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t("previewPanel.closeAnnotator")}</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </div>
  );
};
