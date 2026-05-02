/**
 * PromptsSection — Inline settings section for all system prompts.
 *
 * Follows the exact MemorySettings pattern:
 * - Collapsible ChevronRight for each prompt
 * - Blue dot badge when a prompt is modified
 * - "MODIFICADO" badge in the editor header
 * - Save / Reset inline buttons
 * - Auto-resize textarea
 */

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useSettings } from "@/hooks/useSettings";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ChevronRight, Loader2, RotateCcw, Check } from "@/components/ui/icons";
import {
  DEFAULT_PROMPTS,
  PROMPT_LABELS,
  PROMPT_DESCRIPTIONS,
  PromptId,
} from "@/prompts";
import { toast } from "sonner";

// =============================================================================
// PromptEditor — Reusable collapsible prompt editor (same pattern as MemorySettings)
// =============================================================================

function PromptEditor({
  label,
  description,
  promptId,
}: {
  label: string;
  description: string;
  promptId: PromptId;
}) {
  const { settings, updateSettings } = useSettings();
  const [expanded, setExpanded] = useState(false);
  const [localPrompt, setLocalPrompt] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const defaultPrompt = DEFAULT_PROMPTS[promptId];
  const currentSaved = settings?.customPrompts?.[promptId] ?? defaultPrompt;
  const isModified = localPrompt !== defaultPrompt;
  const hasUnsavedChanges = localPrompt !== currentSaved;

  // Sync local prompt from settings
  useEffect(() => {
    if (settings) {
      setLocalPrompt(settings.customPrompts?.[promptId] ?? defaultPrompt);
    }
  }, [settings?.customPrompts?.[promptId]]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
    }
  }, [localPrompt, expanded]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      await updateSettings({
        customPrompts: { ...settings?.customPrompts, [promptId]: localPrompt },
      });
      toast.success(`Prompt "${label}" guardado`);
    } catch {
      toast.error("Error al guardar el prompt");
    } finally {
      setIsSaving(false);
    }
  }, [localPrompt, settings?.customPrompts, updateSettings, promptId, label]);

  const handleReset = useCallback(async () => {
    try {
      const newCustomPrompts = { ...settings?.customPrompts };
      delete newCustomPrompts[promptId];
      await updateSettings({ customPrompts: newCustomPrompts });
      setLocalPrompt(defaultPrompt);
      toast.success("Prompt restaurado a valores de fábrica");
    } catch {
      toast.error("Error al restaurar el prompt");
    }
  }, [settings?.customPrompts, updateSettings, defaultPrompt, promptId]);

  return (
    <>
      <div
        className="flex items-center justify-between cursor-pointer group p-4 rounded-xl border border-border hover:bg-muted/50 transition-colors gap-4"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex-1">
          <h3 className="typo-label flex items-center gap-2">
            {label}
            {isModified && (
              <span className="size-2 rounded-full bg-primary shrink-0" title="Prompt modificado" />
            )}
          </h3>
          <p className="typo-caption mt-1">{description}</p>
        </div>
        <ChevronRight
          className={cn(
            "size-5 text-muted-foreground/50 group-hover:text-foreground transition-transform duration-200 shrink-0",
            expanded && "rotate-90",
          )}
        />
      </div>

      {expanded && (
        <div className="space-y-3 pl-4">
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
              <span className="typo-mono-xs text-muted-foreground">
                {defaultPrompt.length} chars por defecto
              </span>
              {isModified && (
                <span className="typo-micro px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                  MODIFICADO
                </span>
              )}
            </div>
            <textarea
              ref={textareaRef}
              className="w-full p-4 typo-mono-xs leading-relaxed resize-none border-0 bg-transparent focus:outline-none overflow-hidden"
              spellCheck={false}
              value={localPrompt}
              onChange={(e) => setLocalPrompt(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleReset}
              disabled={!isModified}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Restaurar
            </Button>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={handleSave}
              disabled={isSaving || !hasUnsavedChanges}
            >
              {isSaving
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Check className="h-3.5 w-3.5" />
              }
              Guardar
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

// =============================================================================
// PromptsSection — Full section with all prompts organized by category
// =============================================================================

/** Prompt groups for logical organization */
const PROMPT_GROUPS: { title: string; description: string; ids: PromptId[] }[] = [
  {
    title: "Instrucciones del Chat",
    description: "Instrucciones inyectadas en cada mensaje al agente. Controlan idioma, comportamiento y eficiencia",
    ids: [
      "ctx_language",
      "ctx_no_run_locally",
      "ctx_context7_docs",
      "ctx_efficiency_triage",
      "ctx_task_management",
      "ctx_plan_mode",
    ],
  },
  {
    title: "Generación de Nombres",
    description: "Prompts usados al crear y nombrar aplicaciones",
    ids: ["app_title_short", "app_name_pro"],
  },
  {
    title: "Git y Automatización",
    description: "Prompts para operaciones automáticas del flujo de trabajo",
    ids: ["auto_commit_message"],
  },
  {
    title: "Sistema de Memoria",
    description: "Prompts del pipeline de memorias: extracción, selección e inicialización",
    ids: ["memory_synthesis", "memory_selection", "memory_onboarding"],
  },
];

function PromptGroup({
  title,
  description,
  ids,
}: {
  title: string;
  description: string;
  ids: PromptId[];
}) {
  const [expanded, setExpanded] = useState(false);
  const { settings } = useSettings();

  const groupHasModified = ids.some((id) => !!settings?.customPrompts?.[id]);

  return (
    <>
      <div
        className="flex items-center justify-between cursor-pointer group p-4 rounded-xl border border-border hover:bg-muted/50 transition-colors gap-4"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex-1">
          <h3 className="typo-label flex items-center gap-2">
            {title}
            {groupHasModified && (
              <span className="size-2 rounded-full bg-primary shrink-0" title="Algún prompt modificado" />
            )}
          </h3>
          <p className="typo-caption mt-1">{description}</p>
        </div>
        <ChevronRight
          className={cn(
            "size-5 text-muted-foreground/50 group-hover:text-foreground transition-transform duration-200 shrink-0",
            expanded && "rotate-90",
          )}
        />
      </div>

      {expanded && (
        <div className="pl-4 space-y-2">
          {ids.map((id) => (
            <PromptEditor
              key={id}
              label={PROMPT_LABELS[id]}
              description={PROMPT_DESCRIPTIONS[id]}
              promptId={id}
            />
          ))}
        </div>
      )}
    </>
  );
}

export function PromptsSection() {
  return (
    <div className="space-y-3">
      {PROMPT_GROUPS.map((group) => (
        <PromptGroup
          key={group.title}
          title={group.title}
          description={group.description}
          ids={group.ids}
        />
      ))}
    </div>
  );
}

export default PromptsSection;
