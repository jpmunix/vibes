import React, { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  MessageSquare,
  Terminal,
  Lightbulb,
  ShieldCheck,
  Zap,
  AlertTriangle,
  FileSearch,
  Wand2,
  FileText,
  ClipboardList,
} from "lucide-react";

import { useRef } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import { useSettings } from "@/hooks/useSettings";
import {
  DEFAULT_PROMPTS,
  PROMPT_LABELS,
  PROMPT_DESCRIPTIONS,
  PromptId,
} from "@/prompts";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const PROMPT_ICONS: Record<PromptId, React.ReactNode> = {
  thinking_prompt: <Sparkles className="w-4 h-4" />,
  build_system_prefix: <MessageSquare className="w-4 h-4" />,
  build_system_postfix: <Terminal className="w-4 h-4" />,
  summarize_chat_system: <Lightbulb className="w-4 h-4" />,
  agent_mode_system: <Search className="w-4 h-4" />,
  plan_mode_system: <ClipboardList className="w-4 h-4" />,
  turbo_edit_system: <Zap className="w-4 h-4" />,
  app_title_short: <Sparkles className="w-4 h-4" />,
  app_name_pro: <ShieldCheck className="w-4 h-4" />,
  todo_analysis: <FileSearch className="w-4 h-4" />,
  todo_refinement: <Wand2 className="w-4 h-4" />,
  debate_chat_system: <MessageSquare className="w-4 h-4" />,
  debate_summary_system: <Lightbulb className="w-4 h-4" />,
  quick_edit_system: <Wand2 className="w-4 h-4" />,
  dossier_prompt: <FileText className="w-4 h-4" />,
};

export function PromptsSettings() {
  const { settings, updateSettings, loading } = useSettings();
  const [localPrompts, setLocalPrompts] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<PromptId>("thinking_prompt");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    if (settings) {
      const merged: Record<string, string> = { ...DEFAULT_PROMPTS };
      if (settings.customPrompts) {
        Object.entries(settings.customPrompts).forEach(([id, content]) => {
          merged[id] = content;
        });
      }
      setLocalPrompts(merged);
    }
  }, [settings]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        textareaRef.current.scrollHeight + "px";
    }
  }, [localPrompts, activeTab]);

  const handleSave = async (id: PromptId) => {
    try {
      const newCustomPrompts = {
        ...settings?.customPrompts,
        [id]: localPrompts[id],
      };
      await updateSettings({ customPrompts: newCustomPrompts });
      toast.success("Prompt guardado correctamente");
    } catch (err) {
      toast.error("Error al guardar el prompt");
    }
  };

  const handleReset = async (id: PromptId) => {
    try {
      const newCustomPrompts = { ...settings?.customPrompts };
      delete newCustomPrompts[id];
      await updateSettings({ customPrompts: newCustomPrompts });
      setLocalPrompts((prev) => ({ ...prev, [id]: DEFAULT_PROMPTS[id] }));
      toast.success("Prompt restaurado a valores de fábrica");
    } catch (err) {
      toast.error("Error al restaurar el prompt");
    }
  };

  const filteredPrompts = (Object.keys(DEFAULT_PROMPTS) as PromptId[]).filter(
    (id) =>
      PROMPT_LABELS[id].toLowerCase().includes(searchQuery.toLowerCase()) ||
      PROMPT_DESCRIPTIONS[id].toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="flex flex-col w-full min-h-full bg-background text-foreground">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-muted sticky top-0 z-10">
        <div className="flex items-center gap-4 flex-1">
          <Link to="/settings">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex items-center flex-1">
            <div className="shrink-0">
              <h1 className="text-xl font-semibold tracking-tight">
                Configuración de Prompts
              </h1>
              <p className="text-sm text-muted-foreground">
                Personaliza el comportamiento del asistente AI
              </p>
            </div>

            <Alert
              variant="destructive"
              className="bg-destructive/5 border-destructive/20 py-2 mx-12 flex-1"
            >
              <AlertTriangle className="w-4 h-4 text-destructive" />
              <AlertDescription className="text-[11px] leading-tight text-destructive/90">
                <strong>Opción avanzada:</strong> No elimines tags vitales como
                [[AI_RULES]] o [[LANGUAGE_INSTRUCTION]] o tag tipo html. Su
                permanencia es necesaria para el correcto funcionamiento del
                sistema.
              </AlertDescription>
            </Alert>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="gap-2"
        >
          {sidebarCollapsed ? "Mostrar Lista" : "Expandir Editor"}
        </Button>
      </div>

      <div className="flex flex-1">
        {/* Sidebar */}
        <div
          className={cn(
            "border-r flex flex-col bg-muted/10 shrink-0 transition-[width] duration-300",
            sidebarCollapsed
              ? "w-0 opacity-0 pointer-events-none border-0"
              : "w-110",
          )}
        >
          <div className="p-4 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar prompts..."
                className="pl-9 h-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {filteredPrompts.map((id) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={cn(
                  "w-full text-left px-3 py-2.5 rounded-lg transition-colors flex items-start gap-3 group relative",
                  activeTab === id
                    ? "bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20"
                    : "hover:bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                <div
                  className={cn(
                    "mt-0.5 p-1 rounded-md",
                    activeTab === id
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted group-hover:bg-muted-foreground/10",
                  )}
                >
                  {PROMPT_ICONS[id]}
                </div>
                <div className="flex-1 overflow-hidden">
                  <div className="text-sm font-medium truncate">
                    {PROMPT_LABELS[id]}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5">
                    {PROMPT_DESCRIPTIONS[id]}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Editor Area */}
        <div className="flex-1 flex flex-col bg-background relative">
          {activeTab ? (
            <div className="flex flex-col bg-gradient-to-b from-transparent to-muted/20">
              <div className="px-6 pt-6 pb-4 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold">
                    {PROMPT_LABELS[activeTab]}
                  </h2>
                  <p className="text-muted-foreground mt-1">
                    {PROMPT_DESCRIPTIONS[activeTab]}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => handleReset(activeTab)}
                    disabled={
                      loading ||
                      localPrompts[activeTab] === DEFAULT_PROMPTS[activeTab]
                    }
                  >
                    <RotateCcw className="w-4 h-4" />
                    Restaurar
                  </Button>
                  <Button
                    size="sm"
                    className="gap-2 shadow-lg shadow-primary/20"
                    onClick={() => handleSave(activeTab)}
                    disabled={
                      loading ||
                      localPrompts[activeTab] ===
                      settings?.customPrompts?.[activeTab]
                    }
                  >
                    <Save className="w-4 h-4" />
                    Guardar Cambios
                  </Button>
                </div>
              </div>

              <div className="px-4 pb-4 flex flex-col">
                <div className="rounded-xl border bg-card shadow-sm flex flex-col overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2 border-b bg-muted">
                    <span className="text-xs font-mono text-muted-foreground">
                      Original length: {DEFAULT_PROMPTS[activeTab].length} chars
                    </span>
                    {localPrompts[activeTab] !== DEFAULT_PROMPTS[activeTab] && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 font-medium">
                        MODIFICADO
                      </span>
                    )}
                  </div>
                  <Textarea
                    ref={textareaRef}
                    className="w-full p-6 font-mono text-sm leading-relaxed resize-none border-0 focus-visible:ring-0 rounded-none bg-transparent overflow-hidden"
                    spellCheck={false}
                    value={localPrompts[activeTab] || ""}
                    onChange={(e) =>
                      setLocalPrompts((prev) => ({
                        ...prev,
                        [activeTab]: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-12 opacity-50">
              <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-6">
                <Terminal className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-medium">
                Selecciona un prompt para editar
              </h3>
              <p className="max-w-xs mt-2 text-sm">
                Escoge una de las etiquetas en la izquierda para personalizar
                las instrucciones que recibe la IA.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default PromptsSettings;
