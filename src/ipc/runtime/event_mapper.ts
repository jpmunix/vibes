/**
 * B4: Event mapper — translates vibes-core RuntimeEvents into Vibes' visual
 * language (`<vibes-*>` tags). This is the "flavor" layer: the runtime is
 * provider/UI-agnostic (P1 boundary) and knows nothing about these tags;
 * Vibes' event mapper is the single place that decides which tag each event
 * becomes.
 *
 * Ported from opencode_adapter.ts (mapToolToVibesTag, buildVibesTag,
 * buildLiveContent, cleanResponseText) — do NOT reinvent, keep parity with
 * the OpenCode rendering so the UI shows identical tool cards after the swap.
 */

import type { RuntimeEvent } from "@vibes/shared";
import { resolveRuntimeToolTag } from "@/lib/tools/toolPresentation";
import { escapeXmlContent } from "../../../shared/xmlEscape";

// ============================================================================
// Tool → vibes tag
// ============================================================================

/**
 * Maps a vibes-core built-in tool id to its Vibes tag. #168: la tabla vive en
 * la fuente única (@/lib/tools/toolPresentation), compartida con el renderer,
 * y cubre TODAS las tools del catálogo — ninguna built-in cae ya en el
 * fallback genérico `vibes-mcp-tool-call`, que queda reservado para tools
 * realmente desconocidas (MCP u otras fuentes).
 */
export function mapRuntimeToolToVibesTag(toolId: string): string {
  return resolveRuntimeToolTag(toolId) ?? "vibes-mcp-tool-call";
}

/** Escape XML/HTML attribute values. */
export function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Extracts a human-readable "detail" (path / cmd / query) from tool args for
 * the tag attribute. Falls back to the first string value if the expected key
 * is missing.
 */
export function extractToolDetail(toolId: string, args: unknown): string {
  const a = (args ?? {}) as Record<string, unknown>;
  const pick = (...keys: string[]): string => {
    for (const k of keys) {
      const v = a[k];
      if (typeof v === "string" && v.length > 0) return v;
    }
    return "";
  };
  switch (toolId) {
    case "write_file":
    case "edit_file":
    case "read_file":
      return pick("path", "file", "filePath");
    case "shell": {
      const cmd = pick("cmd", "command");
      const extra = Array.isArray(a.args) ? (a.args as unknown[]).join(" ") : "";
      return extra ? `${cmd} ${extra}` : cmd;
    }
    case "glob":
      return pick("pattern", "cwd");
    case "grep":
      return pick("query", "pattern");
    default:
      return pick("path", "cmd", "query", "url");
  }
}

// ============================================================================
// Tool result → texto legible (#168)
// ============================================================================

/** Renderiza hunks FileDiff como líneas unificadas (+/−/contexto). */
function renderDiffLines(
  hunks: Array<{ startLine: number; lines: string[] }>,
): string {
  const out: string[] = [];
  for (const h of hunks) {
    out.push(`@@ -${h.startLine} @@`);
    for (const line of h.lines) out.push(line);
  }
  return out.join("\n");
}

/** Bytes → tamaño legible (1.2 KB / 3.4 MB). */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Formatters de output por tool: convierten el resultado estructurado del
 * runtime en texto legible para el contenido del tag (el modal lo pinta tal
 * cual). Los shapes siguen los tipos de los built-ins de @vibes/tools.
 */
const TOOL_RESULT_FORMATTERS: Record<
  string,
  (result: unknown, cmd?: string) => string
> = {
  read_file: (r) => {
    const res = r as { content?: string };
    return typeof res.content === "string" ? res.content : "";
  },
  write_file: (r) => {
    const res = r as {
      existed?: boolean;
      diff?: { additions: number; deletions: number; hunks: Array<{ startLine: number; lines: string[] }> };
    };
    if (!res?.diff?.hunks?.length) return "(sin cambios)";
    const header = `${res.existed === false ? "creado" : "actualizado"} · +${res.diff.additions} −${res.diff.deletions}`;
    return `${header}\n\n${renderDiffLines(res.diff.hunks)}`;
  },
  edit_file: (r) => {
    const res = r as {
      diff?: { additions: number; deletions: number; hunks: Array<{ startLine: number; lines: string[] }> };
    };
    if (!res?.diff?.hunks?.length) return "(sin cambios)";
    const header = `editado · +${res.diff.additions} −${res.diff.deletions}`;
    return `${header}\n\n${renderDiffLines(res.diff.hunks)}`;
  },
  patch: (r) => {
    const res = r as {
      files?: Array<{
        path: string;
        operation: "add" | "update" | "delete";
        diff: { hunks: Array<{ startLine: number; lines: string[] }> };
      }>;
      additions?: number;
      deletions?: number;
    };
    if (!res?.files?.length) return "(sin cambios)";
    const ops = { add: "creado", update: "actualizado", delete: "eliminado" } as const;
    const summary = res.files
      .map((f) => `${ops[f.operation] ?? f.operation}: ${f.path}`)
      .join("\n");
    const diffs = res.files
      .filter((f) => f.diff?.hunks?.length)
      .map((f) => `--- ${f.path}\n${renderDiffLines(f.diff.hunks)}`)
      .join("\n\n");
    const header = `patch · ${res.files.length} fichero(s) · +${res.additions ?? 0} −${res.deletions ?? 0}`;
    return [header, "", summary, diffs].filter(Boolean).join("\n");
  },
  glob: (r) => {
    const res = r as { files?: string[] };
    if (!Array.isArray(res.files)) return "";
    if (res.files.length === 0) return "(sin resultados)";
    return res.files.join("\n");
  },
  grep: (r) => {
    const res = r as {
      matches?: Array<{ path: string; line: number; column: number; text: string }>;
    };
    if (!Array.isArray(res.matches)) return "";
    if (res.matches.length === 0) return "(sin resultados)";
    return res.matches
      .map((m) => `${m.path}:${m.line}:${m.column}: ${m.text}`)
      .join("\n");
  },
  list_dir: (r) => {
    const res = r as {
      entries?: Array<{ name: string; type: string; size?: number }>;
    };
    if (!Array.isArray(res.entries)) return "";
    if (res.entries.length === 0) return "(directorio vacío)";
    const ICON: Record<string, string> = {
      directory: "📁",
      file: "📄",
      "symbolic-link": "🔗",
    };
    return res.entries
      .map((e) => {
        const icon = ICON[e.type] ?? "📄";
        const slash = e.type === "directory" ? "/" : "";
        const size = typeof e.size === "number" ? ` (${formatSize(e.size)})` : "";
        return `${icon} ${e.name}${slash}${size}`;
      })
      .join("\n");
  },
  git_log: (r) => {
    const res = r as {
      commits?: Array<{ sha: string; author: string; isoDate: string; subject: string }>;
      truncated?: boolean;
    };
    if (!Array.isArray(res.commits)) return "";
    if (res.commits.length === 0) return "(sin commits)";
    const lines = res.commits.map(
      (c) => `${c.sha.slice(0, 7)} ${c.isoDate.slice(0, 10)} ${c.author} — ${c.subject}`,
    );
    if (res.truncated) lines.push("… (truncado)");
    return lines.join("\n");
  },
  git_diff: (r) => {
    const res = r as {
      diff?: string;
      additions?: number;
      deletions?: number;
      truncated?: boolean;
      warning?: string;
    };
    if (typeof res.diff !== "string") return "(sin cambios)";
    let out = `+${res.additions ?? 0} −${res.deletions ?? 0}`;
    if (res.truncated) out += " (truncado)";
    if (res.warning) out += `\n⚠️ ${res.warning}`;
    return `${out}\n\n${res.diff}`;
  },
  shell: (r, cmd) => {
    const res = r as {
      exitCode?: number;
      stdout?: string;
      stderr?: string;
      timedOut?: boolean;
    };
    const parts: string[] = [];
    const stripEcho = (text: string) => {
      if (!cmd) return text;
      // El core a veces antepone el comando al output (eco). El header del
      // badge ya lo muestra; lo quitamos para no duplicarlo.
      const lines = text.split("\n");
      const first = lines[0]?.trim();
      if (first && first.startsWith(cmd.trim())) return lines.slice(1).join("\n");
      return text;
    };
    if (typeof res.stdout === "string") {
      const cleaned = stripEcho(res.stdout).trimEnd();
      if (cleaned) parts.push(cleaned);
    }
    if (typeof res.stderr === "string" && res.stderr.trim())
      parts.push(`[stderr]\n${res.stderr.trimEnd()}`);
    if (res.timedOut) parts.push("[timeout]");
    if (!parts.length && typeof res.exitCode === "number" && res.exitCode !== 0)
      parts.push(`(exit code ${res.exitCode})`);
    return parts.join("\n") || "(exit code 0, sin salida)";
  },
  question: (r) => {
    const res = r as { answers?: Array<string | string[]> };
    if (!Array.isArray(res.answers)) return "";
    return (
      res.answers
        .map((a) => (Array.isArray(a) ? a.join(", ") : a))
        .filter(Boolean)
        .join("\n") || "(sin respuesta)"
    );
  },
  todowrite: (r) => {
    const res = r as { todos?: Array<{ content: string; status: string }> };
    if (!Array.isArray(res.todos)) return "";
    const MARK: Record<string, string> = {
      pending: "○",
      in_progress: "◐",
      completed: "●",
      cancelled: "✗",
    };
    return res.todos.map((t) => `${MARK[t.status] ?? "○"} ${t.content}`).join("\n");
  },
};

/**
 * Extracts a compact textual body from a tool result for the tag content.
 * #168: usa el formatter de la tool si existe (texto legible); JSON crudo
 * truncado solo como fallback defensivo.
 *
 * El runtime a veces entrega `output` como string JSON (`'{"exitCode":0,...}'`)
 * en vez de objeto (p.ej. vía wrappers del modelo). Para esas tools con
 * formatter, intentamos parsear el string y aplicarle el formatter; el
 * verbatim solo aplica a strings planos o a tools sin formatter.
 */
export function extractToolContent(toolId: string, result: unknown): string {
  if (!result) return "";
  if (typeof toolId === "string" && TOOL_RESULT_FORMATTERS[toolId]) {
    let target: unknown = result;
    if (typeof result === "string" && looksLikeJson(result)) {
      try {
        target = JSON.parse(result);
      } catch {
        target = result;
      }
    }
    if (typeof target !== "string") {
      try {
        const formatted = TOOL_RESULT_FORMATTERS[toolId](target);
        if (typeof formatted === "string") return formatted;
      } catch {
        // Un formatter nunca debe romper el stream: cae al fallback JSON.
      }
    }
  }
  if (typeof result === "string") return result;
  try {
    const json = JSON.stringify(result);
    return json.length > 400 ? json.slice(0, 400) + "…" : json;
  } catch {
    return "";
  }
}

/** True si el string parece un JSON de objeto/array (no texto plano). */
function looksLikeJson(s: string): boolean {
  const trimmed = s.trimStart();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

/**
 * Reformatea el content de un tag de tool persistido (mensajes viejos):
 * si `content` es un string JSON y la tool tiene formatter, lo convierte al
 * mismo texto legible que produce el mapper hoy. Si no, lo devuelve tal cual.
 * Se usa en render time para que los mensajes históricos (con JSON crudo) se
 * vean igual que los nuevos.
 */
export function reformatToolResultContent(
  toolId: string,
  content: string,
  cmd?: string,
): string {
  if (!content) return content;
  if (typeof toolId !== "string" || !TOOL_RESULT_FORMATTERS[toolId]) {
    return content;
  }
  if (!looksLikeJson(content)) return content;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return content;
  }
  if (typeof parsed !== "object" || parsed === null) return content;
  try {
    const formatted = TOOL_RESULT_FORMATTERS[toolId](parsed, cmd);
    return typeof formatted === "string" ? formatted : content;
  } catch {
    return content;
  }
}

/** Builds a `<vibes-*>` tag for a finished tool call. */
export function buildVibesToolTag(
  toolId: string,
  detail: string,
  content: string,
  durationMs?: number,
): string {
  const vibesTag = mapRuntimeToolToVibesTag(toolId);
  // duration-ms solo viaja como atributo si lo conocemos; los mensajes
  // históricos (sin atributo) renderizan sin la parte temporal.
  const durAttr =
    durationMs !== undefined ? ` duration-ms="${Math.max(0, Math.round(durationMs))}"` : "";
  switch (vibesTag) {
    case "vibes-write":
      return `<vibes-write path="${escapeAttr(detail)}" description=""${durAttr}>${content}</vibes-write>`;
    case "vibes-search-replace":
      return `<vibes-search-replace path="${escapeAttr(detail)}" description=""${durAttr}>${content}</vibes-search-replace>`;
    case "vibes-read":
      return `<vibes-read path="${escapeAttr(detail)}"${durAttr}>${content}</vibes-read>`;
    case "vibes-grep":
      return `<vibes-grep query="${escapeAttr(detail)}"${durAttr}>${content}</vibes-grep>`;
    case "vibes-run-command":
      return `<vibes-run-command cmd="${escapeAttr(detail)}"${durAttr}>${content}</vibes-run-command>`;
    case "vibes-list-files":
      return `<vibes-list-files directory="${escapeAttr(detail)}"${durAttr}>${content}</vibes-list-files>`;
    case "vibes-git":
      // git_log/git_diff comparten el tag de git; el toolId va en operation.
      return `<vibes-git operation="${escapeAttr(toolId === "git_log" ? "log" : "diff")}"${durAttr}>${content}</vibes-git>`;
    case "vibes-patch":
      return `<vibes-patch path="${escapeAttr(detail)}" description=""${durAttr}>${content}</vibes-patch>`;
    case "vibes-question":
      return `<vibes-question${durAttr}>${content}</vibes-question>`;
    case "vibes-todo":
      return `<vibes-todo${durAttr}>${content}</vibes-todo>`;
    case "vibes-mcp-tool-call":
    default:
      return `<vibes-mcp-tool-call tool="${escapeAttr(toolId)}"${durAttr}>${content}</vibes-mcp-tool-call>`;
  }
}

// ============================================================================
// Timeline accumulation (chronological: text deltas + tool cards)
// ============================================================================

export type VibesTimelineEntry =
  | { type: "text"; text: string }
  | { type: "tool"; tool: string; detail: string; error: boolean; output: string; durationMs?: number }
  | { type: "reasoning"; text: string; closed: boolean; durationMs?: number };

/**
 * Accumulator that mirrors the adapter's chronological timeline. Feed it
 * RuntimeEvents via `handle()` and read the rendered content with
 * `buildLiveContent()`.
 */
export class VibesEventMapper {
  private timeline: VibesTimelineEntry[] = [];
  /** toolCallId → args snapshot for rendering finished tools. */
  private toolArgs = new Map<string, { toolId: string; detail: string }>();
  /** Track files read for turn context summary. */
  private filesRead = new Set<string>();
  /** Track directories listed for turn context summary. */
  private dirsListed = new Set<string>();
  /** Track files written/edited for the closing `<vibes-files-changed>` tag. */
  private filesChanged = new Set<string>();
  private diffStats = { insertions: 0, deletions: 0 };
  /** BUGFIX #122: último error de sesión (de session.failed), para el bridge. */
  private failedError: string | null = null;
  /** Callback for todo.updated events — bridge provides chatId context. */
  private onTodoUpdated?: (todos: import("@vibes/shared").Todo[]) => void;

  constructor(options?: {
    onTodoUpdated?: (todos: import("@vibes/shared").Todo[]) => void;
  }) {
    this.onTodoUpdated = options?.onTodoUpdated;
  }

  handle(event: RuntimeEvent): void {
    switch (event.type) {
      case "session.failed": {
        this.failedError = event.error?.message ?? "Error desconocido del agente.";
        break;
      }
      case "todo.updated": {
        if (this.onTodoUpdated) {
          this.onTodoUpdated(event.todos);
        }
        break;
      }
      case "llm.delta": {
        const last = this.timeline[this.timeline.length - 1];
        if (last && last.type === "text") {
          last.text += event.text;
        } else {
          this.timeline.push({ type: "text", text: event.text });
        }
        break;
      }
      // 172: razonamiento nativo (delta.reasoning_content del provider). Se
      // traduce a un tag <vibes-think> para reutilizar el render existente de
      // la UI (LiveThinkingPanel en vivo, badge compacto al cerrar). Abierto
      // durante el streaming → inProgress → panel activo; cerrado → badge.
      case "llm.reasoning_start": {
        this.timeline.push({ type: "reasoning", text: "", closed: false });
        break;
      }
      case "llm.reasoning_delta": {
        const last = this.timeline[this.timeline.length - 1];
        if (last && last.type === "reasoning") {
          last.text += event.text;
        } else {
          // Defensivo: un delta sin start previo (no debería pasar).
          this.timeline.push({ type: "reasoning", text: event.text, closed: false });
        }
        break;
      }
      case "llm.reasoning_end": {
        const last = this.timeline[this.timeline.length - 1];
        if (last && last.type === "reasoning") {
          last.closed = true;
          if (event.durationMs !== undefined) {
            last.durationMs = event.durationMs;
          }
        }
        break;
      }
      case "tool.started": {
        const detail = extractToolDetail(event.toolId, event.args);
        this.toolArgs.set(event.toolCallId, { toolId: event.toolId, detail });
        break;
      }
      case "tool.finished": {
        const started = this.toolArgs.get(event.toolCallId);
        const toolId = started?.toolId ?? event.toolId;
        const detail = started?.detail ?? "";
        const ok = event.result.ok;
        const output = ok
          ? extractToolContent(toolId, event.result.output)
          : event.result.error?.message ?? "[error]";
        this.timeline.push({
          type: "tool",
          tool: toolId,
          detail,
          error: !ok,
          output,
          ...(event.durationMs !== undefined ? { durationMs: event.durationMs } : {}),
        });
        // Track files/directories for summary memory between turns.
        if (ok && detail) {
          if (toolId === "write_file" || toolId === "edit_file" || toolId === "patch") {
            this.filesChanged.add(detail);
          } else if (toolId === "read_file") {
            this.filesRead.add(detail);
          } else if (toolId === "list_dir" || toolId === "glob") {
            this.dirsListed.add(detail);
          }
        }
        break;
      }
      default:
        break;
    }
  }

  getTimeline(): VibesTimelineEntry[] {
    return this.timeline;
  }

  /**
   * #238: cierra todos los entries de reasoning que sigan abiertos.
   * Se llama tras terminar el stream (antes de buildLiveContent final) para
   * evitar que queden tags <vibes-think> abiertos en el fullResponse persistido.
   * Durante el streaming NO se llama: el tag abierto es intencional (el parser
   * lo marca inProgress y renderiza el LiveThinkingPanel activo).
   */
  closePendingReasoning(): void {
    for (const entry of this.timeline) {
      if (entry.type === "reasoning" && !entry.closed) {
        entry.closed = true;
      }
    }
  }

  getFilesChanged(): string[] {
    return Array.from(this.filesChanged);
  }

  getFilesRead(): string[] {
    return Array.from(this.filesRead);
  }

  getDirsListed(): string[] {
    return Array.from(this.dirsListed);
  }

  /**
   * Renders the accumulated timeline into the content string for the
   * assistant bubble. Text entries are cleaned; tool entries become tags.
   */
  buildLiveContent(): string {
    let content = "";
    for (const entry of this.timeline) {
      if (entry.type === "tool") {
        const body = entry.error ? "[error]" : entry.output;
        content += buildVibesToolTag(entry.tool, entry.detail, body, entry.durationMs) + "\n";
      } else if (entry.type === "reasoning") {
        // 172: razonamiento nativo → <vibes-think>. Si sigue abierto
        // (streaming) emitimos solo el opening tag: el parser lo marca
        // inProgress y lo renderiza como LiveThinkingPanel activo. Si ya se
        // cerró, emitimos el tag completo (badge compacto al terminar).
        // duration-ms viaja solo si el runtime lo reportó (mensajes
        // históricos o reasoning sin ts → sin atributo).
        const body = escapeXmlContent(entry.text);
        const durAttr =
          entry.closed && entry.durationMs !== undefined
            ? ` duration-ms="${Math.max(0, Math.round(entry.durationMs))}"`
            : "";
        content += entry.closed
          ? `<vibes-think${durAttr}>${body}</vibes-think>\n`
          : `<vibes-think>${body}\n`;
      } else {
        content += cleanResponseText(entry.text);
      }
    }
    return content;
  }

  /** BUGFIX #122: expone el error capturado de session.failed (o null). */
  getFailedError(): string | null {
    return this.failedError;
  }
}

// ============================================================================
// Closing tags
// ============================================================================

/** Builds the `<vibes-files-changed>` summary tag (files touched this turn). */
export function buildFilesChangedTag(
  files: string[],
  insertions: number,
  deletions: number,
): string {
  if (files.length === 0) return "";
  const filesAttr = files.map(escapeAttr).join(",");
  return `<vibes-files-changed files="${filesAttr}" insertions="${insertions}" deletions="${deletions}"></vibes-files-changed>`;
}

/**
 * Builds the compact turn summary tag (<vibes-context-summary>) storing
 * files read, dirs listed and files modified during the turn (Pi pattern).
 * This tag is parsed during hydration on subsequent turns to give the model
 * workspace memory without re-running exploratory tools.
 */
export function buildTurnSummaryTag(params: {
  filesRead?: string[];
  dirsListed?: string[];
  filesModified?: string[];
}): string {
  const { filesRead = [], dirsListed = [], filesModified = [] } = params;
  if (filesRead.length === 0 && dirsListed.length === 0 && filesModified.length === 0) {
    return "";
  }
  const lines: string[] = [];
  if (filesRead.length > 0) {
    lines.push(`Read: ${[...new Set(filesRead)].slice(0, 30).join(", ")}`);
  }
  if (dirsListed.length > 0) {
    lines.push(`Listed: ${[...new Set(dirsListed)].slice(0, 20).join(", ")}`);
  }
  if (filesModified.length > 0) {
    lines.push(`Modified: ${[...new Set(filesModified)].slice(0, 30).join(", ")}`);
  }
  return `<vibes-context-summary>\n${lines.join("\n")}\n</vibes-context-summary>`;
}

/**
 * Builds the `<vibes-token-usage>` tag from runtime usage.
 *
 * #243: `input` = input del ÚLTIMO step LLM (el contexto real del próximo
 * request — lo que mide el gauge). `billableInput` opcional = input total
 * facturable del turno (suma de los steps) — solo para coste; se emite como
 * atributo `billable-input` cuando es distinto del input del último step.
 */
export function buildTokenUsageTag(
  input: number,
  output: number,
  billableInput?: number,
): string {
  const billableAttr =
    billableInput !== undefined && billableInput !== input
      ? ` billable-input="${billableInput}"`
      : "";
  return `<vibes-token-usage input="${input}" output="${output}"${billableAttr}></vibes-token-usage>`;
}

/** Builds the `<vibes-cancelled>` tag appended on cancellation. */
export function buildCancelledTag(): string {
  return "<vibes-cancelled></vibes-cancelled>";
}

// ============================================================================
// Text cleaning (ported from cleanResponseText)
// ============================================================================

/**
 * Cleans assistant text before it reaches the UI. Ported from the adapter's
 * cleanResponseText — strips protocol artifacts, redactions and wrapper tags.
 */
export function cleanResponseText(text: string): string {
  let cleaned = text.replace(/\[REDACTED\]/gi, "");
  cleaned = cleaned.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "");
  cleaned = cleaned.replace(/<redacted>[\s\S]*?<\/redacted>/gi, "");
  cleaned = cleaned.replace(/<\/?assistant_response>/gi, "");
  cleaned = cleaned.replace(/<\/?assistant>/gi, "");
  // #238: strip orphan think/vibes-think tags (closing without opening or vice versa).
  // Se ejecuta ANTES del procesamiento de parejas think.../think para no
  // eliminar los tags validos que produce la conversion de assistant_thought.
  // Las parejas completas se procesan abajo; lo que llega aqui son tags
  // sueltos del modelo (inline en content, sin reasoning_content).
  cleaned = cleaned.replace(/<\/?think>/gi, "");
  cleaned = cleaned.replace(/<\/?vibes-think>/gi, "");
  cleaned = cleaned.replace(
    /<assistant_thought>([\s\S]*?)<\/assistant_thought>/gi,
    "<think>$1</think>",
  );
  cleaned = cleaned.replace(
    /<think>([\s\S]*?)<\/think>/gi,
    (_match, inner: string) => {
      const stripped = inner.replace(/<[^>]*>/g, "").trim();
      if (!stripped) return "";
      return `<think>${stripped}</think>`;
    },
  );
  cleaned = cleaned.replace(/<\/?invoke(?:\s[^>]*)?>[\s\S]*?(?:<\/invoke>)?/gi, "");
  cleaned = cleaned.replace(/<\/?parameter(?:\s[^>]*)?>[\s\S]*?(?:<\/parameter>)?/gi, "");
  cleaned = cleaned.replace(/<\/?\w+:tool_call(?:\s[^>]*)?>[\s\S]*?(?:<\/\w+:tool_call>)?/gi, "");
  cleaned = cleaned.replace(/<\/?\w+:function_call(?:\s[^>]*)?>[\s\S]*?(?:<\/\w+:function_call>)?/gi, "");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  return cleaned.trim();
}
