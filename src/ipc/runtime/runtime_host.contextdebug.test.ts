/**
 * Context debug (temporal) — toggle en caliente del flag loopConfig.debugContext
 * + registro de la ventana de debug.
 *
 * `setDebugContext(enabled)` muta el LoopConfig en caliente (observable vía
 * getAgentLoopLimits). `setContextDebugWindow(wc)` vincula la ventana al flag:
 * abrir (wc válido) = ON, cerrar (null) = OFF, y `getContextDebugSender()`
 * devuelve el WebContents vivo o null.
 *
 * `electron` y settings se mockean (patrón de runtime_host.looplimits) porque
 * importar runtime_host arrastra electron + readSettings.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("electron", () => ({
  app: {
    getPath: () => "/tmp/vibes-rh-dbg",
    isPackaged: true,
  },
}));

vi.mock("../../main/settings", () => ({
  readSettings: vi.fn(() => ({})),
}));

vi.mock("./model_resolver", () => ({
  resolveRuntimeModelTarget: vi.fn(() => undefined),
  resolveRuntimeFallbackTarget: vi.fn(() => null),
}));

vi.mock("@vibes/providers/openai-compatible", () => ({
  createOpenAICompatibleProvider: vi.fn((opts: any) => ({ id: opts.id })),
}));

import {
  setDebugContext,
  setContextDebugWindow,
  getContextDebugSender,
  isContextDebugEnabled,
  getAgentLoopLimits,
} from "./runtime_host";

/** WebContents fake con isDestroyed() para simular la ventana. */
function fakeWc(destroyed = false) {
  return { isDestroyed: () => destroyed } as unknown as Electron.WebContents;
}

describe("context debug (hot-reload) — flag + ventana", () => {
  beforeEach(() => {
    // Reset: ventana cerrada → flag OFF, entre tests.
    setContextDebugWindow(null);
  });

  it("setDebugContext(true) activa el flag; false lo apaga", () => {
    expect(getAgentLoopLimits().debugContext).toBeFalsy();
    setDebugContext(true);
    expect(getAgentLoopLimits().debugContext).toBe(true);
    setDebugContext(false);
    expect(getAgentLoopLimits().debugContext).toBe(false);
  });

  it("setContextDebugWindow(null) → debug OFF y sender null", () => {
    setContextDebugWindow(null);
    expect(getAgentLoopLimits().debugContext).toBe(false);
    expect(isContextDebugEnabled()).toBe(false);
    expect(getContextDebugSender()).toBeNull();
  });

  it("setContextDebugWindow(vivo) → debug ON y sender = wc", () => {
    const wc = fakeWc(false);
    setContextDebugWindow(wc);
    expect(getAgentLoopLimits().debugContext).toBe(true);
    expect(isContextDebugEnabled()).toBe(true);
    expect(getContextDebugSender()).toBe(wc);
  });

  it("sender destruido → getContextDebugSender() null y debug OFF", () => {
    setContextDebugWindow(fakeWc(true)); // destruido
    expect(getContextDebugSender()).toBeNull();
    // Al registrar un wc destruido el flag debe quedar OFF (cerrar = OFF).
    expect(getAgentLoopLimits().debugContext).toBe(false);
  });
});
