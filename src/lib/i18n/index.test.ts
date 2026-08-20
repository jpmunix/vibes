import { describe, expect, it } from "vitest";
import {
  t,
  tPlural,
  formatDate,
  formatDateTime,
  formatNumber,
  dateLocale,
  createI18nApi,
  toolLabel,
  toolDescription,
} from "./index";
import { TOOL_CATALOG_LIST } from "@vibes/tools/catalog";
import { toolTranslationsEs } from "./tools.es";
import { toolTranslationsEn } from "./tools.en";
import { messagesEs } from "./messages.es";
import { messagesEn } from "./messages.en";

/** Recursively collect leaf keys (`ns.key`), skipping plural objects. */
function leafKeys(messages: typeof messagesEs, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [ns, values] of Object.entries(messages)) {
    for (const [key, value] of Object.entries(values)) {
      const full = prefix ? `${prefix}${ns}.${key}` : `${ns}.${key}`;
      if (typeof value === "string") {
        keys.push(full);
      } else {
        // plural object {one,many}
        keys.push(full);
      }
    }
  }
  return keys;
}

describe("i18n tools dictionary", () => {
  it("every catalog tool has a label in es and en (no orphan keys)", () => {
    for (const def of TOOL_CATALOG_LIST) {
      expect(
        toolTranslationsEs[def.id],
        `tool ${def.id} missing es translation`,
      ).toBeTruthy();
      expect(
        toolTranslationsEn[def.id],
        `tool ${def.id} missing en translation`,
      ).toBeTruthy();
    }
  });

  it("no orphan keys: every translation key exists in the catalog", () => {
    const catalogIds = new Set(TOOL_CATALOG_LIST.map((d) => d.id));
    for (const key of Object.keys(toolTranslationsEs)) {
      expect(catalogIds.has(key), `orphan es key: ${key}`).toBe(true);
    }
    for (const key of Object.keys(toolTranslationsEn)) {
      expect(catalogIds.has(key), `orphan en key: ${key}`).toBe(true);
    }
  });

  it("toolLabel falls back to the raw tool id for unknown tools", () => {
    expect(toolLabel("definitely_not_a_tool", "es")).toBe(
      "definitely_not_a_tool",
    );
    expect(toolLabel("definitely_not_a_tool", "en")).toBe(
      "definitely_not_a_tool",
    );
  });

  it("toolDescription returns empty for unknown tools", () => {
    expect(toolDescription("definitely_not_a_tool", "es")).toBe("");
  });

  it("labels are non-empty and localized per language", () => {
    for (const def of TOOL_CATALOG_LIST) {
      expect(toolLabel(def.id, "es").length).toBeGreaterThan(0);
      expect(toolLabel(def.id, "en").length).toBeGreaterThan(0);
      expect(toolDescription(def.id, "es").length).toBeGreaterThan(0);
      expect(toolDescription(def.id, "en").length).toBeGreaterThan(0);
    }
  });
});

describe("i18n messages dictionary (Slice 1)", () => {
  it("es and en have identical key sets (no orphans)", () => {
    const es = leafKeys(messagesEs).sort();
    const en = leafKeys(messagesEn).sort();
    expect(es).toEqual(en);
  });

  it("every namespace has at least one key in both languages", () => {
    for (const ns of Object.keys(messagesEs)) {
      expect(Object.keys(messagesEn[ns] ?? {}).length).toBeGreaterThan(0);
    }
  });

  it("t returns the localized value", () => {
    expect(t("settings.title", "es")).toBe("Ajustes");
    expect(t("settings.title", "en")).toBe("Settings");
    expect(t("chat.thinking", "es")).toBe("Pensando");
    expect(t("chat.thinking", "en")).toBe("Thinking");
  });

  it("t falls back to the key for unknown keys (fail-closed)", () => {
    expect(t("no.such.key", "es")).toBe("no.such.key");
  });

  it("t interpolates {params}", () => {
    expect(t("settings.searchEmpty", "es", { query: "modelo" })).toBe(
      'Sin resultados para "modelo"',
    );
  });

  it("tPlural picks one for count=1 and many otherwise (es)", () => {
    expect(tPlural("plural.files", 1, "es")).toBe("1 archivo");
    expect(tPlural("plural.files", 3, "es")).toBe("3 archivos");
    expect(tPlural("plural.files", 0, "es")).toBe("0 archivos");
  });

  it("tPlural picks one for count=1 and many otherwise (en)", () => {
    expect(tPlural("plural.files", 1, "en")).toBe("1 file");
    expect(tPlural("plural.files", 3, "en")).toBe("3 files");
  });

  it("formatDate uses es-ES vs en-US separators", () => {
    const d = new Date(2026, 0, 15); // 15 ene 2026
    expect(formatDate(d, "es")).toMatch(/15/);
    expect(formatDate(d, "en")).toMatch(/15/);
  });

  it("formatDateTime includes time", () => {
    const d = new Date(2026, 0, 15, 9, 30);
    const es = formatDateTime(d, "es");
    const en = formatDateTime(d, "en");
    expect(es.length).toBeGreaterThan(0);
    expect(en.length).toBeGreaterThan(0);
    expect(es).not.toBe(en);
  });

  it("formatNumber uses locale separators", () => {
    expect(formatNumber(1234.5, "es")).toContain(",");
    expect(formatNumber(1234.5, "en")).toContain(".");
  });

  it("dateLocale returns the date-fns locale for the language", () => {
    const es = dateLocale("es");
    const en = dateLocale("en");
    expect(es.code).toBe("es");
    expect(en.code).toBe("en-US");
  });
});

describe("createI18nApi (pure API bound to a language)", () => {
  it("exposes t bound to the language", () => {
    const api = createI18nApi("en");
    expect(api.language).toBe("en");
    expect(api.t("settings.title")).toBe("Settings");
    expect(api.t("settings.title", {})).toBe("Settings");
  });

  it("exposes tPlural bound to the language", () => {
    const api = createI18nApi("es");
    expect(api.tPlural("plural.files", 1)).toBe("1 archivo");
    expect(api.tPlural("plural.files", 5)).toBe("5 archivos");
  });

  it("exposes format helpers bound to the language", () => {
    const api = createI18nApi("en");
    expect(api.formatNumber(1000)).toBe("1,000");
    expect(api.dateLocale().code).toBe("en-US");
  });

  it("exposes tool helpers bound to the language", () => {
    const api = createI18nApi("es");
    expect(api.toolLabel("read_file")).toBe("Leer archivos");
    expect(api.toolDescription("read_file").length).toBeGreaterThan(0);
  });
});
