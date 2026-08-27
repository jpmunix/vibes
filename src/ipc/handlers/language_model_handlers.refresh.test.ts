/**
 * Card #209 — Handler de refresh del catálogo.
 *
 * Verifica que `registerLanguageModelHandlers` registra un handler en el
 * canal `refresh-provider-models` (contrato renombrado desde
 * `refresh-openrouter-models`) y que el handler ejecuta `refreshCatalog`.
 *
 * El import del catálogo es dinámico (`.then`), igual que en el código real;
 * por eso en el test se registra y se invoca dentro de un vi.waitFor que
 * espera a que el handler esté disponible. El handler de refresh no toca la
 * base de datos, así que no necesita mocks de db ni settings.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ipcMain } from "electron";

const hoisted = vi.hoisted(() => ({
  refreshCatalog: vi.fn(async () => {}),
}));

vi.mock("../utils/models_dev_service", () => ({
  refreshCatalog: hoisted.refreshCatalog,
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}));

// Registra los handlers con el ipcMain mockeado (global de electron).
import { registerLanguageModelHandlers } from "./language_model_handlers";
import { languageModelContracts } from "../types/language-model";

const CHANNEL = languageModelContracts.refreshProviderModels.channel;

// Recupera el handler registrado para el canal.
function getRegisteredHandler(channel: string) {
  const calls = (ipcMain.handle as unknown as ReturnType<typeof vi.fn>).mock.calls;
  const call = calls.find((c) => c[0] === channel);
  return call ? call[1] : null;
}

beforeEach(() => {
  hoisted.refreshCatalog.mockReset();
  hoisted.refreshCatalog.mockResolvedValue(undefined);
  (ipcMain.handle as unknown as ReturnType<typeof vi.fn>).mockClear();
});

describe("refresh provider models handler (card #209)", () => {
  it("registra el canal refresh-provider-models (contrato renombrado)", () => {
    registerLanguageModelHandlers();
    const calls = (ipcMain.handle as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.some((c) => c[0] === CHANNEL)).toBe(true);
  });

  it("el handler del canal ejecuta refreshCatalog del catálogo", async () => {
    registerLanguageModelHandlers();
    const handler = getRegisteredHandler(CHANNEL);
    expect(handler).toBeTruthy();

    await handler({}, undefined, {});
    await vi.waitFor(() => {
      expect(hoisted.refreshCatalog).toHaveBeenCalledTimes(1);
    });
  });
});
