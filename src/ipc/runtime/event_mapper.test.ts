/**
 * B6: Unit tests for event_mapper.ts — the `<vibes-*>` tag flavor layer.
 *
 * These pin PARITY with the OpenCode adapter's rendering (mapToolToVibesTag,
 * buildVibesTag, cleanResponseText). The whole point of the runtime swap is
 * that the UI shows IDENTICAL tool cards, so any drift here is a regression.
 */

import { describe, it, expect } from "vitest";
import {
  mapRuntimeToolToVibesTag,
  escapeAttr,
  extractToolDetail,
  extractToolContent,
  buildVibesToolTag,
  VibesEventMapper,
  buildFilesChangedTag,
  buildTokenUsageTag,
  buildCancelledTag,
  buildTurnSummaryTag,
  cleanResponseText,
  reformatToolResultContent,
} from "./event_mapper";

describe("mapRuntimeToolToVibesTag — fuente única #168", () => {
  it.each([
    ["write_file", "vibes-write"],
    ["read_file", "vibes-read"],
    ["edit_file", "vibes-search-replace"],
    ["shell", "vibes-run-command"],
    ["glob", "vibes-list-files"],
    ["grep", "vibes-grep"],
    // Nuevos en #168: antes caían en vibes-mcp-tool-call
    ["patch", "vibes-patch"],
    ["git_log", "vibes-git"],
    ["git_diff", "vibes-git"],
    ["list_dir", "vibes-list-files"],
    ["question", "vibes-question"],
    ["todowrite", "vibes-todo"],
  ])("maps %s → %s", (toolId, expected) => {
    expect(mapRuntimeToolToVibesTag(toolId)).toBe(expected);
  });

  it("unknown tools fall back to the generic mcp-tool-call", () => {
    expect(mapRuntimeToolToVibesTag("some_mcp_tool")).toBe("vibes-mcp-tool-call");
  });

  it("ninguna tool del catálogo built-in cae en el fallback MCP", () => {
    const BUILT_INS = [
      "read_file", "write_file", "edit_file", "patch", "glob", "grep",
      "shell", "git_log", "git_diff", "list_dir", "question", "todowrite",
    ];
    for (const id of BUILT_INS) {
      expect(mapRuntimeToolToVibesTag(id)).not.toBe("vibes-mcp-tool-call");
    }
  });
});

describe("escapeAttr", () => {
  it("escapes &, quotes and angle brackets", () => {
    expect(escapeAttr('a&b"<c>')).toBe("a&amp;b&quot;&lt;c&gt;");
  });
});

describe("extractToolDetail", () => {
  it("picks path for file tools", () => {
    expect(extractToolDetail("write_file", { path: "a.ts" })).toBe("a.ts");
    expect(extractToolDetail("edit_file", { path: "b.ts" })).toBe("b.ts");
  });

  it("joins shell cmd with its args array", () => {
    expect(extractToolDetail("shell", { cmd: "git", args: ["commit", "-m"] })).toBe(
      "git commit -m",
    );
  });

  it("falls back to empty string when keys are missing", () => {
    expect(extractToolDetail("read_file", {})).toBe("");
    expect(extractToolDetail("read_file", null)).toBe("");
  });
});

describe("extractToolContent — formatters por tool (#168)", () => {
  it("returns strings verbatim", () => {
    expect(extractToolContent("list_dir", "hello")).toBe("hello");
  });
  it("JSON-serializes objects de tools sin formatter", () => {
    expect(extractToolContent("desconocida", { path: "a", bytes: 4 })).toBe(
      '{"path":"a","bytes":4}',
    );
  });
  it("truncates very large payloads", () => {
    const big = { data: "x".repeat(1000) };
    const out = extractToolContent("desconocida", big);
    expect(out.length).toBeLessThanOrEqual(401);
    expect(out.endsWith("…")).toBe(true);
  });
  it("list_dir → listado legible con iconos, no JSON crudo", () => {
    const out = extractToolContent("list_dir", {
      path: "/x",
      entries: [
        { name: "ui", type: "directory" },
        { name: "index.tsx", type: "file", size: 2048 },
      ],
    });
    expect(out).toContain("📁 ui/");
    expect(out).toContain("📄 index.tsx (2.0 KB)");
    expect(out).not.toContain("{");
  });
  it("glob → lista de paths", () => {
    const out = extractToolContent("glob", { files: ["a.ts", "b.ts"], total: 2 });
    expect(out).toBe("a.ts\nb.ts");
  });
  it("grep → matches formato path:line:col", () => {
    const out = extractToolContent("grep", {
      matches: [{ path: "a.ts", line: 3, column: 5, text: "foo" }],
      total: 1,
    });
    expect(out).toBe("a.ts:3:5: foo");
  });
  it("git_log → líneas sha fecha autor asunto", () => {
    const out = extractToolContent("git_log", {
      commits: [{ sha: "abc1234567", author: "munix", isoDate: "2026-08-21T10:00:00Z", subject: "fix" }],
      truncated: false,
    });
    expect(out).toContain("abc1234 2026-08-21 munix — fix");
  });
  it("git_diff → cabecera +/− y diff unificado", () => {
    const out = extractToolContent("git_diff", {
      diff: "+hola\n-adios",
      additions: 1,
      deletions: 1,
      truncated: false,
    });
    expect(out).toContain("+1 −1");
    expect(out).toContain("+hola");
  });
  it("shell → stdout limpio, stderr etiquetado", () => {
    const out = extractToolContent("shell", { exitCode: 0, stdout: "ok\n", stderr: "" });
    expect(out).toBe("ok");
  });
  it("shell con cmd → elimina el eco del comando de la 1ª línea del stdout", () => {
    const out = extractToolContent("shell", {
      exitCode: 0,
      stdout: "ls src/components\ntotal 4\nErrorBoundary.tsx",
      stderr: "",
    });
    // El formatter no tiene cmd por defecto en extractToolContent (no lo pasa).
    // Aquí solo verificamos que no rompe sin cmd.
    expect(out).toContain("ErrorBoundary.tsx");
  });
  it("shell (formatter directo) con cmd → quita la 1ª línea si repite cmd", () => {
    // A través de reformatToolResultContent que sí pasa cmd.
    const out = reformatToolResultContent(
      "shell",
      JSON.stringify({
        exitCode: 0,
        stdout: "ls src/components\ntotal 4\nErrorBoundary.tsx",
        stderr: "",
      }),
      "ls src/components",
    );
    expect(out).not.toContain("ls src/components");
    expect(out).toContain("total 4");
    expect(out).toContain("ErrorBoundary.tsx");
  });
  it("write_file → resumen creado/actualizado + diff", () => {
    const out = extractToolContent("write_file", {
      path: "a.ts",
      bytes: 5,
      existed: false,
      diff: { path: "a.ts", additions: 2, deletions: 0, hunks: [{ startLine: 1, lines: ["+l1", "+l2"] }] },
    });
    expect(out).toContain("creado · +2 −0");
    expect(out).toContain("+l1");
  });
  it("formatter roto cae al JSON defensivo sin lanzar", () => {
    const out = extractToolContent("list_dir", null as any);
    // result null → early return ""
    expect(out).toBe("");
    const out2 = extractToolContent("list_dir", { entries: "no-array" } as any);
    expect(out2).not.toContain("entries");
  });

  it("un formatter que lanza no rompe el stream (fallback JSON)", () => {
    // Patch interno: pasamos un shape raro que dispare el throw del formatter
    const evil = { entries: [], get length(): number { throw new Error("boom"); } } as any;
    const out = extractToolContent("list_dir", evil);
    expect(typeof out).toBe("string");
  });

  it("shell con output STRING JSON (git status) → stdout legible, no JSON crudo", () => {
    const raw =
      '{"exitCode":0,"stdout":"En la rama main\\nTu rama está actualizada","stderr":""}';
    const out = extractToolContent("shell", raw);
    expect(out).toContain("En la rama main");
    expect(out).toContain("actualizada");
    expect(out).not.toContain('"exitCode"');
    expect(out).not.toContain("\\n");
  });

  it("list_dir con output STRING JSON → listado con iconos", () => {
    const raw =
      '{"path":"/x","entries":[{"name":"ui","type":"directory"},{"name":"a.ts","type":"file","size":2048}]}';
    const out = extractToolContent("list_dir", raw);
    expect(out).toContain("📁 ui/");
    expect(out).toContain("📄 a.ts (2.0 KB)");
    expect(out).not.toContain('"entries"');
  });

  it("string plano (no JSON) se mantiene verbatim incluso con formatter", () => {
    // Un stdout que no empiece por { o [ no debe parsearse.
    const out = extractToolContent("shell", "solo texto plano");
    expect(out).toBe("solo texto plano");
  });
});

describe("reformatToolResultContent — retroactivo (#168)", () => {
  it("reformatea JSON crudo persistido de shell (git status)", () => {
    const raw =
      '{"exitCode":0,"stdout":"En la rama main","stderr":""}';
    const out = reformatToolResultContent("shell", raw);
    expect(out).toContain("En la rama main");
    expect(out).not.toContain('"exitCode"');
  });

  it("reformatea JSON crudo de list_dir persistido", () => {
    const raw =
      '{"path":"/x","entries":[{"name":"ui","type":"directory"}]}';
    const out = reformatToolResultContent("list_dir", raw);
    expect(out).toContain("📁 ui/");
    expect(out).not.toContain('"entries"');
  });

  it("deja intacto content ya legible (no JSON)", () => {
    expect(reformatToolResultContent("shell", "texto plano ya legible")).toBe(
      "texto plano ya legible",
    );
  });

  it("devuelve tal cual si no hay formatter o el content no es JSON", () => {
    expect(reformatToolResultContent("mcp_foo", '{"a":1}')).toBe('{"a":1}');
    expect(reformatToolResultContent("shell", "no es json")).toBe("no es json");
    expect(reformatToolResultContent("shell", "")).toBe("");
  });
});

describe("buildVibesToolTag — tag shapes", () => {
  it("write uses path + empty description", () => {
    expect(buildVibesToolTag("write_file", "a.ts", "content")).toBe(
      '<vibes-write path="a.ts" description="">content</vibes-write>',
    );
  });
  it("shell uses cmd attribute", () => {
    expect(buildVibesToolTag("shell", "ls -la", "out")).toBe(
      '<vibes-run-command cmd="ls -la">out</vibes-run-command>',
    );
  });
  it("unknown tool uses tool attribute", () => {
    expect(buildVibesToolTag("foo_bar", "detail", "body")).toBe(
      '<vibes-mcp-tool-call tool="foo_bar">body</vibes-mcp-tool-call>',
    );
  });
  it("patch → vibes-patch con path", () => {
    expect(buildVibesToolTag("patch", "multi-file", "body")).toBe(
      '<vibes-patch path="multi-file" description="">body</vibes-patch>',
    );
  });
  it("git_log/git_diff → vibes-git con operation", () => {
    expect(buildVibesToolTag("git_log", "", "body")).toBe(
      '<vibes-git operation="log">body</vibes-git>',
    );
    expect(buildVibesToolTag("git_diff", "", "body")).toBe(
      '<vibes-git operation="diff">body</vibes-git>',
    );
  });
  it("question → vibes-question y todowrite → vibes-todo", () => {
    expect(buildVibesToolTag("question", "", "ans")).toBe(
      "<vibes-question>ans</vibes-question>",
    );
    expect(buildVibesToolTag("todowrite", "", "list")).toBe(
      "<vibes-todo>list</vibes-todo>",
    );
  });
});

describe("VibesEventMapper — timeline accumulation", () => {
  it("coalesces consecutive llm.delta into a single text entry", () => {
    const m = new VibesEventMapper();
    m.handle({ type: "llm.delta", text: "Hello " } as any);
    m.handle({ type: "llm.delta", text: "world" } as any);
    expect(m.getTimeline()).toHaveLength(1);
    expect(m.getTimeline()[0]).toEqual({ type: "text", text: "Hello world" });
  });

  it("renders a finished tool as its vibes tag", () => {
    const m = new VibesEventMapper();
    m.handle({
      type: "tool.started",
      toolCallId: "tc1",
      toolId: "read_file",
      args: { path: "a.ts" },
    } as any);
    m.handle({
      type: "tool.finished",
      toolCallId: "tc1",
      toolId: "read_file",
      result: { ok: true, output: "file contents" },
    } as any);
    const content = m.buildLiveContent();
    expect(content).toContain('<vibes-read path="a.ts">file contents</vibes-read>');
  });

  it("tracks written files for the files-changed summary", () => {
    const m = new VibesEventMapper();
    m.handle({
      type: "tool.started",
      toolCallId: "tc1",
      toolId: "write_file",
      args: { path: "a.ts" },
    } as any);
    m.handle({
      type: "tool.finished",
      toolCallId: "tc1",
      toolId: "write_file",
      result: { ok: true, output: "" },
    } as any);
    expect(m.getFilesChanged()).toEqual(["a.ts"]);
  });

  it("marks failed tools as errors", () => {
    const m = new VibesEventMapper();
    m.handle({
      type: "tool.started",
      toolCallId: "tc1",
      toolId: "shell",
      args: { cmd: "bad" },
    } as any);
    m.handle({
      type: "tool.finished",
      toolCallId: "tc1",
      toolId: "shell",
      result: { ok: false, error: new Error("boom") },
    } as any);
    expect(m.buildLiveContent()).toContain("[error]");
  });

  // 172: razonamiento nativo → entrada reasoning en el timeline.
  it("coalesces llm.reasoning_delta into one closed reasoning entry", () => {
    const m = new VibesEventMapper();
    m.handle({ type: "llm.reasoning_start", blockId: "reasoning-0" } as any);
    m.handle({ type: "llm.reasoning_delta", blockId: "reasoning-0", text: "Paso 1: " } as any);
    m.handle({ type: "llm.reasoning_delta", blockId: "reasoning-0", text: "pensar" } as any);
    m.handle({ type: "llm.reasoning_end", blockId: "reasoning-0" } as any);
    const timeline = m.getTimeline();
    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toEqual({ type: "reasoning", text: "Paso 1: pensar", closed: true });
  });

  it("renders a closed reasoning entry as a full <vibes-think> tag", () => {
    const m = new VibesEventMapper();
    m.handle({ type: "llm.reasoning_start", blockId: "reasoning-0" } as any);
    m.handle({ type: "llm.reasoning_delta", blockId: "reasoning-0", text: "cogiendo algo" } as any);
    m.handle({ type: "llm.reasoning_end", blockId: "reasoning-0" } as any);
    expect(m.buildLiveContent()).toBe("<vibes-think>cogiendo algo</vibes-think>\n");
  });

  it("leaves an OPEN <vibes-think> tag while the reasoning is still streaming", () => {
    const m = new VibesEventMapper();
    m.handle({ type: "llm.reasoning_start", blockId: "reasoning-0" } as any);
    m.handle({ type: "llm.reasoning_delta", blockId: "reasoning-0", text: "thinking hard..." } as any);
    // Sin reasoning_end → el parser (preprocessUnclosedTags) lo marca inProgress
    // y lo renderiza como LiveThinkingPanel activo.
    const content = m.buildLiveContent();
    expect(content).toBe("<vibes-think>thinking hard...\n");
    expect(content).not.toContain("</vibes-think>");
  });

  it("escapes XML special chars in reasoning content", () => {
    const m = new VibesEventMapper();
    m.handle({ type: "llm.reasoning_start", blockId: "reasoning-0" } as any);
    m.handle({ type: "llm.reasoning_delta", blockId: "reasoning-0", text: "a & b < c" } as any);
    m.handle({ type: "llm.reasoning_end", blockId: "reasoning-0" } as any);
    expect(m.buildLiveContent()).toBe("<vibes-think>a &amp; b &lt; c</vibes-think>\n");
  });

  it("handles a reasoning delta with no prior start (defensive)", () => {
    const m = new VibesEventMapper();
    m.handle({ type: "llm.reasoning_delta", blockId: "reasoning-0", text: "orphan" } as any);
    expect(m.getTimeline()).toEqual([{ type: "reasoning", text: "orphan", closed: false }]);
  });
});

describe("VibesEventMapper — session.failed (BUGFIX #122)", () => {
  it("captures the serialized error and exposes it via getFailedError", () => {
    const m = new VibesEventMapper();
    expect(m.getFailedError()).toBeNull();
    m.handle({
      type: "session.failed",
      sessionId: "s1",
      ts: 0,
      error: { name: "Error", message: "400 invalid wire format" },
    } as any);
    expect(m.getFailedError()).toBe("400 invalid wire format");
  });

  it("falls back to a generic message when error is missing", () => {
    const m = new VibesEventMapper();
    m.handle({ type: "session.failed", sessionId: "s1", ts: 0 } as any);
    expect(m.getFailedError()).toBe("Error desconocido del agente.");
  });
});

describe("closing tags", () => {
  it("files-changed tag lists files and stats", () => {
    expect(buildFilesChangedTag(["a.ts", "b.ts"], 3, 1)).toBe(
      '<vibes-files-changed files="a.ts,b.ts" insertions="3" deletions="1"></vibes-files-changed>',
    );
  });
  it("files-changed is empty when no files", () => {
    expect(buildFilesChangedTag([], 0, 0)).toBe("");
  });
  it("token-usage tag carries counts", () => {
    expect(buildTokenUsageTag(10, 5)).toBe(
      '<vibes-token-usage input="10" output="5"></vibes-token-usage>',
    );
  });
  it("cancelled tag", () => {
    expect(buildCancelledTag()).toBe("<vibes-cancelled></vibes-cancelled>");
  });
});

describe("turn summary tag — memoria de turno #180 (Slice 2)", () => {
  it("buildTurnSummaryTag formats Read/Listed/Modified lines", () => {
    const tag = buildTurnSummaryTag({
      filesRead: ["a.ts", "b.ts"],
      dirsListed: ["src"],
      filesModified: ["c.ts"],
    });
    expect(tag).toBe(
      "<vibes-context-summary>\nRead: a.ts, b.ts\nListed: src\nModified: c.ts\n</vibes-context-summary>",
    );
  });

  it("buildTurnSummaryTag returns empty string when no data", () => {
    expect(buildTurnSummaryTag({ filesRead: [], dirsListed: [], filesModified: [] })).toBe("");
    expect(buildTurnSummaryTag({})).toBe("");
  });

  it("buildTurnSummaryTag dedupes and caps list lengths", () => {
    const tag = buildTurnSummaryTag({
      filesRead: ["dup.ts", "dup.ts", "other.ts"],
      dirsListed: ["d1", "d1"],
    });
    expect(tag).toContain("Read: dup.ts, other.ts");
    expect(tag).toContain("Listed: d1");
    expect(tag).not.toContain("Modified:");
    // Cap: más de 30 reads → solo 30 en el tag.
    const many = Array.from({ length: 35 }, (_, i) => `f${i}.ts`);
    const capped = buildTurnSummaryTag({ filesRead: many });
    expect(capped).toContain("Read: f0.ts");
    expect(capped).not.toContain("f30.ts");
  });

  it("mapper tracks read/list files for the turn summary", () => {
    const m = new VibesEventMapper();
    m.handle({
      type: "tool.started",
      toolCallId: "tc-r",
      toolId: "read_file",
      args: { path: "src/a.ts" },
    } as any);
    m.handle({
      type: "tool.finished",
      toolCallId: "tc-r",
      toolId: "read_file",
      result: { ok: true, output: "content" },
    } as any);
    m.handle({
      type: "tool.started",
      toolCallId: "tc-l",
      toolId: "list_dir",
      args: { path: "src" },
    } as any);
    m.handle({
      type: "tool.finished",
      toolCallId: "tc-l",
      toolId: "list_dir",
      result: { ok: true, output: "entries" },
    } as any);
    expect(m.getFilesRead()).toEqual(["src/a.ts"]);
    expect(m.getDirsListed()).toEqual(["src"]);
  });

  it("failed reads are not tracked", () => {
    const m = new VibesEventMapper();
    m.handle({
      type: "tool.started",
      toolCallId: "tc-f",
      toolId: "read_file",
      args: { path: "missing.ts" },
    } as any);
    m.handle({
      type: "tool.finished",
      toolCallId: "tc-f",
      toolId: "read_file",
      result: { ok: false, error: { name: "FileNotFound", message: "nope" } },
    } as any);
    expect(m.getFilesRead()).toEqual([]);
  });
});

describe("cleanResponseText — parity with adapter", () => {
  it("strips [REDACTED]", () => {
    expect(cleanResponseText("a [REDACTED]b")).toBe("a b");
  });

  it("removes <thinking> blocks", () => {
    expect(cleanResponseText("before <thinking>secret</thinking> after")).toBe("before  after");
  });

  it("converts assistant_thought to think", () => {
    expect(cleanResponseText("<assistant_thought>hmm</assistant_thought>")).toBe("<think>hmm</think>");
  });

  it("strips empty think blocks", () => {
    // Note: spaces around the removed block are preserved (adapter parity).
    expect(cleanResponseText("x <think></think> y")).toBe("x  y");
  });

  it("collapses 3+ newlines to 2", () => {
    expect(cleanResponseText("a\n\n\n\nb")).toBe("a\n\nb");
  });

  it("strips wrapper assistant tags", () => {
    expect(cleanResponseText("<assistant_response>hi</assistant_response>")).toBe("hi");
  });
});
