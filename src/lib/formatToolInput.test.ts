import { describe, expect, it } from "vitest";
import { formatToolInput } from "./formatToolInput";

describe("formatToolInput", () => {
  describe("shell-style tools", () => {
    it.each(["shell", "bash", "sh", "exec"])(
      "%s: '$ {cmd}' for shell args (vibes-core shape)",
      (toolId) => {
        expect(formatToolInput(toolId, { cmd: "ls", args: ["-la"] })).toBe(
          "$ ls -la",
        );
      },
    );

    it("shell: complex command with args", () => {
      expect(
        formatToolInput("shell", { cmd: "rm", args: ["-rf", "/tmp/foo bar"] }),
      ).toBe("$ rm -rf /tmp/foo bar");
    });

    it("shell: legacy args.command still works", () => {
      expect(formatToolInput("shell", { command: "ls -la" })).toBe(
        "$ ls -la",
      );
    });

    it("shell: handles missing command gracefully", () => {
      // Without args.cmd/args.command, falls through to the JSON fallback.
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
      expect(formatToolInput("shell", { cmd: "ls", args: ["-la", "/tmp"] })).toBe(
        "$ ls -la /tmp",
      );
    });

    it("rm -rf /etc via shell", () => {
      expect(formatToolInput("shell", { cmd: "rm", args: ["-rf", "/etc"] })).toBe(
        "$ rm -rf /etc",
      );
    });

    it("read_file via read_file", () => {
      expect(formatToolInput("read_file", { path: "/tmp/foo.txt" })).toBe(
        "/tmp/foo.txt",
      );
    });
  });

  describe("empty args (args={} bug)", () => {
    it("empty object → 'sin argumentos' (not '{}')", () => {
      // The pill used to show '{}' when a tool has no args. It should read
      // as "(sin argumentos)".
      expect(formatToolInput("git_diff", {})).toBe("(sin argumentos)");
    });

    it("git_diff with no args (all optional) → 'sin argumentos'", () => {
      expect(formatToolInput("git_diff", {})).toBe("(sin argumentos)");
    });

    it("git_diff with path → shows the path", () => {
      expect(formatToolInput("git_diff", { path: "src/foo.ts" })).toBe(
        "src/foo.ts",
      );
    });
  });
});
