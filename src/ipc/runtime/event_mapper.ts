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

// ============================================================================
// Tool → vibes tag
// ============================================================================

/**
 * Maps a vibes-core built-in tool id to its Vibes tag. Mirrors the adapter's
 * mapToolToVibesTag, adapted from OpenCode tool names to runtime tool ids.
 */
export function mapRuntimeToolToVibesTag(toolId: string): string {
  const map: Record<string, string> = {
    write_file: "vibes-write",
    read_file: "vibes-read",
    edit_file: "vibes-search-replace",
    shell: "vibes-run-command",
    glob: "vibes-list-files",
    grep: "vibes-grep",
  };
  return map[toolId] || "vibes-mcp-tool-call";
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

/**
 * Extracts a compact textual body from a tool result for the tag content.
 * Keeps it short — the UI renders tool cards, not full file dumps.
 */
export function extractToolContent(result: unknown): string {
  if (!result) return "";
  if (typeof result === "string") return result;
  try {
    const json = JSON.stringify(result);
    return json.length > 400 ? json.slice(0, 400) + "…" : json;
  } catch {
    return "";
  }
}

/** Builds a `<vibes-*>` tag for a finished tool call. */
export function buildVibesToolTag(
  toolId: string,
  detail: string,
  content: string,
): string {
  const vibesTag = mapRuntimeToolToVibesTag(toolId);
  switch (vibesTag) {
    case "vibes-write":
      return `<vibes-write path="${escapeAttr(detail)}" description="">${content}</vibes-write>`;
    case "vibes-search-replace":
      return `<vibes-search-replace path="${escapeAttr(detail)}" description="">${content}</vibes-search-replace>`;
    case "vibes-read":
      return `<vibes-read path="${escapeAttr(detail)}">${content}</vibes-read>`;
    case "vibes-grep":
      return `<vibes-grep query="${escapeAttr(detail)}">${content}</vibes-grep>`;
    case "vibes-run-command":
      return `<vibes-run-command cmd="${escapeAttr(detail)}">${content}</vibes-run-command>`;
    case "vibes-list-files":
      return `<vibes-list-files directory="${escapeAttr(detail)}">${content}</vibes-list-files>`;
    case "vibes-mcp-tool-call":
    default:
      return `<vibes-mcp-tool-call tool="${escapeAttr(toolId)}">${content}</vibes-mcp-tool-call>`;
  }
}

// ============================================================================
// Timeline accumulation (chronological: text deltas + tool cards)
// ============================================================================

export type VibesTimelineEntry =
  | { type: "text"; text: string }
  | { type: "tool"; tool: string; detail: string; error: boolean; output: string };

/**
 * Accumulator that mirrors the adapter's chronological timeline. Feed it
 * RuntimeEvents via `handle()` and read the rendered content with
 * `buildLiveContent()`.
 */
export class VibesEventMapper {
  private timeline: VibesTimelineEntry[] = [];
  /** toolCallId → args snapshot for rendering finished tools. */
  private toolArgs = new Map<string, { toolId: string; detail: string }>();
  /** Track files written/edited for the closing `<vibes-files-changed>` tag. */
  private filesChanged = new Set<string>();
  private diffStats = { insertions: 0, deletions: 0 };

  handle(event: RuntimeEvent): void {
    switch (event.type) {
      case "llm.delta": {
        const last = this.timeline[this.timeline.length - 1];
        if (last && last.type === "text") {
          last.text += event.text;
        } else {
          this.timeline.push({ type: "text", text: event.text });
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
          ? extractToolContent(event.result.output)
          : event.result.error?.message ?? "[error]";
        this.timeline.push({
          type: "tool",
          tool: toolId,
          detail,
          error: !ok,
          output,
        });
        // Track changed files for the closing summary tag.
        if (ok && (toolId === "write_file" || toolId === "edit_file") && detail) {
          this.filesChanged.add(detail);
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

  getFilesChanged(): string[] {
    return Array.from(this.filesChanged);
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
        content += buildVibesToolTag(entry.tool, entry.detail, body) + "\n";
      } else {
        content += cleanResponseText(entry.text);
      }
    }
    return content;
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

/** Builds the `<vibes-token-usage>` tag from runtime usage. */
export function buildTokenUsageTag(input: number, output: number): string {
  return `<vibes-token-usage input="${input}" output="${output}"></vibes-token-usage>`;
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
