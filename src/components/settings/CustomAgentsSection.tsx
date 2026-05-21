import React, { useState, useEffect } from "react";
import { useCustomAgents } from "@/hooks/useCustomAgents";
import { customAgentsClient } from "@/ipc/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { UnifiedSelector } from "@/components/ui/UnifiedSelector";
import {
  Plus,
  Trash2,
  Edit2,
  Bot,
  Sparkles,
  Terminal,
  FileText,
  AlertTriangle,
} from "@/components/ui/icons";
import { showSuccess, showError } from "@/lib/toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface AgentFormState {
  id?: number;
  name: string;
  slashCommand: string;
  baseAgent: "build" | "plan" | "explore";
  promptMode: "additive" | "replace";
  systemPrompt: string;
}

const initialFormState: AgentFormState = {
  name: "",
  slashCommand: "",
  baseAgent: "build",
  promptMode: "additive",
  systemPrompt: "",
};

export function CustomAgentsSection() {
  const { customAgents, loading, reload } = useCustomAgents();
  const [isOpen, setIsOpen] = useState(false);
  const [formState, setFormState] = useState<AgentFormState>(initialFormState);
  const [isEditing, setIsEditing] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleOpenCreate = () => {
    setFormState(initialFormState);
    setIsEditing(false);
    setValidationError(null);
    setIsOpen(true);
  };

  const handleOpenEdit = (agent: any) => {
    setFormState({
      id: agent.id,
      name: agent.name,
      slashCommand: agent.slashCommand,
      baseAgent: agent.baseAgent as "build" | "plan" | "explore",
      promptMode: agent.promptMode as "additive" | "replace",
      systemPrompt: agent.systemPrompt,
    });
    setIsEditing(true);
    setValidationError(null);
    setIsOpen(true);
  };

  const validateForm = (): boolean => {
    if (!formState.name.trim()) {
      setValidationError("El nombre del agente es requerido.");
      return false;
    }
    if (!formState.slashCommand.trim()) {
      setValidationError("El comando slash es requerido.");
      return false;
    }
    // Command format check
    const commandRegex = /^[a-zA-Z0-9_-]+$/;
    if (!commandRegex.test(formState.slashCommand)) {
      setValidationError(
        "El comando slash solo puede contener letras, números, guiones y guiones bajos (sin espacios ni la barra inicial /)."
      );
      return false;
    }
    if (!formState.systemPrompt.trim()) {
      setValidationError("Las instrucciones del System Prompt son requeridas.");
      return false;
    }
    setValidationError(null);
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    try {
      if (isEditing && formState.id) {
        await customAgentsClient.update({
          id: formState.id,
          name: formState.name.trim(),
          slashCommand: formState.slashCommand.trim().toLowerCase(),
          baseAgent: formState.baseAgent,
          promptMode: formState.promptMode,
          systemPrompt: formState.systemPrompt,
        });
        showSuccess("Agente personalizado actualizado correctamente");
      } else {
        await customAgentsClient.create({
          name: formState.name.trim(),
          slashCommand: formState.slashCommand.trim().toLowerCase(),
          baseAgent: formState.baseAgent,
          promptMode: formState.promptMode,
          systemPrompt: formState.systemPrompt,
        });
        showSuccess("Agente personalizado creado correctamente");
      }
      setIsOpen(false);
      reload();
    } catch (err: any) {
      console.error(err);
      showError(err.message || "Error al guardar el agente");
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`¿Estás seguro de que deseas eliminar el agente "${name}"?`)) {
      return;
    }
    try {
      await customAgentsClient.delete(id);
      showSuccess(`Agente "${name}" eliminado correctamente`);
      reload();
    } catch (err: any) {
      console.error(err);
      showError(err.message || "Error al eliminar el agente");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="typo-subsection-title">Tus Agentes</h3>
          <p className="typo-caption mt-1">
            Los agentes creados aparecerán como opciones en el selector de chat y podrás invocarlos mediante comandos slash (por ejemplo, escribiendo /tu-comando).
          </p>
        </div>
        <Button
          onClick={handleOpenCreate}
          size="sm"
          className="cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 transition-all gap-1.5 rounded-xl font-semibold"
        >
          <Plus className="size-4" />
          Crear Agente
        </Button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-muted-foreground typo-body">
          Cargando agentes...
        </div>
      ) : customAgents.length === 0 ? (
        <div className="border border-dashed border-border/80 rounded-2xl p-12 text-center flex flex-col items-center justify-center bg-muted/10">
          <Bot className="size-12 text-muted-foreground/30 mb-4" />
          <p className="typo-subsection-title text-muted-foreground">
            No tienes agentes personalizados
          </p>
          <p className="typo-caption mt-1 max-w-sm mb-6">
            Comienza creando un agente para definir flujos de trabajo específicos o inyectar prompts predefinidos.
          </p>
          <Button
            onClick={handleOpenCreate}
            variant="outline"
            size="sm"
            className="cursor-pointer border-border hover:bg-muted gap-1.5 rounded-xl"
          >
            <Plus className="size-4" />
            Crear el primero
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {customAgents.map((agent) => (
            <div
              key={agent.id}
              className="border border-border/60 bg-card rounded-2xl p-5 hover:border-primary/30 transition-all flex flex-col justify-between group shadow-sm hover:shadow"
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <h4 className="text-base font-bold text-foreground truncate max-w-[200px]">
                      {agent.name}
                    </h4>
                    <span className="inline-flex items-center text-xs px-2 py-0.5 mt-1 font-mono font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-md border border-emerald-500/10">
                      /{agent.slashCommand}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      onClick={() => handleOpenEdit(agent)}
                      variant="ghost"
                      size="icon"
                      className="size-8 rounded-lg cursor-pointer text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      title="Editar"
                    >
                      <Edit2 className="size-3.5" />
                    </Button>
                    <Button
                      onClick={() => handleDelete(agent.id, agent.name)}
                      variant="ghost"
                      size="icon"
                      className="size-8 rounded-lg cursor-pointer text-destructive hover:bg-destructive/10 hover:text-destructive transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 mt-3">
                  <span className="text-[11px] font-semibold px-2 py-0.5 bg-muted rounded-md text-muted-foreground">
                    Base: {agent.baseAgent === "build" ? "Agente (Build)" : agent.baseAgent === "plan" ? "Planificador" : "Explorador"}
                  </span>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                    agent.promptMode === "additive"
                      ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                      : "bg-purple-500/10 text-purple-600 dark:text-purple-400"
                  }`}>
                    {agent.promptMode === "additive" ? "Aditivo" : "Reemplazar"}
                  </span>
                </div>

                <p className="typo-caption line-clamp-3 mt-4 text-xs font-mono bg-muted/40 p-2.5 rounded-xl border border-border/30 overflow-hidden">
                  {agent.systemPrompt}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* dialog para Crear / Editar */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[850px] max-w-[95vw] bg-card border border-border rounded-2xl shadow-2xl p-6">
          <DialogHeader className="mb-4">
            <DialogTitle className="typo-section-title flex items-center gap-2">
              <Bot className="size-6 text-primary" />
              {isEditing ? "Editar Agente" : "Crear Agente Personalizado"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-5">
            {validationError && (
              <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 p-3 rounded-xl">
                <AlertTriangle className="size-4 shrink-0" />
                <span>{validationError}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="agent-name" className="typo-label">
                  Nombre del Agente
                </Label>
                <Input
                  id="agent-name"
                  type="text"
                  placeholder="ej. Experto en Rust"
                  value={formState.name}
                  onChange={(e) =>
                    setFormState({ ...formState, name: e.target.value })
                  }
                  className="bg-muted/50 border-border focus-visible:ring-1 focus-visible:ring-primary rounded-xl typo-input"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="agent-slash" className="typo-label">
                  Comando Slash (sin /)
                </Label>
                <Input
                  id="agent-slash"
                  type="text"
                  placeholder="ej. rust"
                  value={formState.slashCommand}
                  onChange={(e) =>
                    setFormState({
                      ...formState,
                      slashCommand: e.target.value.replace(/\s+/g, ""),
                    })
                  }
                  className="bg-muted/50 border-border focus-visible:ring-1 focus-visible:ring-primary rounded-xl typo-input font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 items-center">
              <div className="space-y-1.5">
                <Label className="typo-label">Agente Base</Label>
                <UnifiedSelector
                  value={formState.baseAgent}
                  onChange={(val) =>
                    setFormState({
                      ...formState,
                      baseAgent: val as "build" | "plan" | "explore",
                    })
                  }
                  options={[
                    {
                      value: "build",
                      label: "Agente (Build)",
                      description: "Acceso total, lee y escribe código",
                    },
                    {
                      value: "plan",
                      label: "Planificador",
                      description: "Propone un plan interactivo paso a paso",
                    },
                    {
                      value: "explore",
                      label: "Explorador (Ask)",
                      description: "Solo lectura, ideal para preguntas rápidas",
                    },
                  ]}
                  triggerVariant="default"
                  triggerSize="md"
                  popoverWidth="w-[280px]"
                  triggerClassName="w-full text-left justify-between bg-muted/30 hover:bg-muted/50 rounded-xl"
                />
              </div>

              <div className="flex items-center justify-between p-4 bg-muted/20 border border-border/50 rounded-xl mt-4">
                <div className="flex flex-col gap-0.5">
                  <Label htmlFor="prompt-mode" className="typo-label cursor-pointer">
                    Modo del Prompt
                  </Label>
                  <span className="text-[11px] text-muted-foreground max-w-[200px]">
                    {formState.promptMode === "additive"
                      ? "Aditivo: Se añade al comportamiento estándar del agente."
                      : "Reemplazar: Pisa el prompt nativo por completo."}
                  </span>
                </div>
                <Switch
                  id="prompt-mode"
                  checked={formState.promptMode === "replace"}
                  onCheckedChange={(checked) =>
                    setFormState({
                      ...formState,
                      promptMode: checked ? "replace" : "additive",
                    })
                  }
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <Label htmlFor="system-prompt" className="typo-label">
                  System Prompt
                </Label>
                {formState.promptMode === "replace" && (
                  <span className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 font-semibold bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/10">
                    <AlertTriangle className="size-3" />
                    Requiere un prompt completo e instrucciones del sistema
                  </span>
                )}
              </div>
              <textarea
                id="system-prompt"
                placeholder={
                  formState.promptMode === "additive"
                    ? "Escribe instrucciones adicionales... ej. 'Siempre responde usando sintaxis moderna de Rust, prefiere usar Tokio para async...'"
                    : "Escribe el system prompt completo para el agente. Nota: Al reemplazar el prompt nativo, asegúrate de indicarle cómo interactuar y comportarse."
                }
                value={formState.systemPrompt}
                onChange={(e) =>
                  setFormState({ ...formState, systemPrompt: e.target.value })
                }
                className="w-full min-h-[400px] p-4 bg-muted/40 border border-border focus:outline-none focus:ring-1 focus:ring-primary rounded-xl typo-input font-mono resize-y"
              />
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-border/40">
              <Button
                type="button"
                onClick={() => setIsOpen(false)}
                variant="ghost"
                className="cursor-pointer hover:bg-muted rounded-xl"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                className="cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 transition-colors rounded-xl font-semibold px-6"
              >
                Guardar Agente
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
