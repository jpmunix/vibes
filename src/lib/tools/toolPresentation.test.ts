/**
 * #168 — Tests de la fuente única de presentación de tools.
 *
 * La tabla RUNTIME_TOOL_TAGS es compartida por main (event_mapper) y renderer
 * (CompactToolBadge). Si se desincroniza del catálogo (@vibes/tools), una tool
 * nueva volvería a caer en el genérico "MCP" — estos tests lo impiden.
 */

import { describe, it, expect } from "vitest";
import {
  RUNTIME_TOOL_TAGS,
  resolveRuntimeToolTag,
  isBuiltInToolId,
} from "./toolPresentation";
import { TOOL_CATALOG_LIST } from "@vibes/tools/catalog";

describe("RUNTIME_TOOL_TAGS — cobertura completa del catálogo", () => {
  it("TODAS las tools del catálogo tienen tag propio (ni una cae en MCP)", () => {
    const missing = TOOL_CATALOG_LIST.filter(
      (def) => !(def.id in RUNTIME_TOOL_TAGS),
    ).map((def) => def.id);
    expect(missing).toEqual([]);
  });

  it("ningún valor de la tabla apunta al fallback MCP", () => {
    for (const tag of Object.values(RUNTIME_TOOL_TAGS)) {
      expect(tag).not.toBe("vibes-mcp-tool-call");
    }
  });

  it("todos los valores son tags vibes-* válidos (prefijo)", () => {
    for (const tag of Object.values(RUNTIME_TOOL_TAGS)) {
      expect(tag.startsWith("vibes-")).toBe(true);
    }
  });
});

describe("resolveRuntimeToolTag", () => {
  it("resuelve las built-in conocidas", () => {
    expect(resolveRuntimeToolTag("list_dir")).toBe("vibes-list-files");
    expect(resolveRuntimeToolTag("question")).toBe("vibes-question");
    expect(resolveRuntimeToolTag("todowrite")).toBe("vibes-todo");
  });

  it("devuelve undefined para desconocidas (MCP real)", () => {
    expect(resolveRuntimeToolTag("some_mcp_tool")).toBeUndefined();
    expect(resolveRuntimeToolTag("")).toBeUndefined();
  });
});

describe("isBuiltInToolId", () => {
  it("true para catálogo, false para MCP", () => {
    expect(isBuiltInToolId("grep")).toBe(true);
    expect(isBuiltInToolId("mcp__context7__query-docs")).toBe(false);
  });
});
