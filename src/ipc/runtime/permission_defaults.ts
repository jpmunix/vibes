/**
 * Slice 3.3 — Vibes default permissions.
 *
 * The runtime is policy-agnostic. Vibes owns the policy. These defaults are
 * the LAST resort (the first being the user's custom rules, then sub-pills,
 * then global pills). When the user hasn't configured anything, these
 * defaults apply.
 *
 * Enterprise-friendly defaults: read-only tools are auto-allowed so the
 * test flight doesn't pop up permission banners for every read. Mutating
 * operations ask every time. Web operations ask (privacy + safety).
 *
 * To change the behavior of a single tool, the user can:
 *   1. Set the global pill (permissions.tools[toolId]).
 *   2. Add a sub-pill (only for shell-style tools).
 *   3. Add a custom rule (only for shell-style tools).
 *
 * Custom rules win > sub-pills win > global pill > this default.
 */

export type VibesPermissionDecision = "allow" | "ask" | "deny";

export const VIBES_PERMISSION_DEFAULTS: Record<string, VibesPermissionDecision> = {
  // Read-only family — auto-allowed
  read_file: "allow",
  glob: "allow",
  grep: "allow",

  // File mutations — ask
  write_file: "ask",
  edit_file: "ask",

  // Shell — ask (sub-pills handle specific commands like rm, git push)
  shell: "ask",

  // Web — ask
  webfetch: "ask",
  websearch: "ask",

  // Agent capabilities — ask
  task: "ask",
  skill: "ask",
};
