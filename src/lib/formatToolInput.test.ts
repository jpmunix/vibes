import { describe, expect, it } from "vitest";
import { formatToolInput } from "./formatToolInput";

describe("formatToolInput", () => {
  describe("shell-style tools", () => {
    it.each(["shell", "bash", "sh", "exec"])(
      "%s: '$ {command}' for shell args",
      (toolId) => {
        expect(formatToolInput(toolId, { command: "ls -la" })).toBe(
          "$ ls -la",
        );
      },
    );

    it("shell: complex command with args", () => {
      expect(
        formatToolInput("shell", { command: "rm -rf /tmp/foo bar" }),
      ).toBe("$ rm -rf /tmp/foo bar");
    });

    it("shell: handles missing command gracefully", () => {
      // Without args.command, falls through to the JSON fallback.
      expect(formatToolInput("shell", { other: "x" })).toBe(
        JSON.stringify({ other: "x" }, null, 2),
      );
    });
  });

  describe("file-style tools", () => {
    it("read_file: path only", () => {
      expect(formatToolInput("read_file", { path: "/etc/passwd" })).toBe(
        "/etc/passwd",
      );
    });

    it("write_file: path + content", () => {
      expect(
        formatToolInput("write_file", { path: "/x", content: "hello" }),
      ).toBe("/x\nhello");
    });

    it("edit_file: path only", () => {
      expect(formatToolInput("edit_file", { path: "/x/y" })).toBe("/x/y");
    });
  });

  describe("pattern-style tools", () => {
    it("glob: pattern", () => {
      expect(formatToolInput("glob", { pattern: "*.ts" })).toBe("*.ts");
    });

    it("grep: pattern", () => {
      expect(formatToolInput("grep", { pattern: "TODO" })).toBe("TODO");
    });
  });

  describe("fallback", () => {
    it("unknown tool returns JSON formatted", () => {
      expect(formatToolInput("unknown", { a: 1, b: 2 })).toBe(
        JSON.stringify({ a: 1, b: 2 }, null, 2),
      );
    });

    it("null args → 'sin argumentos'", () => {
      expect(formatToolInput("shell", null)).toBe("(sin argumentos)");
    });

    it("undefined args → 'sin argumentos'", () => {
      expect(formatToolInput("shell", undefined)).toBe("(sin argumentos)");
    });

    it("non-object args → stringified", () => {
      expect(formatToolInput("shell", 42 as unknown)).toBe("42");
    });

    it("primitive string args", () => {
      expect(formatToolInput("shell", "raw" as unknown)).toBe("raw");
    });
  });

  describe("real-world scenarios", () => {
    it("ls -la /tmp via shell", () => {
      expect(formatToolInput("shell", { command: "ls -la /tmp" })).toBe(
        "$ ls -la /tmp",
      );
    });

    it("rm -rf /etc via shell", () => {
      expect(formatToolInput("shell", { command: "rm -rf /etc" })).toBe(
        "$ rm -rf /etc",
      );
    });

    it("read_file via read_file", () => {
      expect(formatToolInput("read_file", { path: "/tmp/foo.txt" })).toBe(
        "/tmp/foo.txt",
      );
    });
  });
});
