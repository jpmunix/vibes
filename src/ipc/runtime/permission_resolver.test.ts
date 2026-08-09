import { describe, expect, it } from "vitest";
import { permissionResolver } from "./permission_resolver";
import type { PermissionsConfig } from "../../lib/schemas";

describe("permissionResolver", () => {
  describe("defaults (no settings)", () => {
    it("returns allow for read_file with default", () => {
      const r = permissionResolver({
        toolId: "read_file",
        args: { path: "/x" },
        settings: undefined,
      });
      expect(r.decision).toBe("allow");
      expect(r.source).toBe("default");
    });

    it("returns allow for glob with default", () => {
      const r = permissionResolver({
        toolId: "glob",
        args: { pattern: "*.ts" },
        settings: undefined,
      });
      expect(r.decision).toBe("allow");
    });

    it("returns allow for grep with default", () => {
      const r = permissionResolver({
        toolId: "grep",
        args: { pattern: "foo", path: "/x" },
        settings: undefined,
      });
      expect(r.decision).toBe("allow");
    });

    it("returns ask for write_file with default", () => {
      const r = permissionResolver({
        toolId: "write_file",
        args: { path: "/x", content: "y" },
        settings: undefined,
      });
      expect(r.decision).toBe("ask");
      expect(r.source).toBe("default");
    });

    it("returns ask for edit_file with default", () => {
      const r = permissionResolver({
        toolId: "edit_file",
        args: { path: "/x", oldText: "a", newText: "b" },
        settings: undefined,
      });
      expect(r.decision).toBe("ask");
    });

    it("returns ask for shell with default", () => {
      const r = permissionResolver({
        toolId: "shell",
        args: { command: "ls -la" },
        settings: undefined,
      });
      expect(r.decision).toBe("ask");
    });

    it("returns ask for webfetch with default", () => {
      const r = permissionResolver({
        toolId: "webfetch",
        args: { url: "https://example.com" },
        settings: undefined,
      });
      expect(r.decision).toBe("ask");
    });
  });

  describe("pill global by tool", () => {
    it("deny wins over default for shell", () => {
      const settings: PermissionsConfig = {
        tools: { shell: "deny" },
      };
      const r = permissionResolver({
        toolId: "shell",
        args: { command: "ls" },
        settings,
      });
      expect(r.decision).toBe("deny");
      expect(r.source).toBe("pill");
    });

    it("deny wins over default for write_file", () => {
      const settings: PermissionsConfig = {
        tools: { write_file: "deny" },
      };
      const r = permissionResolver({
        toolId: "write_file",
        args: { path: "/x", content: "y" },
        settings,
      });
      expect(r.decision).toBe("deny");
      expect(r.source).toBe("pill");
    });

    it("allow wins over default for read_file", () => {
      const settings: PermissionsConfig = {
        tools: { read_file: "allow" },
      };
      const r = permissionResolver({
        toolId: "read_file",
        args: { path: "/x" },
        settings,
      });
      expect(r.decision).toBe("allow");
      expect(r.source).toBe("pill");
    });
  });

  describe("shell sub-pills", () => {
    it("digits + sub-pill take over default", () => {
      const settings: PermissionsConfig = {
        tools: { shell: "ask" },
      };
      const r = permissionResolver({
        toolId: "shell",
        args: { command: "ls -la" },
        settings,
      });
      // source: digit (default)
      expect(r.decision).toBe("ask");
    });
  });

  describe("custom rules", () => {
    it("custom rule matches prefix", () => {
      const settings: PermissionsConfig = {
        customRules: [
          { id: "r1", pattern: "ls", permission: "allow" },
        ],
      };
      const r = permissionResolver({
        toolId: "shell",
        args: { command: "ls -la" },
        settings,
      });
      expect(r.decision).toBe("allow");
      expect(r.source).toBe("custom-rule");
    });

    it("custom rule denies per prefix", () => {
      const settings: PermissionsConfig = {
        customRules: [
          { id: "r1", pattern: "rm /etc/", permission: "deny" },
        ],
      };
      const r = permissionResolver({
        toolId: "shell",
        args: { command: "rm /etc/passwd" },
        settings,
      });
      expect(r.decision).toBe("deny");
      expect(r.source).toBe("custom-rule");
    });

    it("non-matching prefix falls back to pill/default", () => {
      const settings: PermissionsConfig = {
        customRules: [
          { id: "r1", pattern: "rm /etc/", permission: "deny" },
        ],
      };
      const r = permissionResolver({
        toolId: "shell",
        args: { command: "rm /tmp/foo" },
        settings,
      });
      // No match → falls back to default (ask)
      expect(r.decision).toBe("ask");
      expect(r.source).toBe("default");
    });
  });

  describe("unknown tool", () => {
    it("asks (fail-closed) for unknown tool", () => {
      const r = permissionResolver({
        toolId: "unknown_tool_xyz",
        args: {},
        settings: undefined,
      });
      expect(r.decision).toBe("ask");
    });
  });

  describe("empty/null args", () => {
    it("asks when args is null", () => {
      const r = permissionResolver({
        toolId: "write_file",
        args: null,
        settings: undefined,
      });
      expect(r.decision).toBe("ask");
    });
  });
});
