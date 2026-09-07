import { describe, it, expect, beforeEach } from "vitest";
import { createStore } from "jotai";
import { userSettingsAtom } from "@/atoms/appAtoms";
import type { UserSettings } from "@/lib/schemas";
import {
  effectiveChatRenderModeAtom,
  isZenModeAtom,
  isFlowModeAtom,
} from "@/atoms/chatAtoms";

/**
 * Contract de la "vista del chat" tras ocultar Max (full) de la UI:
 *  - quien tenía `full` (Max) → se comporta como `flow`
 *  - quien tenía `zen` → se queda en `zen`
 *  - sin valor (default / nuevo usuario) → `flow`
 * El valor `full` sigue siendo válido en el schema; solo se normaliza aquí.
 */
describe("effectiveChatRenderModeAtom", () => {
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    store = createStore();
  });

  function setMode(mode: UserSettings["chatRenderMode"] | undefined) {
    store.set(
      userSettingsAtom,
      { chatRenderMode: mode } as unknown as UserSettings,
    );
  }

  it("full (Max) → fallback a flow", () => {
    setMode("full");
    expect(store.get(effectiveChatRenderModeAtom)).toBe("flow");
  });

  it("flow → flow", () => {
    setMode("flow");
    expect(store.get(effectiveChatRenderModeAtom)).toBe("flow");
  });

  it("zen → zen (se conserva)", () => {
    setMode("zen");
    expect(store.get(effectiveChatRenderModeAtom)).toBe("zen");
  });

  it("sin valor definido → flow (default)", () => {
    setMode(undefined);
    expect(store.get(effectiveChatRenderModeAtom)).toBe("flow");
  });

  it("sin settings cargadas (null) → flow (default)", () => {
    store.set(userSettingsAtom, null);
    expect(store.get(effectiveChatRenderModeAtom)).toBe("flow");
  });

  describe("derivados isZenModeAtom / isFlowModeAtom", () => {
    it("full → no es zen-puro, sí flow (render mínimo)", () => {
      setMode("full");
      expect(store.get(isFlowModeAtom)).toBe(true);
    });

    it("flow → flow y render mínimo", () => {
      setMode("flow");
      expect(store.get(isZenModeAtom)).toBe(true);
      expect(store.get(isFlowModeAtom)).toBe(true);
    });

    it("zen → render mínimo pero NO flow", () => {
      setMode("zen");
      expect(store.get(isZenModeAtom)).toBe(true);
      expect(store.get(isFlowModeAtom)).toBe(false);
    });
  });
});
