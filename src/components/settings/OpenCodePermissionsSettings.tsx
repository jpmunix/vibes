import React, { useState } from "react";
import { useSettings } from "@/hooks/useSettings";
import { cn } from "@/lib/utils";
import type { OpenCodePermission, BashCustomRule } from "@/lib/schemas";
import { ChevronRight, Plus, X } from "@/components/ui/icons";

// ── Tool definitions (no icons — follow existing pattern) ──
interface ToolDef {
  key: string;
  settingsKey: keyof NonNullable<import("@/lib/schemas").OpenCodePermissionsConfig>;
  label: string;
  description: string;
  defaultValue: OpenCodePermission;
}

const TOOLS: ToolDef[] = [
  { key: "edit", settingsKey: "edit", label: "Editar archivos", description: "Crear, modificar y borrar archivos del proyecto", defaultValue: "ask" },
  { key: "bash", settingsKey: "bash", label: "Terminal (bash)", description: "Ejecutar comandos en la terminal", defaultValue: "allow" },
  { key: "webfetch", settingsKey: "webfetch", label: "Acceso web", description: "Acceder a URLs externas", defaultValue: "ask" },
  { key: "websearch", settingsKey: "websearch", label: "Búsqueda web", description: "Buscar información en internet", defaultValue: "ask" },
  { key: "lsp", settingsKey: "lsp", label: "Diagnósticos LSP", description: "Verificación de tipos por archivo", defaultValue: "allow" },
];

// ── Bash sub-rules ──
interface BashSubRule {
  settingsKey: "bashGitCommit" | "bashGitPush" | "bashRm";
  label: string;
  defaultValue: OpenCodePermission;
}

const BASH_SUB_RULES: BashSubRule[] = [
  { settingsKey: "bashGitCommit", label: "git commit", defaultValue: "deny" },
  { settingsKey: "bashGitPush", label: "git push", defaultValue: "deny" },
  { settingsKey: "bashRm", label: "rm (borrar)", defaultValue: "ask" },
];

const PERMISSION_OPTIONS: { value: OpenCodePermission; label: string }[] = [
  { value: "allow", label: "Siempre" },
  { value: "ask", label: "Preguntar" },
  { value: "deny", label: "Nunca" },
];

// ── Tri-state pill following the existing design tokens ──
function PermissionPill({
  value,
  onChange,
}: {
  value: OpenCodePermission;
  onChange: (v: OpenCodePermission) => void;
}) {
  return (
    <div className="relative bg-muted/50 rounded-xl p-1 flex w-fit border border-border">
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

// ── Reusable SettingRow matching AIBehaviorSettings.SettingRow ──
function PermissionRow({
  label,
  description,
  control,
}: {
  label: string;
  description?: string;
  control: React.ReactNode;
}) {
  return (
    <div className="flex justify-between gap-8 p-4 rounded-xl hover:bg-muted/50 transition-colors items-center">
      <div className="flex-1 min-w-0">
        <h3 className="typo-label">{label}</h3>
        {description && (
          <p className="typo-caption mt-1 leading-relaxed">{description}</p>
        )}
      </div>
      <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
        {control}
      </div>
    </div>
  );
}

// ── Main component (collapsible, following Modelos pattern) ──
export function OpenCodePermissionsSettings() {
  const { settings, updateSettings } = useSettings();
  const perms = settings?.openCodePermissions2;

  const [expanded, setExpanded] = useState(false);
  const [bashExpanded, setBashExpanded] = useState(false);
  const [newRulePattern, setNewRulePattern] = useState("");
  const [newRulePermission, setNewRulePermission] = useState<OpenCodePermission>("ask");

  const getToolValue = (tool: ToolDef): OpenCodePermission => {
    if (!perms) return tool.defaultValue;
    return (perms[tool.settingsKey] as OpenCodePermission | undefined) ?? tool.defaultValue;
  };

  const setToolValue = async (tool: ToolDef, value: OpenCodePermission) => {
    await updateSettings({
      openCodePermissions2: {
        ...perms,
        [tool.settingsKey]: value,
      },
    });
  };

  const getBashSubValue = (rule: BashSubRule): OpenCodePermission => {
    if (!perms) return rule.defaultValue;
    return (perms[rule.settingsKey] as OpenCodePermission | undefined) ?? rule.defaultValue;
  };

  const setBashSubValue = async (rule: BashSubRule, value: OpenCodePermission) => {
    await updateSettings({
      openCodePermissions2: {
        ...perms,
        [rule.settingsKey]: value,
      },
    });
  };

  const customRules: BashCustomRule[] = perms?.bashCustomRules ?? [];

  const addCustomRule = async () => {
    const pattern = newRulePattern.trim();
    if (!pattern) return;
    const rule: BashCustomRule = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      pattern,
      permission: newRulePermission,
    };
    await updateSettings({
      openCodePermissions2: {
        ...perms,
        bashCustomRules: [...customRules, rule],
      },
    });
    setNewRulePattern("");
    setNewRulePermission("ask");
  };

  const removeCustomRule = async (ruleId: string) => {
    await updateSettings({
      openCodePermissions2: {
        ...perms,
        bashCustomRules: customRules.filter((r) => r.id !== ruleId),
      },
    });
  };

  const updateCustomRulePermission = async (ruleId: string, permission: OpenCodePermission) => {
    await updateSettings({
      openCodePermissions2: {
        ...perms,
        bashCustomRules: customRules.map((r) =>
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
            <React.Fragment key={tool.key}>
              <PermissionRow
                label={tool.label}
                description={tool.description}
                control={
                  <PermissionPill
                    value={getToolValue(tool)}
                    onChange={(v) => setToolValue(tool, v)}
                  />
                }
              />

              {/* Bash sub-rules (nested collapsible) */}
              {tool.key === "bash" && (
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
                      {/* Predefined sub-rules */}
                      {BASH_SUB_RULES.map((rule) => (
                        <PermissionRow
                          key={rule.settingsKey}
                          label={rule.label}
                          control={
                            <PermissionPill
                              value={getBashSubValue(rule)}
                              onChange={(v) => setBashSubValue(rule, v)}
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
                            <span className="typo-label font-mono">{rule.pattern}</span>
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
                              onChange={(v) => updateCustomRulePermission(rule.id, v)}
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
                            !newRulePattern.trim() && "opacity-30 pointer-events-none",
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
