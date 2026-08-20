import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToString } from "react-dom/server";
import React from "react";
import { useI18n, createI18nApi } from "./index";

// Mock useSettings so useI18n can be exercised without Jotai/IPC.
vi.mock("@/hooks/useSettings", () => ({
  useSettings: vi.fn(),
}));

import { useSettings } from "@/hooks/useSettings";

const mockUseSettings = useSettings as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockUseSettings.mockReset();
  mockUseSettings.mockReturnValue({ settings: { chatLanguage: "es" } });
});

describe("useI18n (bound to chatLanguage)", () => {
  it("returns es API when chatLanguage is es", () => {
    mockUseSettings.mockReturnValue({ settings: { chatLanguage: "es" } });
    const api = createI18nApi("es");
    expect(api.language).toBe("es");
    expect(api.t("settings.title")).toBe("Ajustes");
  });

  it("returns en API when chatLanguage is en", () => {
    mockUseSettings.mockReturnValue({ settings: { chatLanguage: "en" } });
    const api = createI18nApi("en");
    expect(api.language).toBe("en");
    expect(api.t("settings.title")).toBe("Settings");
  });

  it("falls back to es when chatLanguage is missing", () => {
    mockUseSettings.mockReturnValue({ settings: {} });
    const api = createI18nApi("es");
    expect(api.language).toBe("es");
    expect(api.t("settings.title")).toBe("Ajustes");
  });

  it("renders through the hook with the active language", () => {
    mockUseSettings.mockReturnValue({ settings: { chatLanguage: "en" } });

    function Probe() {
      const i18n = useI18n();
      return React.createElement("div", null, i18n.t("chat.thinking"));
    }

    const html = renderToString(React.createElement(Probe));
    expect(html).toContain("Thinking");
  });
});
