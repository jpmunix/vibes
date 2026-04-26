import React from "react";
import { ShieldCheck, Check, Ban, Info } from "@/components/ui/icons";
import type { PendingOpenCodePermission } from "@/atoms/chatAtoms";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";

// ── Human-readable labels ──
const TOOL_LABELS: Record<string, { label: string; desc: string }> = {
  edit:      { label: "editar archivos",      desc: "Crear, modificar y borrar archivos del proyecto" },
  bash:      { label: "terminal",             desc: "Ejecutar comandos en la terminal del proyecto" },
  read:      { label: "leer archivos",        desc: "Leer el contenido de archivos del proyecto" },
  webfetch:  { label: "acceso web",           desc: "Acceder a URLs externas" },
  websearch: { label: "búsqueda web",         desc: "Buscar información en internet" },
  lsp:       { label: "diagnósticos LSP",     desc: "Ejecutar verificación de tipos por archivo" },
};

interface VibesPermissionBannerProps {
  permission: PendingOpenCodePermission;
  queueTotal?: number;
  onResponse: (response: "once" | "always" | "reject") => void;
}

export function VibesPermissionBanner({
  permission,
  queueTotal = 1,
  onResponse,
}: VibesPermissionBannerProps) {
  const { toolName, toolInput } = permission;
  const meta = TOOL_LABELS[toolName] ?? { label: toolName, desc: "" };

  // Collapsible input preview
  const [isInputExpanded, setIsInputExpanded] = React.useState(false);
  const [inputCollapsedMaxHeight, setInputCollapsedMaxHeight] = React.useState<number>(0);
  const [inputHasOverflow, setInputHasOverflow] = React.useState(false);
  const inputRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!toolInput) {
      setInputHasOverflow(false);
      return;
    }
    const element = inputRef.current;
    if (!element) return;
    const compute = () => {
      const computedStyle = window.getComputedStyle(element);
      const lineHeight = parseFloat(computedStyle.lineHeight || "16");
      const maxLines = 6;
      const maxHeightPx = Math.max(0, Math.round(lineHeight * maxLines));
      setInputCollapsedMaxHeight(maxHeightPx);
      setInputHasOverflow(element.scrollHeight > maxHeightPx + 1);
    };
    compute();
    const onResize = () => compute();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [toolInput]);

  return (
    <div className="vibes-permission-banner mx-4 my-3 rounded-xl overflow-hidden">
      {/* Header bar */}
      <div className="vibes-permission-banner__header flex items-center gap-2.5 px-5 py-3">
        <div className="vibes-permission-banner__icon flex items-center justify-center w-6 h-6 rounded-md">
          <ShieldCheck size={14} />
        </div>
        <span className="text-[13px] font-medium text-foreground">
          ¿Permitir{" "}
          <span className="font-mono">{meta.label}</span>?
          {queueTotal > 1 && (
            <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
              (1 de {queueTotal})
            </span>
          )}
        </span>
        {meta.desc && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <p className="text-xs">{meta.desc}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

      </div>

      {/* Body */}
      <div className="px-5 py-4">
        {/* Input preview */}
        {toolInput && (
          <div className="mb-4">
            <div
              ref={inputRef}
              className="vibes-permission-banner__input px-3 py-2 rounded-lg text-[13px] font-mono whitespace-pre-wrap leading-relaxed"
              style={{
                maxHeight: isInputExpanded ? "40vh" : inputCollapsedMaxHeight,
                overflow: isInputExpanded ? "auto" : "hidden",
              }}
            >
              {toolInput}
            </div>
            {inputHasOverflow && (
              <button
                type="button"
                className="cursor-pointer mt-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setIsInputExpanded((v) => !v)}
              >
                {isInputExpanded ? "Mostrar menos" : "Mostrar más"}
              </button>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onResponse("always")}
            className="vibes-permission-banner__btn flex items-center gap-2 px-4 py-2 text-[12px] font-medium rounded-lg transition-all duration-150 cursor-pointer"
          >
            <ShieldCheck size={13} />
            Permitir siempre
          </button>
          <button
            onClick={() => onResponse("once")}
            className="vibes-permission-banner__btn flex items-center gap-2 px-4 py-2 text-[12px] font-medium rounded-lg transition-all duration-150 cursor-pointer"
          >
            <Check size={13} />
            Solo esta vez
          </button>
          <button
            onClick={() => onResponse("reject")}
            className="vibes-permission-banner__btn flex items-center gap-2 px-4 py-2 text-[12px] font-medium rounded-lg transition-all duration-150 cursor-pointer"
          >
            <Ban size={13} />
            Rechazar
          </button>
        </div>
      </div>
    </div>
  );
}
