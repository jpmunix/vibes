import { describe, expect, it } from "vitest";
import { buildToolList } from "./AgentPermissionsSettings";

describe("AgentPermissionsSettings.buildToolList (filas desde catálogo + i18n)", () => {
  it("genera una fila por cada tool del catálogo", () => {
    const rows = buildToolList("es");
    // El catálogo de vibes-core tiene 12 tools v1.
    expect(rows.length).toBe(12);
  });

  it("cada fila tiene un label humano que no es el id crudo", () => {
    const rows = buildToolList("es");
    for (const row of rows) {
      expect(row.label.length).toBeGreaterThan(0);
      // El label humano del diccionario ("Leer archivos") no es el id ("read_file").
      expect(row.label).not.toBe(row.toolId);
    }
  });

  it("contiene las tools nuevas del runtime (git_diff, patch, list_dir) que antes no estaban", () => {
    const rows = buildToolList("es");
    const ids = new Set(rows.map((r) => r.toolId));
    expect(ids.has("git_diff")).toBe(true);
    expect(ids.has("patch")).toBe(true);
    expect(ids.has("list_dir")).toBe(true);
    expect(ids.has("question")).toBe(true);
    expect(ids.has("todowrite")).toBe(true);
  });

  it("NO incluye tools fake 'pending' (webfetch/websearch/task/skill) que no existen en el runtime", () => {
    const rows = buildToolList("es");
    const ids = new Set(rows.map((r) => r.toolId));
    expect(ids.has("webfetch")).toBe(false);
    expect(ids.has("websearch")).toBe(false);
    // task/skill no están en el catálogo v1 (subagentes vienen en fase-2).
    expect(ids.has("task")).toBe(false);
    expect(ids.has("skill")).toBe(false);
  });

  it("deriva el default consent del riskLevel del catálogo", () => {
    const rows = buildToolList("es");
    const byId = new Map(rows.map((r) => [r.toolId, r]));
    // read → allow
    expect(byId.get("read_file")?.defaultValue).toBe("allow");
    expect(byId.get("glob")?.defaultValue).toBe("allow");
    expect(byId.get("grep")?.defaultValue).toBe("allow");
    // mutation → ask
    expect(byId.get("write_file")?.defaultValue).toBe("ask");
    expect(byId.get("edit_file")?.defaultValue).toBe("ask");
    // destructive → ask
    expect(byId.get("shell")?.defaultValue).toBe("ask");
  });

  it("localiza los labels según el idioma (es vs en)", () => {
    const es = new Map(buildToolList("es").map((r) => [r.toolId, r.label]));
    const en = new Map(buildToolList("en").map((r) => [r.toolId, r.label]));
    expect(es.get("read_file")).toBe("Leer archivos");
    expect(en.get("read_file")).toBe("Read files");
    expect(es.get("git_diff")).toBe("Ver cambios git");
    expect(en.get("git_diff")).toBe("View git changes");
  });
});
