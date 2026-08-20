/**
 * Slice 3.5 — UI-side formatter for permission banner payloads.
 *
 * The runtime sends the renderer a structured `toolInput: unknown` (the raw
 * args object). The renderer is the only component that knows how to show
 * this to a user. This function applies a simple convention:
 *
 *   - shell-style tools (shell, bash, sh, exec) → "$ {command}"
 *   - file-style tools (read_file, write_file, edit_file) → "{path}" + content
 *   - pattern-style tools (glob, grep) → "{pattern}"
 *   - fallback → JSON.stringify with indent (defensive)
 *
 * The conventions are derived from the runtime catalog's `argSchema`
 * (`getToolMetadata(toolId).argSchema`), so a tool gets the right presentation
 * as soon as it declares its args — no per-toolId switch needed.
 */

import { getToolMetadata } from "@vibes/tools/catalog";

// Shell-style legacy aliases (bash/sh/exec) — the runtime uses "shell" today.
const SHELL_STYLE = new Set(["shell", "bash", "sh", "exec"]);

function safeGet(a: Record<string, unknown>, key: string): string | undefined {
  const v = a[key];
  return typeof v === "string" ? v : undefined;
}

export function formatToolInput(toolId: string, args: unknown): string {
  if (args === null || args === undefined) {
    return "(sin argumentos)";
  }

  if (typeof args !== "object") {
    return String(args);
  }

  const a = args as Record<string, unknown>;

  // Empty object — a tool call with no arguments (legit for tools like
  // git_diff where every arg is optional, and what the pill receives when the
  // runtime sends args={}). Show "(sin argumentos)" instead of "{}".
  if (Object.keys(a).length === 0) {
    return "(sin argumentos)";
  }

  const meta = getToolMetadata(toolId);
  const schemaProps = meta?.argSchema?.properties ?? {};

  // Shell-style: a `cmd` / `args` shape (vibes-core shell tool).
  const isShellLike = "cmd" in schemaProps || "command" in a || SHELL_STYLE.has(toolId);
  if (isShellLike && (typeof a.cmd === "string" || typeof a.command === "string")) {
    const cmd = typeof a.cmd === "string" ? a.cmd : (a.command as string);
    const rest = Array.isArray(a.args) && a.args.length > 0 ? " " + a.args.join(" ") : "";
    return `$ ${cmd}${rest}`;
  }

  // File-style: a `path` arg (read_file, write_file, edit_file, list_dir…).
  if ("path" in schemaProps || "path" in a) {
    const p = safeGet(a, "path");
    if (p) {
      const content = typeof a.content === "string" ? `\n${a.content}` : "";
      return `${p}${content}`;
    }
  }

  // Pattern-style: a `pattern` arg (glob, grep).
  if ("pattern" in schemaProps || "pattern" in a) {
    const p = safeGet(a, "pattern");
    if (p) return p;
  }

  // Unknown shape — defensive fallback.
  try {
    return JSON.stringify(args, null, 2);
  } catch {
    return String(args);
  }
}
