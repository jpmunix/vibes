import React, { useState, useEffect } from "react";
import { useCustomAgents } from "@/hooks/useCustomAgents";
import { customAgentsClient } from "@/ipc/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { UnifiedSelector } from "@/components/ui/UnifiedSelector";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import {
  Plus,
  Trash2,
  Bot,
  AlertTriangle,
  ChevronRight,
  Check,
  Loader2,
} from "@/components/ui/icons";
import { showSuccess, showError } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useMultiProviderModels } from "@/hooks/useMultiProviderModels";
import { SettingsModelSelector } from "@/components/SettingsModelSelector";

/* ────────────────────────────────────────────────────────────────────────────
 * CustomAgentEditor — Collapsible inline card to edit an existing custom agent
 * ──────────────────────────────────────────────────────────────────────────── */

interface CustomAgentEditorProps {
  agent: any;
  onUpdate: () => void;
  onDelete: () => void;
}

export function CustomAgentEditor({ agent, onUpdate, onDelete }: CustomAgentEditorProps) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState(agent.name);
  const [slashCommand, setSlashCommand] = useState(agent.slashCommand);
  const [baseAgent, setBaseAgent] = useState(agent.baseAgent);
  const [promptMode, setPromptMode] = useState(agent.promptMode);
  const [systemPrompt, setSystemPrompt] = useState(agent.systemPrompt);
  const [modelSource, setModelSource] = useState<"chat" | "static">(agent.modelSource || "chat");
  const [model, setModel] = useState<string>(agent.model || "");
  const [prompt, setPrompt] = useState<string>(agent.prompt || "");

  const { data: allModels, isLoading: modelsLoading } = useMultiProviderModels();
  
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Sync state if agent props change (e.g., on reload)
  useEffect(() => {
    setName(agent.name);
    setSlashCommand(agent.slashCommand);
    setBaseAgent(agent.baseAgent);
    setPromptMode(agent.promptMode);
    setSystemPrompt(agent.systemPrompt);
    setModelSource(agent.modelSource || "chat");
    setModel(agent.model || "");
    setPrompt(agent.prompt || "");
  }, [agent]);

  const handleCancel = () => {
    setName(agent.name);
    setSlashCommand(agent.slashCommand);
    setBaseAgent(agent.baseAgent);
    setPromptMode(agent.promptMode);
    setSystemPrompt(agent.systemPrompt);
    setModelSource(agent.modelSource || "chat");
    setModel(agent.model || "");
    setPrompt(agent.prompt || "");
    setValidationError(null);
    setExpanded(false);
  };

  const validate = (): boolean => {
    if (!name.trim()) {
      setValidationError("El nombre del agente es requerido.");
      return false;
    }
    if (!slashCommand.trim()) {
      setValidationError("El comando slash es requerido.");
      return false;
    }
    const commandRegex = /^[a-zA-Z0-9_-]+$/;
    if (!commandRegex.test(slashCommand)) {
      setValidationError(
        "El comando slash solo puede contener letras, números, guiones y guiones bajos (sin espacios ni la barra inicial /)."
      );
      return false;
    }
    if (modelSource === "static" && !model) {
      setValidationError("Por favor, selecciona un modelo estático.");
      return false;
    }
    if (!systemPrompt.trim()) {
      setValidationError("Las instrucciones del System Prompt son requeridas.");
      return false;
    }
    setValidationError(null);
    return true;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSaving(true);
    try {
      await customAgentsClient.update({
        id: agent.id,
        name: name.trim(),
        slashCommand: slashCommand.trim().toLowerCase(),
        baseAgent: baseAgent,
        promptMode: promptMode,
        systemPrompt: systemPrompt,
        modelSource: modelSource,
        model: modelSource === "static" ? model : null,
        prompt: prompt.trim() || null,
      });
      showSuccess("Agente personalizado actualizado correctamente");
      setExpanded(false);
      onUpdate();
    } catch (err: any) {
      console.error(err);
      setValidationError(err.message || "Error al guardar el agente");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await customAgentsClient.delete(agent.id);
      showSuccess(`Agente "${agent.name}" eliminado correctamente`);
      onDelete();
    } catch (err: any) {
      console.error(err);
      showError(err.message || "Error al eliminar el agente");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className={cn(
      "border border-border/60 bg-card rounded-2xl overflow-hidden transition-all duration-200",
      expanded && "border-primary/20 shadow-md bg-card"
    )}>
      {/* Clickable Header */}
      <div
        className={cn(
          "flex items-center justify-between cursor-pointer p-4 hover:bg-muted/30 transition-colors gap-4",
          expanded && "bg-muted/10 border-b border-border/40"
        )}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              {agent.name}
            </h3>
          </div>
          
          <div className="flex flex-wrap gap-1.5 shrink-0 items-center">
            <span className="inline-flex items-center text-xs px-2 py-0.5 font-mono font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-md border border-emerald-500/10">
              /{agent.slashCommand}
            </span>
            <span className="text-[11px] font-semibold px-2 py-0.5 bg-muted rounded-md text-muted-foreground">
              Base: {agent.baseAgent === "build" ? "Agente (Build)" : agent.baseAgent === "plan" ? "Planificador" : "Explorador"}
            </span>
            <span className="text-[11px] font-semibold px-2 py-0.5 bg-muted rounded-md text-muted-foreground">
              Modelo: {agent.modelSource === "static" ? (agent.model ? (agent.model.split("::").pop() || agent.model) : "Estático") : "Chat"}
            </span>
            <span className={cn(
              "text-[11px] font-semibold px-2 py-0.5 rounded-md",
              agent.promptMode === "additive"
                ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                : "bg-purple-500/10 text-purple-600 dark:text-purple-400"
            )}>
              {agent.promptMode === "additive" ? "Aditivo" : "Reemplazar"}
            </span>
          </div>
        </div>
        
        <ChevronRight
          className={cn(
            "size-5 text-muted-foreground/50 group-hover:text-foreground transition-transform duration-200 shrink-0",
            expanded && "rotate-90"
          )}
        />
      </div>

      {/* Expanded Form */}
      {expanded && (
        <form onSubmit={handleSave} className="p-5 bg-muted/5 space-y-4">
          {validationError && (
            <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 p-3 rounded-xl">
              <AlertTriangle className="size-4 shrink-0" />
              <span>{validationError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor={`agent-name-${agent.id}`} className="typo-label">
                Nombre del Agente
              </Label>
              <Input
                id={`agent-name-${agent.id}`}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-muted/50 border-border focus-visible:ring-1 focus-visible:ring-primary rounded-xl typo-input"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`agent-slash-${agent.id}`} className="typo-label">
                Comando Slash (sin /)
              </Label>
              <Input
                id={`agent-slash-${agent.id}`}
                type="text"
                value={slashCommand}
                onChange={(e) => setSlashCommand(e.target.value.replace(/\s+/g, ""))}
                className="bg-muted/50 border-border focus-visible:ring-1 focus-visible:ring-primary rounded-xl typo-input font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
            <div className="space-y-1.5">
              <Label className="typo-label">Agente Base</Label>
              <UnifiedSelector
                value={baseAgent}
                onChange={(val) => setBaseAgent(val as "build" | "plan" | "explore")}
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

            <div className="flex items-center justify-between p-4 bg-muted/20 border border-border/50 rounded-xl">
              <div className="flex flex-col gap-0.5">
                <Label htmlFor={`prompt-mode-${agent.id}`} className="typo-label cursor-pointer">
                  Modo del Prompt
                </Label>
                <span className="text-[11px] text-muted-foreground max-w-[200px]">
                  {promptMode === "additive"
                    ? "Aditivo: Se añade al comportamiento estándar."
                    : "Reemplazar: Pisa el prompt nativo por completo."}
                </span>
              </div>
              <Switch
                id={`prompt-mode-${agent.id}`}
                checked={promptMode === "replace"}
                onCheckedChange={(checked) => setPromptMode(checked ? "replace" : "additive")}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
            <div className="space-y-1.5">
              <Label className="typo-label">Origen del Modelo</Label>
              <UnifiedSelector
                value={modelSource}
                onChange={(val) => setModelSource(val as "chat" | "static")}
                options={[
                  {
                    value: "chat",
                    label: "Modelo del chat",
                    description: "Usa el modelo activo seleccionado en el chat",
                  },
                  {
                    value: "static",
                    label: "Modelo estático",
                    description: "Usa siempre un modelo fijo configurado",
                  },
                ]}
                triggerVariant="default"
                triggerSize="md"
                popoverWidth="w-[280px]"
                triggerClassName="w-full text-left justify-between bg-muted/30 hover:bg-muted/50 rounded-xl"
              />
            </div>

            {modelSource === "static" ? (
              <div className="space-y-1.5">
                <Label className="typo-label">Seleccionar Modelo Estático</Label>
                <SettingsModelSelector
                  variant="default"
                  size="md"
                  selectedModel={model}
                  onModelSelect={(val) => setModel(val)}
                  models={allModels || []}
                  loading={modelsLoading}
                  placeholder="Selecciona un modelo..."
                  disableEnabledFilter
                  showProviderBadge
                  className="w-full justify-between bg-muted/30 hover:bg-muted/50 rounded-xl py-3 h-auto"
                />
              </div>
            ) : (
              <div className="p-4 bg-muted/20 border border-border/50 rounded-xl text-xs text-muted-foreground flex items-center h-full min-h-[58px]">
                El agente utilizará de forma dinámica el modelo que tengas seleccionado en la caja de chat al enviar el mensaje.
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`default-prompt-${agent.id}`} className="typo-label">
              Prompt por defecto (Autopegado)
            </Label>
            <textarea
              id={`default-prompt-${agent.id}`}
              placeholder="Escribe el prompt que se autopegará al seleccionar el agente (opcional)..."
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full min-h-[80px] p-4 bg-muted/40 border border-border focus:outline-none focus:ring-1 focus:ring-primary rounded-xl typo-input resize-y"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <Label htmlFor={`system-prompt-${agent.id}`} className="typo-label">
                System Prompt
              </Label>
              {promptMode === "replace" && (
                <span className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 font-semibold bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/10">
                  <AlertTriangle className="size-3" />
                  Requiere un prompt completo e instrucciones del sistema
                </span>
              )}
            </div>
            <textarea
              id={`system-prompt-${agent.id}`}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="w-full min-h-[250px] p-4 bg-muted/40 border border-border focus:outline-none focus:ring-1 focus:ring-primary rounded-xl typo-input font-mono resize-y"
            />
          </div>

          <div className="flex items-center justify-between gap-3 pt-3 border-t border-border/40">
            <DeleteConfirmationDialog
              itemName={agent.name}
              itemType="agente personalizado"
              onDelete={handleDelete}
              isDeleting={isDeleting}
              trigger={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive rounded-xl"
                  disabled={isDeleting}
                >
                  <Trash2 className="size-3.5" />
                  Eliminar
                </Button>
              }
            />
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={handleCancel}
                variant="ghost"
                className="cursor-pointer hover:bg-muted rounded-xl"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={isSaving}
                className="cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 transition-colors rounded-xl font-semibold px-6"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-1.5 size-4 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <Check className="mr-1.5 size-4" />
                    Guardar
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * CustomAgentCreator — Collapsible inline card to create a new custom agent
 * ──────────────────────────────────────────────────────────────────────────── */

interface CustomAgentCreatorProps {
  onCreated: () => void;
  onCancel: () => void;
}

export function CustomAgentCreator({ onCreated, onCancel }: CustomAgentCreatorProps) {
  const [name, setName] = useState("");
  const [slashCommand, setSlashCommand] = useState("");
  const [baseAgent, setBaseAgent] = useState<"build" | "plan" | "explore">("build");
  const [promptMode, setPromptMode] = useState<"additive" | "replace">("additive");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [modelSource, setModelSource] = useState<"chat" | "static">("chat");
  const [model, setModel] = useState<string>("");
  const [prompt, setPrompt] = useState("");

  const { data: allModels, isLoading: modelsLoading } = useMultiProviderModels();
  
  const [isSaving, setIsSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const validate = (): boolean => {
    if (!name.trim()) {
      setValidationError("El nombre del agente es requerido.");
      return false;
    }
    if (!slashCommand.trim()) {
      setValidationError("El comando slash es requerido.");
      return false;
    }
    const commandRegex = /^[a-zA-Z0-9_-]+$/;
    if (!commandRegex.test(slashCommand)) {
      setValidationError(
        "El comando slash solo puede contener letras, números, guiones y guiones bajos (sin espacios ni la barra inicial /)."
      );
      return false;
    }
    if (modelSource === "static" && !model) {
      setValidationError("Por favor, selecciona un modelo estático.");
      return false;
    }
    if (!systemPrompt.trim()) {
      setValidationError("Las instrucciones del System Prompt son requeridas.");
      return false;
    }
    setValidationError(null);
    return true;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSaving(true);
    try {
      await customAgentsClient.create({
        name: name.trim(),
        slashCommand: slashCommand.trim().toLowerCase(),
        baseAgent: baseAgent,
        promptMode: promptMode,
        systemPrompt: systemPrompt,
        modelSource: modelSource,
        model: modelSource === "static" ? model : null,
        prompt: prompt.trim() || null,
      });
      showSuccess("Agente personalizado creado correctamente");
      setPrompt("");
      onCreated();
    } catch (err: any) {
      console.error(err);
      setValidationError(err.message || "Error al guardar el agente");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="border border-dashed border-primary/45 bg-card rounded-2xl overflow-hidden transition-all duration-200 shadow-sm">
      <div className="p-4 bg-primary/5 border-b border-border/40 flex items-center justify-between">
        <div className="flex items-center gap-2 font-bold text-primary text-sm">
          <Plus className="size-4" />
          <span>Nuevo Agente Personalizado</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 rounded-lg cursor-pointer"
          onClick={onCancel}
        >
          Cancelar
        </Button>
      </div>
      
      <form onSubmit={handleSave} className="p-5 bg-muted/10 space-y-4">
        {validationError && (
          <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 border border-destructive/20 p-3 rounded-xl">
            <AlertTriangle className="size-4 shrink-0" />
            <span>{validationError}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="new-agent-name" className="typo-label">
              Nombre del Agente
            </Label>
            <Input
              id="new-agent-name"
              type="text"
              placeholder="ej. Experto en Rust"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-muted/50 border-border focus-visible:ring-1 focus-visible:ring-primary rounded-xl typo-input"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-agent-slash" className="typo-label">
              Comando Slash (sin /)
            </Label>
            <Input
              id="new-agent-slash"
              type="text"
              placeholder="ej. rust"
              value={slashCommand}
              onChange={(e) => setSlashCommand(e.target.value.replace(/\s+/g, ""))}
              className="bg-muted/50 border-border focus-visible:ring-1 focus-visible:ring-primary rounded-xl typo-input font-mono"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
          <div className="space-y-1.5">
            <Label className="typo-label">Agente Base</Label>
            <UnifiedSelector
              value={baseAgent}
              onChange={(val) => setBaseAgent(val as "build" | "plan" | "explore")}
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

          <div className="flex items-center justify-between p-4 bg-muted/20 border border-border/50 rounded-xl">
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="new-prompt-mode" className="typo-label cursor-pointer">
                Modo del Prompt
              </Label>
              <span className="text-[11px] text-muted-foreground max-w-[200px]">
                {promptMode === "additive"
                  ? "Aditivo: Se añade al comportamiento estándar."
                  : "Reemplazar: Pisa el prompt nativo por completo."}
              </span>
            </div>
            <Switch
              id="new-prompt-mode"
              checked={promptMode === "replace"}
              onCheckedChange={(checked) => setPromptMode(checked ? "replace" : "additive")}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
          <div className="space-y-1.5">
            <Label className="typo-label">Origen del Modelo</Label>
            <UnifiedSelector
              value={modelSource}
              onChange={(val) => setModelSource(val as "chat" | "static")}
              options={[
                {
                  value: "chat",
                  label: "Modelo del chat",
                  description: "Usa el modelo activo seleccionado en el chat",
                },
                {
                  value: "static",
                  label: "Modelo estático",
                  description: "Usa siempre un modelo fijo configurado",
                },
              ]}
              triggerVariant="default"
              triggerSize="md"
              popoverWidth="w-[280px]"
              triggerClassName="w-full text-left justify-between bg-muted/30 hover:bg-muted/50 rounded-xl"
            />
          </div>

          {modelSource === "static" ? (
            <div className="space-y-1.5">
              <Label className="typo-label">Seleccionar Modelo Estático</Label>
              <SettingsModelSelector
                variant="default"
                size="md"
                selectedModel={model}
                onModelSelect={(val) => setModel(val)}
                models={allModels || []}
                loading={modelsLoading}
                placeholder="Selecciona un modelo..."
                disableEnabledFilter
                showProviderBadge
                className="w-full justify-between bg-muted/30 hover:bg-muted/50 rounded-xl py-3 h-auto"
              />
            </div>
          ) : (
            <div className="p-4 bg-muted/20 border border-border/50 rounded-xl text-xs text-muted-foreground flex items-center h-full min-h-[58px]">
              El agente utilizará de forma dinámica el modelo que tengas seleccionado en la caja de chat al enviar el mensaje.
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="new-agent-prompt" className="typo-label">
            Prompt por defecto (Autopegado)
          </Label>
          <textarea
            id="new-agent-prompt"
            placeholder="Escribe el prompt que se autopegará al seleccionar el agente (opcional)..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full min-h-[80px] p-4 bg-muted/40 border border-border focus:outline-none focus:ring-1 focus:ring-primary rounded-xl typo-input resize-y"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <Label htmlFor="new-system-prompt" className="typo-label">
              System Prompt
            </Label>
            {promptMode === "replace" && (
              <span className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 font-semibold bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/10">
                <AlertTriangle className="size-3" />
                Requiere un prompt completo e instrucciones del sistema
              </span>
            )}
          </div>
          <textarea
            id="new-system-prompt"
            placeholder={
              promptMode === "additive"
                ? "Escribe instrucciones adicionales... ej. 'Siempre responde usando sintaxis moderna de Rust, prefiere usar Tokio...'"
                : "Escribe el system prompt completo para el agente. Nota: Al reemplazar el prompt nativo, asegúrate de indicarle cómo interactuar y comportarse."
            }
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            className="w-full min-h-[250px] p-4 bg-muted/40 border border-border focus:outline-none focus:ring-1 focus:ring-primary rounded-xl typo-input font-mono resize-y"
          />
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-border/40">
          <Button
            type="button"
            onClick={onCancel}
            variant="ghost"
            className="cursor-pointer hover:bg-muted rounded-xl"
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={isSaving}
            className="cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 transition-colors rounded-xl font-semibold px-6"
          >
            {isSaving ? "Creando..." : "Crear Agente"}
          </Button>
        </div>
      </form>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * CustomAgentsSection — Core list and interaction wrapper for Custom Agents settings
 * ──────────────────────────────────────────────────────────────────────────── */

export function CustomAgentsSection() {
  const { customAgents, loading, reload } = useCustomAgents();
  const [isCreating, setIsCreating] = useState(false);

  return (
    <div className="space-y-4">
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
          {!isCreating && (
            <Button
              onClick={() => setIsCreating(true)}
              variant="outline"
              size="sm"
              className="cursor-pointer border-border hover:bg-muted gap-1.5 rounded-xl"
            >
              <Plus className="size-4" />
              Crear el primero
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {customAgents.map((agent) => (
            <CustomAgentEditor
              key={agent.id}
              agent={agent}
              onUpdate={reload}
              onDelete={reload}
            />
          ))}
        </div>
      )}

      {/* Inline Creator card if isCreating is true */}
      {isCreating && (
        <CustomAgentCreator
          onCreated={() => {
            setIsCreating(false);
            reload();
          }}
          onCancel={() => setIsCreating(false)}
        />
      )}

      {/* Button to show Creator if not empty and not already creating */}
      {!loading && customAgents.length > 0 && !isCreating && (
        <Button
          variant="outline"
          className="w-full border-dashed border-border/80 hover:bg-muted/30 rounded-2xl py-6 flex items-center justify-center gap-2 cursor-pointer transition-all"
          onClick={() => setIsCreating(true)}
        >
          <Plus className="size-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-muted-foreground">
            Crear Agente Personalizado
          </span>
        </Button>
      )}
    </div>
  );
}
