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
  cleanResponseText,
} from "./event_mapper";

describe("mapRuntimeToolToVibesTag — parity with adapter", () => {
  it.each([
    ["write_file", "vibes-write"],
    ["read_file", "vibes-read"],
    ["edit_file", "vibes-search-replace"],
    ["shell", "vibes-run-command"],
    ["glob", "vibes-list-files"],
    ["grep", "vibes-grep"],
  ])("maps %s → %s", (toolId, expected) => {
    expect(mapRuntimeToolToVibesTag(toolId)).toBe(expected);
  });

  it("unknown tools fall back to the generic mcp-tool-call", () => {
    expect(mapRuntimeToolToVibesTag("some_mcp_tool")).toBe("vibes-mcp-tool-call");
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

describe("extractToolContent", () => {
  it("returns strings verbatim", () => {
    expect(extractToolContent("hello")).toBe("hello");
  });
  it("JSON-serializes objects", () => {
    expect(extractToolContent({ path: "a", bytes: 4 })).toBe('{"path":"a","bytes":4}');
  });
  it("truncates very large payloads", () => {
    const big = { data: "x".repeat(1000) };
    const out = extractToolContent(big);
    expect(out.length).toBeLessThanOrEqual(401);
    expect(out.endsWith("…")).toBe(true);
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
