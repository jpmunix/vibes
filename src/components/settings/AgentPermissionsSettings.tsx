import React, { useState } from "react";
import { useSettings } from "@/hooks/useSettings";
import { cn } from "@/lib/utils";
import type {
  PermissionDecision,
  PermissionsConfig,
  PermissionCustomRule,
} from "@/lib/schemas";
import { ChevronRight, Plus, X } from "@/components/ui/icons";
import { TOOL_CATALOG_LIST } from "@vibes/tools/catalog";
import { toolLabel, toolDescription, useI18n } from "@/lib/i18n";
import type { Language } from "@/lib/i18n";
import {
  VIBES_PERMISSION_DEFAULTS,
  LOCKED_TOOLS,
} from "@/ipc/runtime/permission_defaults";

// ── Tool rows generated from the runtime catalog (source of truth) ──
// Each row is derived from the catalog (id, riskLevel, argSchema) + the
// shell's i18n dictionary for human labels/descriptions (P1: the runtime
// carries no localized strings). No hardcoded list, no `pending` flag.
//
// Locked tools (question, todowrite) are filtered out — they are always
// allowed and must never appear in the permission settings UI.

interface ToolRow {
  toolId: string;
  label: string;
  description: string;
  defaultValue: PermissionDecision;
}

/**
 * Build the permission rows from the runtime catalog + the i18n dictionary.
 * Exported as a pure function so it can be unit-tested without rendering.
 *
 * Defaults come from VIBES_PERMISSION_DEFAULTS (the actual policy), not from
 * a separate riskLevel mapping. Locked tools are excluded entirely.
 */
export function buildToolList(language: Language = "es"): ToolRow[] {
  return TOOL_CATALOG_LIST
    .filter((def) => !LOCKED_TOOLS.has(def.id))
    .map((def) => {
      return {
        toolId: def.id,
        label: toolLabel(def.id, language),
        description: toolDescription(def.id, language),
        defaultValue:
          VIBES_PERMISSION_DEFAULTS[def.id] ?? "ask",
      };
    });
}

// ── Shell sub-pills — granular rules for shell commands ──
// Mirrors PermissionsConfig.shellSubPills in the schema.
interface SubPillDef {
  subPillKey: keyof NonNullable<PermissionsConfig["shellSubPills"]>;
  label: string;
  defaultValue: PermissionDecision;
}

const SHELL_SUB_PILLS: SubPillDef[] = [
  { subPillKey: "rm", label: "rm", defaultValue: "ask" },
  { subPillKey: "gitReset", label: "git reset", defaultValue: "ask" },
  { subPillKey: "gitPush", label: "git push", defaultValue: "ask" },
  { subPillKey: "gitPushForce", label: "git push --force", defaultValue: "deny" },
  { subPillKey: "gitPushDelete", label: "git push --delete", defaultValue: "deny" },
];

const getPermissionOptions = (
  t: (k: string) => string,
): { value: PermissionDecision; label: string }[] => [
  { value: "allow", label: t("permissions.always") },
  { value: "ask", label: t("permissions.ask") },
  { value: "deny", label: t("permissions.never") },
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
  const { t } = useI18n();
  return (
    <div
      className={cn(
        "relative bg-muted/50 rounded-xl p-1 flex w-fit border border-border",
        disabled && "opacity-40 pointer-events-none select-none",
      )}
    >
      {getPermissionOptions(t).map((opt) => (
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
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="typo-label">{label}</h3>
        </div>
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
export function AgentPermissionsSettings() {
  const { t } = useI18n();
  const { settings, updateSettings } = useSettings();
  // ACTIVE policy — read from settings.permissions (Slice 3.2 schema).
  const perms: PermissionsConfig | undefined = settings?.permissions;

  const [expanded, setExpanded] = useState(false);
  const [bashExpanded, setBashExpanded] = useState(false);
  const [newRulePattern, setNewRulePattern] = useState("");
  const [newRulePermission, setNewRulePermission] =
    useState<PermissionDecision>("ask");

  // ── tools ──
  const language: Language = (settings?.chatLanguage as Language) ?? "es";
  const toolList = React.useMemo(() => buildToolList(language), [language]);

  const getToolValue = (tool: ToolRow): PermissionDecision => {
    const v = perms?.tools?.[tool.toolId];
    return v ?? tool.defaultValue;
  };

  const setToolValue = async (tool: ToolRow, value: PermissionDecision) => {
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
          <h3 className="typo-label">{t("permissions.title")}</h3>
          <p className="typo-caption mt-1">
            {t("permissions.desc")}
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
          {toolList.map((tool) => (
            <React.Fragment key={tool.toolId}>
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
                    {t("permissions.shellRules")}
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
                              title={t("permissions.deleteRule")}
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
                          placeholder={t("permissions.patternPlaceholder")}
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
                          {t("permissions.add")}
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
