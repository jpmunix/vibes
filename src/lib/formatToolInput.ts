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

  // File-style: a `path` arg present in the actual call args.
  // (Schema-only check is not enough: git_log declares optional `path` but a
  // call like {max_count: 30} has no path → must not match here.)
  if ("path" in a) {
    const p = safeGet(a, "path");
    if (p) {
      const content = typeof a.content === "string" ? `\n${a.content}` : "";
      return `${p}${content}`;
    }
  }

  // Pattern-style: a `pattern` arg present in the actual call args.
  if ("pattern" in a) {
    const p = safeGet(a, "pattern");
    if (p) return p;
  }

  // Human-readable fallback: one `key: value` per line.
  // Much friendlier than raw JSON for permission pills.
  try {
    const entries = Object.entries(a);
    if (entries.length === 0) return "(sin argumentos)";
    return entries
      .map(([k, v]) => {
        const val = typeof v === "string" ? v : JSON.stringify(v);
        return `${k}: ${val}`;
      })
      .join("\n");
  } catch {
    return String(args);
  }
}
