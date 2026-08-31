import React, { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/hooks/useSettings";
import { ChevronRight, Check, Loader2 } from "@/components/ui/icons";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { DEFAULT_VISION_PROMPT } from "@/ipc/shared/vision_constants";

export function VisionPromptGroup() {
  const { settings, updateSettings } = useSettings();
  const [expanded, setExpanded] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [localContent, setLocalContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const currentPrompt = settings?.visionPreprocessorPrompt || "";
  const isCustom = currentPrompt.trim().length > 0;

  // Sync local state when editor opens
  useEffect(() => {
    if (isEditorOpen) {
      setLocalContent(currentPrompt || DEFAULT_VISION_PROMPT);
    }
  }, [isEditorOpen]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        textareaRef.current.scrollHeight + "px";
    }
  }, [localContent, isEditorOpen]);

  const hasUnsavedChanges =
    localContent !== (currentPrompt || DEFAULT_VISION_PROMPT);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // If user saved the exact default, store empty string (= use default)
      const valueToSave =
        localContent.trim() === DEFAULT_VISION_PROMPT.trim()
          ? ""
          : localContent;
      await updateSettings({ visionPreprocessorPrompt: valueToSave });
      toast.success("Prompt de visión guardado");
    } catch {
      toast.error("Error al guardar");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRestore = async () => {
    setLocalContent(DEFAULT_VISION_PROMPT);
  };

  return (
    <>
      {/* ── Group header (collapsible) ── */}
      <div className="space-y-2 mt-2">
        <div
          className="flex items-center justify-between cursor-pointer group p-4 rounded-xl border border-border hover:bg-muted/50 transition-colors gap-4 bg-muted/20"
          onClick={() => setExpanded((e) => !e)}
        >
          <div className="flex-1">
            <h3 className="typo-label flex items-center gap-2">
              Procesamiento de Imágenes
              <span className="text-muted-foreground typo-caption">(1)</span>
            </h3>
            <p className="typo-caption mt-1">
              Prompt del preprocesador de visión para modelos sin soporte de
              imágenes
            </p>
          </div>
          <ChevronRight
            className={cn(
              "size-5 text-muted-foreground/50 group-hover:text-foreground transition-transform duration-200 shrink-0",
              expanded && "rotate-90",
            )}
          />
        </div>

        {/* ── Expanded: prompt item (same pattern as PromptEditor row) ── */}
        {expanded && (
          <div className="pl-4 space-y-2">
            <div
              className="flex items-center justify-between cursor-pointer group p-4 rounded-xl border border-border hover:bg-muted/50 transition-colors gap-4"
              onClick={() => setIsEditorOpen(true)}
            >
              <div className="flex-1">
                <h3 className="typo-label flex items-center gap-2 text-sm font-medium">
                  System Prompt de Visión
                  {isCustom && (
                    <span className="typo-micro px-1.5 py-0.5 rounded bg-primary/15 text-primary text-[10px]">
                      PERSONALIZADO
                    </span>
                  )}
                </h3>
                <p className="typo-caption mt-1 text-xs text-muted-foreground">
                  Instrucciones que recibe el modelo de visión al analizar
                  imágenes
                </p>
              </div>
              <ChevronRight className="size-5 text-muted-foreground/50 group-hover:text-foreground transition-colors shrink-0" />
            </div>
          </div>
        )}
      </div>

      {/* ── Editor dialog ── */}
      <Dialog open={isEditorOpen} onOpenChange={setIsEditorOpen}>
        <DialogContent className="sm:max-w-[975px] max-h-[85vh] flex flex-col p-6 rounded-2xl shadow-2xl bg-popover border border-border">
          <DialogHeader className="pb-4 border-b border-border/50">
            <DialogTitle className="text-base font-bold text-foreground">
              System Prompt — Preprocesador de Visión
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 py-4 pr-1 custom-scrollbar">
            <div className="space-y-1.5">
              <div className="flex justify-between items-center mb-3">
                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Contenido del Prompt
                </label>
              </div>

              <div className="rounded-xl border border-border overflow-hidden bg-muted/10 focus-within:ring-2 focus-within:ring-primary/30 transition-all duration-200">
                <textarea
                  ref={textareaRef}
                  className="w-full min-h-[380px] p-4 typo-mono-xs leading-relaxed resize-y border-0 bg-transparent focus:outline-none custom-scrollbar"
                  spellCheck={false}
                  value={localContent}
                  onChange={(e) => setLocalContent(e.target.value)}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="pt-4 border-t border-border/50 flex flex-row justify-between sm:justify-between items-center gap-2 w-full">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 rounded-lg h-9"
              onClick={handleRestore}
              disabled={
                localContent.trim() === DEFAULT_VISION_PROMPT.trim()
              }
            >
              Restablecer por defecto
            </Button>

            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="rounded-lg h-9"
                onClick={() => {
                  setLocalContent(currentPrompt || DEFAULT_VISION_PROMPT);
                  setIsEditorOpen(false);
                }}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                className="gap-1.5 rounded-lg h-9 font-medium"
                onClick={async () => {
                  await handleSave();
                  setIsEditorOpen(false);
                }}
                disabled={isSaving || !hasUnsavedChanges}
              >
                {isSaving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Guardar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
