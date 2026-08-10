/**
 * Slice 3.3 — permission resolver.
 *
 * Pure function that implements the cascade of priority for deciding what
 * to do when a tool call comes in:
 *
 *   1. custom rule matching the command prefix → decision from rule
 *   2. shell sub-pill (rm, gitReset, gitPush...) → decision from sub-pill
 *   3. global pill for the tool (permissions.tools[toolId]) → decision from pill
 *   4. default Vibes (read_* → allow, mutación → ask, web → ask) → decision from default
 *   5. unknown tool → "ask" (fail-closed)
 *
 * The runtime is policy-agnostic. This is the policy.
 */

import { VIBES_PERMISSION_DEFAULTS } from "./permission_defaults";
import type { PermissionsConfig } from "../../lib/schemas";

export type PermissionSource =
  | "custom-rule"
  | "sub-pill"
  | "pill"
  | "default";

export type ResolveResult =
  | { decision: "allow" | "deny"; source: PermissionSource }
  | { decision: "ask"; source: PermissionSource };

export type ResolveInput = {
  toolId: string;
  args: unknown;
  settings: PermissionsConfig | undefined;
};

// ── shell sub-pill detection ──────────────────────────────────────────────
//
// Matches the prefix of the command (case-insensitive). Returns the sub-pill
// key when the command matches a known category. Mirrors the schema in
// PermissionsConfig.shellSubPills.

const SUB_PILLS = [
  { key: "rm", test: (c: string) => /^rm(\s|$)/.test(c) },
  { key: "gitReset", test: (c: string) => /^git\s+reset(\s|$)/.test(c) },
  { key: "gitPushForce", test: (c: string) => /^git\s+push(\s|$)/.test(c) && /(--force|-f\b)/.test(c) },
  { key: "gitPushDelete", test: (c: string) => /^git\s+push(\s|$)/.test(c) && /--delete/.test(c) },
  { key: "gitPush", test: (c: string) => /^git\s+push(\s|$)/.test(c) },
] as const;

type SubPillKey = (typeof SUB_PILLS)[number]["key"];

function detectSubPill(command: string): SubPillKey | null {
  const c = command.trim().toLowerCase();
  for (const pill of SUB_PILLS) {
    if (pill.test(c)) return pill.key;
  }
  return null;
}

// ── custom rule matching ──────────────────────────────────────────────────
//
// Prefix-match. `pattern: "ls"` matches "ls -la /tmp". No regex, no globs.

function matchCustomRule(
  command: string,
  rules: { pattern: string; permission: "allow" | "ask" | "deny" }[],
): { decision: "allow" | "ask" | "deny" } | null {
  const c = command.trim();
  for (const rule of rules) {
    if (c.startsWith(rule.pattern)) {
      return { decision: rule.permission };
    }
  }
  return null;
}

// ── arg extractor for shell-style tools ──────────────────────────────────

function getCommandString(args: unknown): string | null {
  if (!args || typeof args !== "object") return null;
  const a = args as Record<string, unknown>;
  // vibes-core shell tool uses args.cmd; legacy OpenCode used args.command.
  if (typeof a.cmd === "string") return a.cmd;
  if (typeof a.command === "string") return a.command;
  return null;
}

// ── main resolver ─────────────────────────────────────────────────────────

export function permissionResolver(input: ResolveInput): ResolveResult {
  const { toolId, args, settings } = input;

  // 1. Custom rule matching — only for shell-style tools with a command arg.
  const subPills = settings?.shellSubPills;
  const customRules = settings?.customRules;
  const command = toolId === "shell" || toolId === "bash" || toolId === "sh" || toolId === "exec"
    ? getCommandString(args)
    : null;

  if (command && customRules && customRules.length > 0) {
    const match = matchCustomRule(command, customRules);
    if (match) {
      return match.decision === "ask"
        ? { decision: "ask", source: "custom-rule" }
        : { decision: match.decision, source: "custom-rule" };
    }
  }

  // 2. Shell sub-pill — only for shell-style tools with a command arg.
  if (command && subPills) {
    const subKey = detectSubPill(command);
    if (subKey && subKey in subPills) {
      const subDecision = subPills[subKey as keyof typeof subPills];
      if (subDecision) {
        return subDecision === "ask"
          ? { decision: "ask", source: "sub-pill" }
          : { decision: subDecision, source: "sub-pill" };
      }
    }
  }

  // 3. Global pill for the tool.
  const tools = settings?.tools;
  if (tools && toolId in tools) {
    const pill = tools[toolId as keyof typeof tools];
    if (pill) {
      return pill === "ask"
        ? { decision: "ask", source: "pill" }
        : { decision: pill, source: "pill" };
    }
  }

  // 4. Default Vibes.
  const defaultDecision = VIBES_PERMISSION_DEFAULTS[toolId];
  if (defaultDecision) {
    return defaultDecision === "ask"
      ? { decision: "ask", source: "default" }
      : { decision: defaultDecision, source: "default" };
  }

  // 5. Unknown tool — fail-closed.
  return { decision: "ask", source: "default" };
}
