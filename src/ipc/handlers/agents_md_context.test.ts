import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { findAgentsMdFiles, buildAgentsMdBlock } from "./agents_md_context";

describe("agents_md_context", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "agents-md-test-"));
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  describe("findAgentsMdFiles", () => {
    it("finds AGENTS.md in the workspace root", () => {
      writeFileSync(join(tmpRoot, "AGENTS.md"), "# rules");
      const files = findAgentsMdFiles(tmpRoot);
      expect(files.length).toBe(1);
      expect(files[0]).toBe(join(tmpRoot, "AGENTS.md"));
    });

    it("finds AGENTS.md in subdirectories within depth limit", () => {
      mkdirSync(join(tmpRoot, "packages", "runtime"), { recursive: true });
      writeFileSync(join(tmpRoot, "AGENTS.md"), "# root");
      writeFileSync(join(tmpRoot, "packages", "AGENTS.md"), "# pkg");
      writeFileSync(
        join(tmpRoot, "packages", "runtime", "AGENTS.md"),
        "# runtime",
      );
      const files = findAgentsMdFiles(tmpRoot);
      expect(files.length).toBe(3);
    });

    it("finds multiple AGENTS.md files (case-insensitive)", () => {
      writeFileSync(join(tmpRoot, "AGENTS.md"), "# root");
      mkdirSync(join(tmpRoot, "sub"));
      writeFileSync(join(tmpRoot, "sub", "agents.md"), "# sub lowercase");
      const files = findAgentsMdFiles(tmpRoot);
      expect(files.length).toBe(2);
    });

    it("does NOT descend into node_modules", () => {
      mkdirSync(join(tmpRoot, "node_modules", "some-pkg"), {
        recursive: true,
      });
      writeFileSync(join(tmpRoot, "AGENTS.md"), "# root");
      writeFileSync(
        join(tmpRoot, "node_modules", "some-pkg", "AGENTS.md"),
        "# should not find",
      );
      const files = findAgentsMdFiles(tmpRoot);
      expect(files.length).toBe(1);
      expect(files[0]).toBe(join(tmpRoot, "AGENTS.md"));
    });

    it("does NOT descend into .git, dist, build, etc.", () => {
      for (const dir of [".git", "dist", "build", "coverage"]) {
        mkdirSync(join(tmpRoot, dir), { recursive: true });
        writeFileSync(join(tmpRoot, dir, "AGENTS.md"), "# noise");
      }
      writeFileSync(join(tmpRoot, "AGENTS.md"), "# root");
      const files = findAgentsMdFiles(tmpRoot);
      expect(files.length).toBe(1);
    });

    it("respects depth limit (does not scan beyond depth 2)", () => {
      // depth 0: root, depth 1: a/, depth 2: a/b/, depth 3: a/b/c/ (should NOT scan)
      mkdirSync(join(tmpRoot, "a", "b", "c"), { recursive: true });
      writeFileSync(join(tmpRoot, "AGENTS.md"), "# root");
      writeFileSync(join(tmpRoot, "a", "AGENTS.md"), "# depth 1");
      writeFileSync(join(tmpRoot, "a", "b", "AGENTS.md"), "# depth 2");
      writeFileSync(
        join(tmpRoot, "a", "b", "c", "AGENTS.md"),
        "# depth 3 — should not find",
      );
      const files = findAgentsMdFiles(tmpRoot);
      expect(files.length).toBe(3); // root + depth 1 + depth 2
    });

    it("returns empty array when no AGENTS.md exists", () => {
      writeFileSync(join(tmpRoot, "README.md"), "# readme");
      const files = findAgentsMdFiles(tmpRoot);
      expect(files).toEqual([]);
    });

    it("handles non-existent directory gracefully", () => {
      const files = findAgentsMdFiles("/nonexistent/path/that/does/not/exist");
      expect(files).toEqual([]);
    });
  });

  describe("buildAgentsMdBlock", () => {
    it("returns empty string when no AGENTS.md found", () => {
      const block = buildAgentsMdBlock(tmpRoot);
      expect(block).toBe("");
    });

    it("builds a single-file block with header and content", () => {
      writeFileSync(join(tmpRoot, "AGENTS.md"), "# My Rules\nDo this.");
      const block = buildAgentsMdBlock(tmpRoot);
      expect(block).toContain("# Workspace AGENTS.md");
      expect(block).toContain("AGENTS.md");
      expect(block).toContain("# My Rules\nDo this.");
    });

    it("builds a multi-file block with relative paths as section headers", () => {
      mkdirSync(join(tmpRoot, "packages", "runtime"), { recursive: true });
      writeFileSync(join(tmpRoot, "AGENTS.md"), "# Root rules");
      writeFileSync(join(tmpRoot, "packages", "AGENTS.md"), "# Pkg rules");
      writeFileSync(
        join(tmpRoot, "packages", "runtime", "AGENTS.md"),
        "# Runtime rules",
      );
      const block = buildAgentsMdBlock(tmpRoot);
      expect(block).toContain("# Workspace AGENTS.md");
      expect(block).toContain("## AGENTS.md");
      expect(block).toContain("# Root rules");
      expect(block).toContain("## packages/AGENTS.md");
      expect(block).toContain("# Pkg rules");
      expect(block).toContain("## packages/runtime/AGENTS.md");
      expect(block).toContain("# Runtime rules");
    });

    it("skips empty AGENTS.md files", () => {
      writeFileSync(join(tmpRoot, "AGENTS.md"), "");
      const block = buildAgentsMdBlock(tmpRoot);
      expect(block).toBe("");
    });

    it("skips whitespace-only AGENTS.md files", () => {
      writeFileSync(join(tmpRoot, "AGENTS.md"), "   \n\n  \t  ");
      const block = buildAgentsMdBlock(tmpRoot);
      expect(block).toBe("");
    });
  });
});
