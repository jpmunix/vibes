import React, { useState } from "react";
import { useSettings } from "@/hooks/useSettings";
import { cn } from "@/lib/utils";
import type {
  PermissionDecision,
  PermissionsConfig,
  PermissionCustomRule,
} from "@/lib/schemas";
import { ChevronRight, Plus, X } from "@/components/ui/icons";

// ── Tool definitions — maps vibes-core toolIds to UI labels ──
// The runtime permission gate reads settings.permissions.tools[toolId].
// `pending: true` = tool declared in the schema but NOT registered in the
// vibes-core runtime yet. The pill is shown disabled so the user knows it
// doesn't do anything today.
interface ToolDef {
  toolId: string;
  label: string;
  description: string;
  defaultValue: PermissionDecision;
  pending?: boolean;
}

const TOOLS: ToolDef[] = [
  {
    toolId: "read_file",
    label: "Leer archivos",
    description: "Leer el contenido de archivos del proyecto",
    defaultValue: "allow",
  },
  {
    toolId: "write_file",
    label: "Escribir archivos",
    description: "Crear y sobrescribir archivos del proyecto",
    defaultValue: "ask",
  },
  {
    toolId: "edit_file",
    label: "Editar archivos",
    description: "Modificar archivos existentes del proyecto",
    defaultValue: "ask",
  },
  {
    toolId: "glob",
    label: "Buscar archivos por patrón",
    description: "Encontrar archivos por nombre o patrón (glob)",
    defaultValue: "allow",
  },
  {
    toolId: "grep",
    label: "Buscar contenido",
    description: "Buscar texto dentro de los archivos del proyecto",
    defaultValue: "allow",
  },
  {
    toolId: "shell",
    label: "Terminal (bash)",
    description: "Ejecutar comandos en la terminal del proyecto",
    defaultValue: "ask",
  },
  // ── PENDING: declaradas en el schema pero sin tool registrada en
  // vibes-core todavía. El pill se muestra deshabilitado (no hace nada).
  {
    toolId: "webfetch",
    label: "Acceso web",
    description: "Acceder a URLs externas",
    defaultValue: "ask",
    pending: true,
  },
  {
    toolId: "websearch",
    label: "Búsqueda web",
    description: "Buscar información en internet",
    defaultValue: "ask",
    pending: true,
  },
  {
    toolId: "task",
    label: "Subagentes",
    description: "Lanzar sub-agentes para tareas paralelas",
    defaultValue: "ask",
    pending: true,
  },
  {
    toolId: "skill",
    label: "Skills",
    description: "Ejecutar skills y prompts predefinidos",
    defaultValue: "ask",
    pending: true,
  },
];

// ── Shell sub-pills — granular rules for shell commands ──
// Mirrors PermissionsConfig.shellSubPills in the schema.
interface SubPillDef {
  subPillKey: keyof NonNullable<PermissionsConfig["shellSubPills"]>;
  label: string;
  defaultValue: PermissionDecision;
}

const SHELL_SUB_PILLS: SubPillDef[] = [
  { subPillKey: "rm", label: "rm (borrar)", defaultValue: "ask" },
  { subPillKey: "gitReset", label: "git reset", defaultValue: "ask" },
  { subPillKey: "gitPush", label: "git push", defaultValue: "ask" },
  { subPillKey: "gitPushForce", label: "git push --force", defaultValue: "deny" },
  { subPillKey: "gitPushDelete", label: "git push --delete", defaultValue: "deny" },
];

const PERMISSION_OPTIONS: { value: PermissionDecision; label: string }[] = [
  { value: "allow", label: "Siempre" },
  { value: "ask", label: "Preguntar" },
  { value: "deny", label: "Nunca" },
];

// ── Tri-state pill following the existing design tokens ──
function PermissionPill({
  value,
  onChange,
  disabled,
}: {
  value: PermissionDecision;
  onChange: (v: PermissionDecision) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative bg-muted/50 rounded-xl p-1 flex w-fit border border-border",
        disabled && "opacity-40 pointer-events-none select-none",
      )}
    >
      {PERMISSION_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "px-4 py-1.5 typo-select rounded-lg transition-colors duration-200 cursor-pointer",
            value === opt.value
              ? "bg-primary text-primary-foreground shadow-sm"
              : "hover:bg-primary/10",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Badge "pendiente" — visible de lejos, que se note que no está activo ──
function PendingBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/40 text-amber-600 dark:text-amber-400 text-[10px] font-semibold uppercase tracking-wider">
      ⏳ Sin soporte runtime
    </span>
  );
}

// ── Reusable SettingRow matching AIBehaviorSettings.SettingRow ──
function PermissionRow({
  label,
  description,
  control,
  pending,
}: {
  label: string;
  description?: string;
  control: React.ReactNode;
  pending?: boolean;
}) {
  return (
    <div className="flex justify-between gap-8 p-4 rounded-xl hover:bg-muted/50 transition-colors items-center">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="typo-label">{label}</h3>
          {pending && <PendingBadge />}
        </div>
        {description && (
          <p className="typo-caption mt-1 leading-relaxed">{description}</p>
        )}
        {pending && (
          <p className="typo-caption mt-0.5 text-amber-600/80 dark:text-amber-400/80 leading-relaxed">
            Esta herramienta aún no está activa en el runtime. El permiso se
            guardará pero no tendrá efecto hasta que se implemente.
          </p>
        )}
      </div>
      <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
        {control}
      </div>
    </div>
  );
}

// ── Main component (collapsible, following Modelos pattern) ──
export function AgentPermissionsSettings() {
  const { settings, updateSettings } = useSettings();
  // ACTIVE policy — read from settings.permissions (Slice 3.2 schema).
  const perms: PermissionsConfig | undefined = settings?.permissions;

  const [expanded, setExpanded] = useState(false);
  const [bashExpanded, setBashExpanded] = useState(false);
  const [newRulePattern, setNewRulePattern] = useState("");
  const [newRulePermission, setNewRulePermission] =
    useState<PermissionDecision>("ask");

  // ── tools ──
  const getToolValue = (tool: ToolDef): PermissionDecision => {
    const v = perms?.tools?.[tool.toolId as keyof NonNullable<PermissionsConfig["tools"]>];
    return v ?? tool.defaultValue;
  };

  const setToolValue = async (tool: ToolDef, value: PermissionDecision) => {
    await updateSettings({
      permissions: {
        ...perms,
        tools: {
          ...perms?.tools,
          [tool.toolId]: value,
        },
      },
    });
  };

  // ── shell sub-pills ──
  const getSubPillValue = (sub: SubPillDef): PermissionDecision => {
    const v = perms?.shellSubPills?.[sub.subPillKey];
    return v ?? sub.defaultValue;
  };

  const setSubPillValue = async (sub: SubPillDef, value: PermissionDecision) => {
    await updateSettings({
      permissions: {
        ...perms,
        shellSubPills: {
          ...perms?.shellSubPills,
          [sub.subPillKey]: value,
        },
      },
    });
  };

  // ── custom rules ──
  const customRules: PermissionCustomRule[] = perms?.customRules ?? [];

  const addCustomRule = async () => {
    const pattern = newRulePattern.trim();
    if (!pattern) return;
    const rule: PermissionCustomRule = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      pattern,
      permission: newRulePermission,
    };
    await updateSettings({
      permissions: {
        ...perms,
        customRules: [...customRules, rule],
      },
    });
    setNewRulePattern("");
    setNewRulePermission("ask");
  };

  const removeCustomRule = async (ruleId: string) => {
    await updateSettings({
      permissions: {
        ...perms,
        customRules: customRules.filter((r) => r.id !== ruleId),
      },
    });
  };

  const updateCustomRulePermission = async (
    ruleId: string,
    permission: PermissionDecision,
  ) => {
    await updateSettings({
      permissions: {
        ...perms,
        customRules: customRules.map((r) =>
          r.id === ruleId ? { ...r, permission } : r,
        ),
      },
    });
  };

  return (
    <div className="space-y-4">
      {/* Collapsible header — same pattern as Modelos */}
      <div
        className="flex items-center justify-between cursor-pointer group p-4 rounded-xl border border-border hover:bg-muted/50 transition-colors gap-4"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex-1">
          <h3 className="typo-label">Permisos del agente</h3>
          <p className="typo-caption mt-1">
            Controla qué acciones puede ejecutar sin tu aprobación
          </p>
        </div>
        <ChevronRight
          className={cn(
            "size-5 text-muted-foreground/50 group-hover:text-foreground transition-transform duration-200 shrink-0",
            expanded && "rotate-90",
          )}
        />
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="pl-4 space-y-0">
          {TOOLS.map((tool) => (
            <React.Fragment key={tool.toolId}>
              <PermissionRow
                label={tool.label}
                description={tool.description}
                pending={tool.pending}
                control={
                  <PermissionPill
                    value={getToolValue(tool)}
                    onChange={(v) => setToolValue(tool, v)}
                    disabled={tool.pending}
                  />
                }
              />

              {/* Shell sub-rules (nested collapsible) */}
              {tool.toolId === "shell" && (
                <div className="ml-4">
                  <button
                    onClick={() => setBashExpanded(!bashExpanded)}
                    className="flex items-center gap-1.5 px-4 py-2 typo-caption text-muted-foreground hover:text-foreground transition-colors cursor-pointer group"
                  >
                    <ChevronRight
                      className={cn(
                        "size-3.5 transition-transform duration-200",
                        bashExpanded && "rotate-90",
                      )}
                    />
                    Reglas por comando
                  </button>

                  {bashExpanded && (
                    <div className="ml-4 space-y-0 border-l-2 border-border/40 pl-4">
                      {/* Predefined sub-pills */}
                      {SHELL_SUB_PILLS.map((sub) => (
                        <PermissionRow
                          key={sub.subPillKey}
                          label={sub.label}
                          control={
                            <PermissionPill
                              value={getSubPillValue(sub)}
                              onChange={(v) => setSubPillValue(sub, v)}
                            />
                          }
                        />
                      ))}

                      {/* Custom rules */}
                      {customRules.map((rule) => (
                        <div
                          key={rule.id}
                          className="flex justify-between gap-4 p-4 rounded-xl hover:bg-muted/50 transition-colors items-center"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="typo-label font-mono">
                              {rule.pattern}
                            </span>
                            <button
                              onClick={() => removeCustomRule(rule.id)}
                              className="flex-shrink-0 p-1 text-muted-foreground/40 hover:text-destructive transition-colors cursor-pointer rounded-md hover:bg-destructive/10"
                              title="Eliminar regla"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <div className="shrink-0">
                            <PermissionPill
                              value={rule.permission}
                              onChange={(v) =>
                                updateCustomRulePermission(rule.id, v)
                              }
                            />
                          </div>
                        </div>
                      ))}

                      {/* Add custom rule */}
                      <div className="flex items-center gap-3 p-4">
                        <input
                          type="text"
                          value={newRulePattern}
                          onChange={(e) => setNewRulePattern(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") addCustomRule();
                          }}
                          placeholder="docker *, npm publish *..."
                          className="flex-1 min-w-0 px-3 py-1.5 typo-input rounded-lg border border-border bg-background focus:border-primary/50 transition-colors"
                        />
                        <PermissionPill
                          value={newRulePermission}
                          onChange={setNewRulePermission}
                        />
                        <button
                          onClick={addCustomRule}
                          disabled={!newRulePattern.trim()}
                          className={cn(
                            "px-4 py-1.5 typo-select rounded-lg border border-border bg-background text-foreground hover:bg-muted shadow-sm cursor-pointer transition-all duration-200 flex items-center gap-2",
                            !newRulePattern.trim() &&
                              "opacity-30 pointer-events-none",
                          )}
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Añadir
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
