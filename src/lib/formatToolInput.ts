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
 * No switch per toolId — the convention is universal by arg shape.
 */

const SHELL_STYLE = new Set(["shell", "bash", "sh", "exec"]);

export function formatToolInput(toolId: string, args: unknown): string {
  if (args === null || args === undefined) {
    return "(sin argumentos)";
  }

  if (typeof args !== "object") {
    return String(args);
  }

  const a = args as Record<string, unknown>;

  // Shell-style: args.command is the convention.
  if (SHELL_STYLE.has(toolId) && typeof a.command === "string") {
    return `$ ${a.command}`;
  }

  // File-style: args.path is the convention. Include content if present.
  if (typeof a.path === "string") {
    if (typeof a.content === "string") {
      return `${a.path}\n${a.content}`;
    }
    return a.path;
  }

  // Pattern-style: args.pattern is the convention.
  if (typeof a.pattern === "string") {
    return a.pattern;
  }

  // Unknown shape — defensive fallback.
  try {
    return JSON.stringify(args, null, 2);
  } catch {
    return String(args);
  }
}
