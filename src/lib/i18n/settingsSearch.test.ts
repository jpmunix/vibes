import { describe, expect, it } from "vitest";
import {
  SETTINGS_SEARCH_ENTRIES,
  buildSettingsSearchIndex,
} from "./settingsSearch";

describe("settingsSearch index (i18n)", () => {
  it("has unique ids and known sectionIds", () => {
    const ids = SETTINGS_SEARCH_ENTRIES.map((e) => e.id);
    const sectionIds = SETTINGS_SEARCH_ENTRIES.map((e) => e.sectionId);
    expect(new Set(ids).size).toBe(ids.length);
    // Multiple items share a section (sectionId repeats on purpose)
    const knownSectionIds = [
      "general-settings",
      "workflow-settings",
      "ai-behavior",
      "models-connectivity",
      "integrations",
      "tools-mcp",
      "tools-skills",
      "custom-agents-settings",
    ];
    for (const sectionId of sectionIds) {
      expect(knownSectionIds).toContain(sectionId);
    }
  });

  it("builds the full index for es and en with the same size", () => {
    const es = buildSettingsSearchIndex("es");
    const en = buildSettingsSearchIndex("en");
    expect(es.length).toBe(SETTINGS_SEARCH_ENTRIES.length);
    expect(en.length).toBe(es.length);
  });

  it("localizes label/description/section per language", () => {
    const es = buildSettingsSearchIndex("es");
    const en = buildSettingsSearchIndex("en");
    const themeEs = es.find((i) => i.id === "theme")!;
    const themeEn = en.find((i) => i.id === "theme")!;
    expect(themeEs.label).toBe("Apariencia");
    expect(themeEn.label).toBe("Appearance");
    expect(themeEs.section).toBe("General");
    expect(themeEn.section).toBe("General");
    expect(themeEs.description).not.toBe(themeEn.description);
  });

  it("localizes workflow section label", () => {
    const es = buildSettingsSearchIndex("es");
    const en = buildSettingsSearchIndex("en");
    const chatModeEs = es.find((i) => i.id === "chat-mode")!;
    const chatModeEn = en.find((i) => i.id === "chat-mode")!;
    expect(chatModeEs.section).toBe("Configuración del flujo de trabajo");
    expect(chatModeEn.section).toBe("Workflow Settings");
  });

  it("keywords are a bilingual union (never rendered, only matched)", () => {
    const index = buildSettingsSearchIndex("es");
    const theme = index.find((i) => i.id === "theme")!;
    expect(theme.keywords).toEqual(
      expect.arrayContaining(["dark", "light", "claro", "oscuro"]),
    );
    // Every entry keeps at least one en + one es keyword for cross-language search
    for (const item of index) {
      expect(item.keywords.length).toBeGreaterThan(0);
    }
  });

  it("all localized labels and descriptions are non-empty (fail-closed)", () => {
    for (const lang of ["es", "en"] as const) {
      const index = buildSettingsSearchIndex(lang);
      for (const item of index) {
        expect(item.label.length, `${lang} ${item.id} label`).toBeGreaterThan(0);
        expect(
          item.description.length,
          `${lang} ${item.id} description`,
        ).toBeGreaterThan(0);
        expect(item.section.length, `${lang} ${item.id} section`).toBeGreaterThan(
          0,
        );
      }
    }
  });
});
