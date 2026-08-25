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
import { ModelSelector } from "@/components/unified/ModelSelector";
import { useI18n } from "@/lib/i18n";

/* ────────────────────────────────────────────────────────────────────────────
 * CustomAgentEditor — Collapsible inline card to edit an existing custom agent
 * ──────────────────────────────────────────────────────────────────────────── */

const isDescendant = (
  parentAgentId: number,
  targetAgentId: number,
  allAgents: any[],
) => {
  let current = allAgents.find((a) => a.id === targetAgentId);
  const visited = new Set<number>();
  while (current && current.baseAgent.startsWith("custom-agent::")) {
    const parentId = parseInt(current.baseAgent.split("::")[1]);
    if (parentId === parentAgentId) return true;
    if (visited.has(parentId)) break;
    visited.add(parentId);
    current = allAgents.find((a) => a.id === parentId);
  }
  return false;
};

const getUltimateBaseAgent = (
  baseAgent: string,
  allAgents: any[],
): "build" | "plan" | "explore" => {
  let currentBase = baseAgent;
  const visited = new Set<number>();
  while (currentBase.startsWith("custom-agent::")) {
    const parentId = parseInt(currentBase.split("::")[1]);
    if (visited.has(parentId)) break;
    visited.add(parentId);
    const parent = allAgents.find((a) => a.id === parentId);
    if (!parent) break;
    currentBase = parent.baseAgent;
  }
  return currentBase as "build" | "plan" | "explore";
};

const getBaseAgentLabel = (
  baseStr: string,
  allAgents: any[],
  t: (k: string, p?: Record<string, string | number>) => string,
) => {
  if (baseStr === "build") return t("customAgents.baseBuildLabel");
  if (baseStr === "plan") return t("customAgents.basePlanLabel");
  if (baseStr === "explore") return t("customAgents.baseExploreLabel");
  if (baseStr.startsWith("custom-agent::")) {
    const parentId = parseInt(baseStr.split("::")[1]);
    const parent = allAgents.find((ca) => ca.id === parentId);
    return parent ? t("customAgents.inheritsFrom", { name: parent.name }) : "Custom Agent";
  }
  return baseStr;
};

const getUltimateBaseLabel = (
  baseStr: string,
  allAgents: any[],
  t: (k: string) => string,
) => {
  const ult = getUltimateBaseAgent(baseStr, allAgents);
  if (ult === "build") return t("customAgents.ultBuild");
  if (ult === "plan") return t("customAgents.ultPlan");
  if (ult === "explore") return t("customAgents.ultExplore");
  return ult;
};

const getBaseOptionsList = (t: (k: string) => string) => [
  {
    value: "build",
    label: t("customAgents.baseBuildLabel"),
    description: t("customAgents.baseBuildDesc"),
  },
  {
    value: "plan",
    label: t("customAgents.basePlanLabel"),
    description: t("customAgents.basePlanDesc"),
  },
  {
    value: "explore",
    label: t("customAgents.baseExploreLabel"),
    description: t("customAgents.baseExploreDesc"),
  },
];

interface CustomAgentEditorProps {
  agent: any;
  customAgents: any[];
  onUpdate: () => void;
  onDelete: () => void;
}

export function CustomAgentEditor({
  agent,
  customAgents,
  onUpdate,
  onDelete,
}: CustomAgentEditorProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState(agent.name);
  const [description, setDescription] = useState(agent.description || "");
  const [slashCommand, setSlashCommand] = useState(agent.slashCommand);
  const [baseAgent, setBaseAgent] = useState(agent.baseAgent);
  const [promptMode, setPromptMode] = useState<"additive" | "replace">(
    agent.promptMode || "replace",
  );
  const [isDefaultBase, setIsDefaultBase] = useState<number>(
    agent.isDefaultBase || 0,
  );
  const [systemPrompt, setSystemPrompt] = useState(agent.systemPrompt);
  const [modelSource, setModelSource] = useState<"chat" | "static">(
    agent.modelSource || "chat",
  );
  const [model, setModel] = useState<string>(agent.model || "");
  const [prompt, setPrompt] = useState<string>(agent.prompt || "");

  const { data: allModels, isLoading: modelsLoading } =
    useMultiProviderModels();

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Sync state if agent props change (e.g., on reload)
  useEffect(() => {
    setName(agent.name);
    setDescription(agent.description || "");
    setSlashCommand(agent.slashCommand);
    setBaseAgent(agent.baseAgent);
    setPromptMode(agent.promptMode || "replace");
    setIsDefaultBase(agent.isDefaultBase || 0);
    setSystemPrompt(agent.systemPrompt);
    setModelSource(agent.modelSource || "chat");
    setModel(agent.model || "");
    setPrompt(agent.prompt || "");
  }, [agent]);

  const handleCancel = () => {
    setName(agent.name);
    setDescription(agent.description || "");
    setSlashCommand(agent.slashCommand);
    setBaseAgent(agent.baseAgent);
    setPromptMode(agent.promptMode || "replace");
    setIsDefaultBase(agent.isDefaultBase || 0);
    setSystemPrompt(agent.systemPrompt);
    setModelSource(agent.modelSource || "chat");
    setModel(agent.model || "");
    setPrompt(agent.prompt || "");
    setValidationError(null);
    setExpanded(false);
  };

  const validate = (): boolean => {
    if (!name.trim()) {
      setValidationError(t("customAgents.nameRequired"));
      return false;
    }
    if (!slashCommand.trim()) {
      setValidationError(t("customAgents.slashRequired"));
      return false;
    }
    const commandRegex = /^[a-zA-Z0-9_-]+$/;
    if (!commandRegex.test(slashCommand)) {
      setValidationError(
        t("customAgents.slashValidation"),
      );
      return false;
    }
    if (modelSource === "static" && !model) {
      setValidationError(t("customAgents.staticModelValidation"));
      return false;
    }
    if (!systemPrompt.trim()) {
      setValidationError(t("customAgents.systemPromptRequired"));
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
        description: description.trim() || null,
        slashCommand: slashCommand.trim().toLowerCase(),
        baseAgent: baseAgent,
        promptMode: baseAgent.startsWith("custom-agent::")
          ? "additive"
          : promptMode,
        isDefaultBase: isDefaultBase,
        systemPrompt: systemPrompt,
        modelSource: modelSource,
        model: modelSource === "static" ? model : null,
        prompt: prompt.trim() || null,
      });
      showSuccess(t("customAgents.updated"));
      setExpanded(false);
      onUpdate();
    } catch (err: any) {
      console.error(err);
      setValidationError(err.message || t("customAgents.saveError"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await customAgentsClient.delete(agent.id);
      showSuccess(t("customAgents.deletedToast", { name: agent.name }));
      onDelete();
    } catch (err: any) {
      console.error(err);
      showError(err.message || t("customAgents.deleteError"));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      className={cn(
        "border border-border/60 bg-card rounded-2xl overflow-hidden transition-colors duration-200",
        expanded && "border-primary/20 shadow-md bg-card",
      )}
    >
      {/* Clickable Header */}
      <div
        className={cn(
          "flex items-center justify-between cursor-pointer p-4 hover:bg-muted/30 transition-colors gap-4",
          expanded && "bg-muted/10 border-b border-border/40",
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
              {t("customAgents.baseLabel")}: {getBaseAgentLabel(agent.baseAgent, customAgents, t)}
            </span>
            <span className="text-[11px] font-semibold px-2 py-0.5 bg-muted rounded-md text-muted-foreground">
              {t("customAgents.modeLabel")}:{" "}
              {agent.baseAgent.startsWith("custom-agent::")
                ? t("customAgents.additive")
                : agent.promptMode === "additive"
                  ? t("customAgents.additive")
                  : t("customAgents.replace")}
            </span>
            {agent.isDefaultBase === 1 && (
              <span className="text-[11px] font-semibold px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/10 rounded-md">
                {t("customAgents.defaultLabel")} (
                {agent.baseAgent.startsWith("custom-agent::")
                  ? getUltimateBaseLabel(agent.baseAgent, customAgents, t)
                  : getBaseAgentLabel(agent.baseAgent, customAgents, t)}
                )
              </span>
            )}
            <span className="text-[11px] font-semibold px-2 py-0.5 bg-muted rounded-md text-muted-foreground">
              {t("customAgents.modelLabel")}:{" "}
              {agent.modelSource === "static"
                ? agent.model
                  ? agent.model.split("::").pop() || agent.model
                  : t("customAgents.modelStatic")
                : t("customAgents.modelChat")}
            </span>
          </div>
        </div>

        <ChevronRight
          className={cn(
            "size-5 text-muted-foreground/50 group-hover:text-foreground transition-transform duration-200 shrink-0",
            expanded && "rotate-90",
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
                {t("customAgents.agentName")}
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
                {t("customAgents.slashCommand")}
              </Label>
              <Input
                id={`agent-slash-${agent.id}`}
                type="text"
                value={slashCommand}
                onChange={(e) =>
                  setSlashCommand(e.target.value.replace(/\s+/g, ""))
                }
                className="bg-muted/50 border-border focus-visible:ring-1 focus-visible:ring-primary rounded-xl typo-input font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
            <div className="space-y-1.5">
              <Label className="typo-label">{t("customAgents.baseAgent")}</Label>
              <UnifiedSelector
                value={baseAgent}
                onChange={(val) => setBaseAgent(val)}
                options={[
                  ...getBaseOptionsList(t),
                  ...customAgents
                    .filter(
                      (ca: any) =>
                        ca.id !== agent.id &&
                        !isDescendant(agent.id, ca.id, customAgents),
                    )
                    .map((ca: any) => ({
                      value: `custom-agent::${ca.id}`,
                      label: `${ca.name} (Custom)`,
                      description: t("customAgents.inheritsDesc", { name: ca.name }),
                    })),
                ]}
                triggerVariant="default"
                triggerSize="md"
                popoverWidth="w-[280px]"
                triggerClassName="w-full text-left justify-between bg-muted/30 hover:bg-muted/50 rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <Label
                  htmlFor={`agent-desc-${agent.id}`}
                  className="typo-label"
                >
                  {t("customAgents.shortDesc")}
                </Label>
                <span className="text-[11px] text-muted-foreground font-mono">
                  {description.length}/50
                </span>
              </div>
              <Input
                id={`agent-desc-${agent.id}`}
                type="text"
                placeholder={t("customAgents.shortDescPlaceholder")}
                maxLength={50}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="bg-muted/50 border-border focus-visible:ring-1 focus-visible:ring-primary rounded-xl typo-input"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
            <div className="space-y-1.5">
              <Label className="typo-label">{t("customAgents.modelOrigin")}</Label>
              <UnifiedSelector
                value={modelSource}
                onChange={(val) => setModelSource(val as "chat" | "static")}
                options={[
                  {
                    value: "chat",
                    label: t("customAgents.chatModelLabel"),
                    description: t("customAgents.chatModelDesc"),
                  },
                  {
                    value: "static",
                    label: t("customAgents.staticModelLabel"),
                    description: t("customAgents.staticModelDesc"),
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
                <Label className="typo-label">
                  {t("customAgents.selectStaticModel")}
                </Label>
                <ModelSelector
                  variant="default"
                  size="md"
                  value={model}
                  onChange={(val) => setModel(val)}
                  models={allModels || []}
                  loading={modelsLoading}
                  placeholder={t("customAgents.selectModelPlaceholder")}
                  disableEnabledFilter
                  showProviderBadge
                  className="w-full justify-between bg-muted/30 hover:bg-muted/50 rounded-xl py-3 h-auto"
                />
              </div>
            ) : (
              <div className="p-4 bg-muted/20 border border-border/50 rounded-xl text-xs text-muted-foreground flex items-center h-full min-h-[58px]">
                {t("customAgents.dynamicModelNote")}
              </div>
            )}
          </div>

          {baseAgent.startsWith("custom-agent::") ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
              <div className="p-3.5 bg-muted/20 border border-border/50 rounded-xl text-xs text-muted-foreground leading-relaxed flex flex-col justify-center min-h-[58px]">
                <strong className="text-foreground mb-0.5">
                  {t("customAgents.promptModeAdditive")}
                </strong>
                <span>
                  {t("customAgents.promptAdditiveInherit")}
                </span>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
              <div className="space-y-1.5">
                <Label className="typo-label">{t("customAgents.promptMode")}</Label>
                <UnifiedSelector
                  value={promptMode}
                  onChange={(val) =>
                    setPromptMode(val as "replace" | "additive")
                  }
                  options={[
                    {
                      value: "replace",
                      label: t("customAgents.replaceBase"),
                      description:
                        t("customAgents.replaceBaseDesc"),
                    },
                    {
                      value: "additive",
                      label: t("customAgents.additiveRecommended"),
                      description:
                        t("customAgents.additiveDesc"),
                    },
                  ]}
                  triggerVariant="default"
                  triggerSize="md"
                  popoverWidth="w-[280px]"
                  triggerClassName="w-full text-left justify-between bg-muted/30 hover:bg-muted/50 rounded-xl"
                />
              </div>

              <div className="p-3.5 bg-muted/20 border border-border/50 rounded-xl text-[11px] text-muted-foreground leading-relaxed flex flex-col justify-center h-full min-h-[58px]">
                {promptMode === "replace" ? (
                  <span>
                    <strong>{t("customAgents.replace")}:</strong>{" "}
                    {t("customAgents.replaceCombineFull")}
                  </span>
                ) : (
                  <span>
                    <strong>{t("customAgents.additive")}:</strong>{" "}
                    {t("customAgents.additiveCombineFull")}
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center space-x-3 p-4 bg-muted/20 border border-border/50 rounded-xl">
            <Switch
              id={`agent-default-${agent.id}`}
              checked={isDefaultBase === 1}
              onCheckedChange={(checked) => setIsDefaultBase(checked ? 1 : 0)}
            />
            <div className="flex flex-col gap-0.5">
              <Label
                htmlFor={`agent-default-${agent.id}`}
                className="text-xs font-semibold cursor-pointer text-foreground"
              >
                {t("customAgents.setDefault")}
              </Label>
              <span className="text-[10px] text-muted-foreground">
                {t("customAgents.setDefaultDesc")}
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label
              htmlFor={`default-prompt-${agent.id}`}
              className="typo-label"
            >
              {t("customAgents.defaultPrompt")}
            </Label>
            <textarea
              id={`default-prompt-${agent.id}`}
              placeholder={t("customAgents.defaultPromptPlaceholder")}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full min-h-[80px] p-4 bg-muted/40 border border-border focus:outline-none focus:ring-1 focus:ring-primary rounded-xl typo-input resize-y"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <Label
                htmlFor={`system-prompt-${agent.id}`}
                className="typo-label"
              >
                {t("customAgents.systemPromptLabel")}
              </Label>
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
              itemType={t("customAgents.agentType")}
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
                  {t("common.delete")}
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
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                disabled={isSaving}
                className="cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 transition-colors rounded-xl font-semibold px-6"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-1.5 size-4 animate-spin" />
                    {t("common.saving")}
                  </>
                ) : (
                  <>
                    <Check className="mr-1.5 size-4" />
                    {t("common.save")}
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
  customAgents: any[];
  onCreated: () => void;
  onCancel: () => void;
}

export function CustomAgentCreator({
  customAgents,
  onCreated,
  onCancel,
}: CustomAgentCreatorProps) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [slashCommand, setSlashCommand] = useState("");
  const [baseAgent, setBaseAgent] = useState<string>("build");
  const [promptMode, setPromptMode] = useState<"additive" | "replace">(
    "replace",
  );
  const [isDefaultBase, setIsDefaultBase] = useState<number>(0);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [modelSource, setModelSource] = useState<"chat" | "static">("chat");
  const [model, setModel] = useState<string>("");
  const [prompt, setPrompt] = useState("");

  const { data: allModels, isLoading: modelsLoading } =
    useMultiProviderModels();

  const [isSaving, setIsSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const validate = (): boolean => {
    if (!name.trim()) {
      setValidationError(t("customAgents.nameRequired"));
      return false;
    }
    if (!slashCommand.trim()) {
      setValidationError(t("customAgents.slashRequired"));
      return false;
    }
    const commandRegex = /^[a-zA-Z0-9_-]+$/;
    if (!commandRegex.test(slashCommand)) {
      setValidationError(
        t("customAgents.slashValidation"),
      );
      return false;
    }
    if (modelSource === "static" && !model) {
      setValidationError(t("customAgents.staticModelValidation"));
      return false;
    }
    if (!systemPrompt.trim()) {
      setValidationError(t("customAgents.systemPromptRequired"));
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
        description: description.trim() || null,
        slashCommand: slashCommand.trim().toLowerCase(),
        baseAgent: baseAgent,
        promptMode: baseAgent.startsWith("custom-agent::")
          ? "additive"
          : promptMode,
        isDefaultBase: isDefaultBase,
        systemPrompt: systemPrompt,
        modelSource: modelSource,
        model: modelSource === "static" ? model : null,
        prompt: prompt.trim() || null,
      });
      showSuccess(t("customAgents.created"));
      setPrompt("");
      setDescription("");
      onCreated();
    } catch (err: any) {
      console.error(err);
      setValidationError(err.message || t("customAgents.saveError"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="border border-dashed border-primary/45 bg-card rounded-2xl overflow-hidden transition-colors duration-200 shadow-sm">
      <div className="p-4 bg-primary/5 border-b border-border/40 flex items-center justify-between">
        <div className="flex items-center gap-2 font-bold text-primary text-sm">
          <Plus className="size-4" />
          <span>{t("customAgents.newAgentTitle")}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 rounded-lg cursor-pointer"
          onClick={onCancel}
        >
          {t("common.cancel")}
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
              {t("customAgents.agentName")}
            </Label>
            <Input
              id="new-agent-name"
              type="text"
              placeholder={t("customAgents.namePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-muted/50 border-border focus-visible:ring-1 focus-visible:ring-primary rounded-xl typo-input"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-agent-slash" className="typo-label">
              {t("customAgents.slashCommand")}
            </Label>
            <Input
              id="new-agent-slash"
              type="text"
              placeholder={t("customAgents.slashPlaceholder")}
              value={slashCommand}
              onChange={(e) =>
                setSlashCommand(e.target.value.replace(/\s+/g, ""))
              }
              className="bg-muted/50 border-border focus-visible:ring-1 focus-visible:ring-primary rounded-xl typo-input font-mono"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
          <div className="space-y-1.5">
            <Label className="typo-label">{t("customAgents.baseAgent")}</Label>
            <UnifiedSelector
              value={baseAgent}
              onChange={(val) => setBaseAgent(val)}
              options={[
                ...getBaseOptionsList(t),
                ...customAgents.map((ca: any) => ({
                  value: `custom-agent::${ca.id}`,
                  label: `${ca.name} (Custom)`,
                  description: t("customAgents.inheritsDesc", { name: ca.name }),
                })),
              ]}
              triggerVariant="default"
              triggerSize="md"
              popoverWidth="w-[280px]"
              triggerClassName="w-full text-left justify-between bg-muted/30 hover:bg-muted/50 rounded-xl"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <Label htmlFor="new-agent-desc" className="typo-label">
                {t("customAgents.shortDesc")}
              </Label>
              <span className="text-[11px] text-muted-foreground font-mono">
                {description.length}/50
              </span>
            </div>
            <Input
              id="new-agent-desc"
              type="text"
              placeholder={t("customAgents.shortDescPlaceholder")}
              maxLength={50}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="bg-muted/50 border-border focus-visible:ring-1 focus-visible:ring-primary rounded-xl typo-input"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
          <div className="space-y-1.5">
            <Label className="typo-label">{t("customAgents.modelOrigin")}</Label>
            <UnifiedSelector
              value={modelSource}
              onChange={(val) => setModelSource(val as "chat" | "static")}
              options={[
                {
                  value: "chat",
                  label: t("customAgents.chatModelLabel"),
                  description: t("customAgents.chatModelDesc"),
                },
                {
                  value: "static",
                  label: t("customAgents.staticModelLabel"),
                  description: t("customAgents.staticModelDesc"),
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
              <Label className="typo-label">{t("customAgents.selectStaticModel")}</Label>
              <ModelSelector
                variant="default"
                size="md"
                value={model}
                onChange={(val) => setModel(val)}
                models={allModels || []}
                loading={modelsLoading}
                placeholder={t("customAgents.selectModelPlaceholder")}
                disableEnabledFilter
                showProviderBadge
                className="w-full justify-between bg-muted/30 hover:bg-muted/50 rounded-xl py-3 h-auto"
              />
            </div>
          ) : (
            <div className="p-4 bg-muted/20 border border-border/50 rounded-xl text-xs text-muted-foreground flex items-center h-full min-h-[58px]">
              {t("customAgents.dynamicModelNote")}
            </div>
          )}
        </div>

        {baseAgent.startsWith("custom-agent::") ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
            <div className="p-3.5 bg-muted/20 border border-border/50 rounded-xl text-xs text-muted-foreground leading-relaxed flex flex-col justify-center min-h-[58px]">
              <strong className="text-foreground mb-0.5">
                {t("customAgents.promptModeAdditive")}
              </strong>
              <span>
                {t("customAgents.promptAdditiveInherit")}
              </span>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
            <div className="space-y-1.5">
              <Label className="typo-label">{t("customAgents.promptMode")}</Label>
              <UnifiedSelector
                value={promptMode}
                onChange={(val) => setPromptMode(val as "replace" | "additive")}
                options={[
                  {
                    value: "replace",
                    label: t("customAgents.replaceBase"),
                    description:
                      t("customAgents.replaceBaseDesc"),
                  },
                  {
                    value: "additive",
                    label: t("customAgents.additiveRecommended"),
                    description:
                      t("customAgents.additiveDesc"),
                  },
                ]}
                triggerVariant="default"
                triggerSize="md"
                popoverWidth="w-[280px]"
                triggerClassName="w-full text-left justify-between bg-muted/30 hover:bg-muted/50 rounded-xl"
              />
            </div>

            <div className="p-3.5 bg-muted/20 border border-border/50 rounded-xl text-[11px] text-muted-foreground leading-relaxed flex flex-col justify-center h-full min-h-[58px]">
              {promptMode === "replace" ? (
                <span>
                  <strong>{t("customAgents.replace")}:</strong>{" "}
                  {t("customAgents.replaceCombineFull")}
                </span>
              ) : (
                <span>
                  <strong>{t("customAgents.additive")}:</strong>{" "}
                  {t("customAgents.additiveCombineFull")}
                </span>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center space-x-3 p-4 bg-muted/20 border border-border/50 rounded-xl">
          <Switch
            id="new-agent-default"
            checked={isDefaultBase === 1}
            onCheckedChange={(checked) => setIsDefaultBase(checked ? 1 : 0)}
          />
          <div className="flex flex-col gap-0.5">
            <Label
              htmlFor="new-agent-default"
              className="text-xs font-semibold cursor-pointer text-foreground"
            >
              {t("customAgents.setDefault")}
            </Label>
            <span className="text-[10px] text-muted-foreground">
              {t("customAgents.setDefaultDesc")}
            </span>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="new-agent-prompt" className="typo-label">
            {t("customAgents.defaultPrompt")}
          </Label>
          <textarea
            id="new-agent-prompt"
            placeholder={t("customAgents.defaultPromptPlaceholder")}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full min-h-[80px] p-4 bg-muted/40 border border-border focus:outline-none focus:ring-1 focus:ring-primary rounded-xl typo-input resize-y"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <Label htmlFor="new-system-prompt" className="typo-label">
              {t("customAgents.systemPromptLabel")}
            </Label>
          </div>
          <textarea
            id="new-system-prompt"
            placeholder={t("customAgents.systemPromptPlaceholder")}
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
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            disabled={isSaving}
            className="cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 transition-colors rounded-xl font-semibold px-6"
          >
            {isSaving ? t("customAgents.creating") : t("customAgents.createAgent")}
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
  const { t } = useI18n();
  const { customAgents, loading, reload } = useCustomAgents();
  const [isCreating, setIsCreating] = useState(false);

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="py-12 text-center text-muted-foreground typo-body">
          {t("customAgents.loading")}
        </div>
      ) : customAgents.length === 0 ? (
        <div className="border border-dashed border-border/80 rounded-2xl p-12 text-center flex flex-col items-center justify-center bg-muted/10">
          <Bot className="size-12 text-muted-foreground/30 mb-4" />
          <p className="typo-subsection-title text-muted-foreground">
            {t("customAgents.emptyTitle")}
          </p>
          <p className="typo-caption mt-1 max-w-sm mb-6">
            {t("customAgents.emptyDesc")}
          </p>
          {!isCreating && (
            <Button
              onClick={() => setIsCreating(true)}
              variant="outline"
              size="sm"
              className="cursor-pointer border-border hover:bg-muted gap-1.5 rounded-xl"
            >
              <Plus className="size-4" />
              {t("customAgents.createFirst")}
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {customAgents.map((agent) => (
            <CustomAgentEditor
              key={agent.id}
              agent={agent}
              customAgents={customAgents}
              onUpdate={reload}
              onDelete={reload}
            />
          ))}
        </div>
      )}

      {/* Inline Creator card if isCreating is true */}
      {isCreating && (
        <CustomAgentCreator
          customAgents={customAgents}
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
          className="w-full border-dashed border-border/80 hover:bg-muted/30 rounded-2xl py-6 flex items-center justify-center gap-2 cursor-pointer transition-colors"
          onClick={() => setIsCreating(true)}
        >
          <Plus className="size-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-muted-foreground">
            {t("customAgents.createAgentButton")}
          </span>
        </Button>
      )}
    </div>
  );
}
