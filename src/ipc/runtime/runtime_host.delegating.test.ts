/**
 * Card #VIBES-123: el provider delegante exponía un `id` fijo
 * `vibes-delegating`, que es lo que el loop pinta como `model=<id>` en el
 * header del `context.snapshot`. Este test verifica que `id` ahora es
 * dinámico y refleja el modelo real resuelto desde settings
 * (`vibes:<defaultModel>`).
 *
 * Mockeamos `electron` y `readSettings`; el resto de runtime_host se importa
 * para real (igual que runtime_host.gate.test.ts).
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: () => "/tmp/fake-userdata", isPackaged: true },
}));

vi.mock("../../main/settings", () => ({
  readSettings: vi.fn(),
}));

import { delegatingModelProvider } from "./runtime_host";
import { readSettings } from "../../main/settings";

describe("delegatingModelProvider.id — card #VIBES-123", () => {
  it("expone el id del provider real (vibes:<defaultModel>), no 'vibes-delegating'", () => {
    // Custom provider con apiBaseUrl: no requiere API key y resuelve
    // defaultModel = selectedModel.name sin enrutar por OpenRouter.
    (readSettings as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      selectedModel: { provider: "custom", name: "my-model" },
      customProviders: [{ id: "custom", apiBaseUrl: "http://localhost:8080/v1" }],
    });

    expect(delegatingModelProvider.id).toBe("vibes:my-model");
  });

  it("refleja un modelo distinto cuando cambia selectedModel", () => {
    (readSettings as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      selectedModel: { provider: "custom", name: "other-model" },
      customProviders: [{ id: "custom", apiBaseUrl: "http://localhost:8080/v1" }],
    });

    expect(delegatingModelProvider.id).toBe("vibes:other-model");
  });
});
