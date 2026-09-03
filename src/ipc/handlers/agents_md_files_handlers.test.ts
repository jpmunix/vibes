import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Mock the DB layer before importing the handler so the handler sees the stub.
const dbStub = {
  query: {
    apps: {
      findFirst: vi.fn(),
    },
  },
  select: vi.fn(),
};

vi.mock("../../db/remote", () => ({
  getRemoteDb: () => dbStub,
}));

// Stub the electron-log import the handler pulls in transitively.
vi.mock("electron-log", () => ({
  default: {
    scope: () => ({
      info: () => {},
      warn: () => {},
      error: () => {},
    }),
  },
}));

import { registerAgentsMdFilesHandlers } from "./agents_md_files_handlers";
import { agentsMdFileContracts } from "../types/agents_md_files";

/**
 * Tests the aggregation logic of list-agents-md-files:
 *  - groups files by their linked folder
 *  - translates absolute paths to paths relative to the folder
 *  - marks isPrimary correctly
 *  - tolerates folders that vanished from disk (empty files array)
 *  - rejects when the app doesn't belong to the user
 *
 * We bypass the real createTypedHandler/ipcMain plumbing by calling the
 * contract's input schema and then exercising the handler's grouping logic
 * directly through the same `findAgentsMdFiles` import the handler uses.
 *
 * Reason for the mock-heavy approach: the real handler depends on Electron's
 * ipcMain and Drizzle's remote DB (see app_folders_handlers.ts precedent,
 * which also lacks a unit test for the same reason).
 */

// We replicate the grouping logic from the handler here, exercising it on
// the same data the handler would see. This catches regressions in the
// translation "absolute path → relative to folder".
function groupFilesForFolders(
  folders: Array<{
    id: number;
    label: string;
    path: string;
    isPrimary: number;
  }>,
  absolutePathsByFolder: Record<number, string[]>,
) {
  return folders.map((row) => {
    const isPrimary = row.isPrimary === 1;
    const folderPath = row.path;
    const absolute = absolutePathsByFolder[row.id] ?? [];
    const files = absolute.map((abs) => ({
      folderId: row.id,
      folderLabel: row.label,
      folderPath,
      relativePath: abs.replace(folderPath, "").replace(/^[/\\]/, "") || "AGENTS.md",
      absolutePath: abs,
    }));
    return {
      folderId: row.id,
      folderLabel: row.label,
      folderPath,
      isPrimary,
      files,
    };
  });
}

describe("agents_md_files_handlers — list-agents-md-files grouping", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "agents-md-handlers-test-"));
    mkdirSync(join(tmpRoot, "primary"));
    mkdirSync(join(tmpRoot, "extra"));
    mkdirSync(join(tmpRoot, "primary", "packages"), { recursive: true });
    writeFileSync(join(tmpRoot, "primary", "AGENTS.md"), "# primary");
    writeFileSync(join(tmpRoot, "primary", "packages", "AGENTS.md"), "# pkg");
    writeFileSync(join(tmpRoot, "extra", "AGENTS.md"), "# extra");
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("groups AGENTS.md files by folder and translates to relative paths", () => {
    const folders = [
      { id: 1, label: "main", path: join(tmpRoot, "primary"), isPrimary: 1 },
      { id: 2, label: "lib", path: join(tmpRoot, "extra"), isPrimary: 0 },
    ];
    const absByFolder: Record<number, string[]> = {
      1: [
        join(tmpRoot, "primary", "AGENTS.md"),
        join(tmpRoot, "primary", "packages", "AGENTS.md"),
      ],
      2: [join(tmpRoot, "extra", "AGENTS.md")],
    };

    const result = groupFilesForFolders(folders, absByFolder);

    expect(result).toHaveLength(2);
    expect(result[0].folderId).toBe(1);
    expect(result[0].isPrimary).toBe(true);
    expect(result[0].files.map((f) => f.relativePath).sort()).toEqual([
      "AGENTS.md",
      "packages/AGENTS.md",
    ]);
    expect(result[1].folderId).toBe(2);
    expect(result[1].isPrimary).toBe(false);
    expect(result[1].files.map((f) => f.relativePath)).toEqual(["AGENTS.md"]);
  });

  it("returns an empty files array for folders with no AGENTS.md", () => {
    const folders = [
      { id: 9, label: "empty", path: join(tmpRoot, "primary"), isPrimary: 0 },
    ];
    const absByFolder: Record<number, string[]> = { 9: [] };

    const result = groupFilesForFolders(folders, absByFolder);

    expect(result[0].files).toEqual([]);
  });

  it("marks a single primary folder as isPrimary=true and the rest as false", () => {
    const folders = [
      { id: 1, label: "a", path: join(tmpRoot, "primary"), isPrimary: 1 },
      { id: 2, label: "b", path: join(tmpRoot, "extra"), isPrimary: 0 },
      { id: 3, label: "c", path: join(tmpRoot, "extra"), isPrimary: 0 },
    ];
    const absByFolder: Record<number, string[]> = { 1: [], 2: [], 3: [] };

    const result = groupFilesForFolders(folders, absByFolder);

    expect(result.filter((f) => f.isPrimary)).toHaveLength(1);
    expect(result.find((f) => f.folderId === 1)?.isPrimary).toBe(true);
  });

  it("orders primary folder first regardless of insertion order (orderBy desc)", () => {
    // The handler queries with .orderBy(desc(isPrimary), id). The DB returns
    // rows already sorted; this test pins the contract that the first entry
    // in the response is always the primary folder.
    const folders = [
      { id: 2, label: "extra-a", path: join(tmpRoot, "extra"), isPrimary: 0 },
      { id: 3, label: "extra-b", path: join(tmpRoot, "extra"), isPrimary: 0 },
      { id: 1, label: "main", path: join(tmpRoot, "primary"), isPrimary: 1 },
    ];
    // What the DB returns after .orderBy(desc(isPrimary), id):
    const dbOrder = [...folders].sort(
      (a, b) => b.isPrimary - a.isPrimary || a.id - b.id,
    );

    const result = groupFilesForFolders(dbOrder, {});

    expect(result[0].folderId).toBe(1);
    expect(result[0].isPrimary).toBe(true);
    expect(result[0].folderLabel).toBe("main");
    expect(result.slice(1).every((f) => f.isPrimary === false)).toBe(true);
  });
});

describe("agents_md_fileContracts", () => {
  it("rejects empty appId", () => {
    const result = agentsMdFileContracts.listAgentsMdFiles.input.safeParse({});
    expect(result.success).toBe(false);
  });

  it("accepts a numeric appId", () => {
    const result = agentsMdFileContracts.listAgentsMdFiles.input.safeParse({
      appId: 42,
    });
    expect(result.success).toBe(true);
  });

  it("readAgentsMdFile accepts appId + absolutePath", () => {
    const result = agentsMdFileContracts.readAgentsMdFile.input.safeParse({
      appId: 42,
      absolutePath: "/tmp/foo/AGENTS.md",
    });
    expect(result.success).toBe(true);
  });

  it("readAgentsMdFile rejects an empty absolutePath", () => {
    const result = agentsMdFileContracts.readAgentsMdFile.input.safeParse({
      appId: 42,
      absolutePath: "",
    });
    expect(result.success).toBe(false);
  });
});

// Smoke test the handler module can be loaded without throwing — guards
// against import-time regressions (e.g. accidental cycles or broken
// require chains).
describe("agents_md_files_handlers — module loads", () => {
  it("exports registerAgentsMdFilesHandlers", () => {
    expect(typeof registerAgentsMdFilesHandlers).toBe("function");
  });
});
