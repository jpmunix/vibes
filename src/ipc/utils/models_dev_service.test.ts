/**
 * Card #87 — Slice A: unit tests de models_dev_service.resolveCatalog.
 *
 * Verifica la política de fuentes (decisión munix):
 *   memoria → disco fresco → fetch live → disco stale → snapshot embebido.
 * El snapshot embebido se importa en dinámico del paquete real
 * (`@opencode-ai/models/snapshot`), así que el test de fallback offline usa el
 * catálogo real embebido (192 providers).
 *
 * Mocks y porqué:
 *   - electron        → app.getPath("userData") en un tmpdir aislado.
 *   - fs/promises     → caché de disco controlada por el test (store en memoria).
 *   - electron-log    → silencio en los tests.
 *   - el fetch del SDK se inyecta vía `resolveCatalog({ fetch })`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ── Estado hoisted compartido con los vi.mock factories ────────────────────
const hoisted = vi.hoisted(() => ({
  diskStore: null as Record<string, string> | null, // path → contenido
  tmpRoot: "",
}));

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => hoisted.tmpRoot),
  },
}));

vi.mock("fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs/promises")>();
  return {
    ...actual,
    readFile: vi.fn(async (p: string) => {
      if (hoisted.diskStore && p in hoisted.diskStore) {
        return hoisted.diskStore[p];
      }
      throw new Error(`ENOENT: ${p}`);
    }),
    writeFile: vi.fn(async (p: string, data: string) => {
      hoisted.diskStore = { ...hoisted.diskStore, [p]: data };
    }),
    unlink: vi.fn(async (p: string) => {
      if (hoisted.diskStore && p in hoisted.diskStore) {
        delete hoisted.diskStore[p];
      }
    }),
  };
});

vi.mock("electron-log", () => {
  const noop = () => {};
  const logger = {
    scope: () => ({ info: noop, warn: noop, error: noop, debug: noop }),
    info: noop,
    warn: noop,
    error: noop,
  };
  return { default: logger };
});

import {
  resolveCatalog,
  refreshCatalog,
  clearModelsDevCache,
  _resetModelsDevCacheForTests,
} from "./models_dev_service";
import sampleFixture from "./__fixtures__/models-dev-sample.json";

// ── Helpers de fetch doble ─────────────────────────────────────────────────

/** Response mínimo que el SDK consume (.ok, .text(), .status, .body?.cancel). */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "ERR",
    body: { cancel: async () => {} },
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

const LIVE_CATALOG = sampleFixture as unknown as {
  providers: Record<string, unknown>;
  models: Record<string, unknown>;
};

function okFetch(): typeof fetch {
  return vi.fn(async () => jsonResponse(LIVE_CATALOG, 200)) as unknown as typeof fetch;
}
function failFetch(): typeof fetch {
  return vi.fn(async () => {
    throw new Error("ECONNREFUSED (no network)");
  }) as unknown as typeof fetch;
}

const CACHE_FILENAME = "models-dev-catalog-cache.json";

/** Ruta de caché en el userData tmp. Función (no const): tmpRoot se puebla en beforeEach. */
function cachePath(): string {
  return join(hoisted.tmpRoot, CACHE_FILENAME);
}

// Un caché de disco "fresco" (fetchedAt = ahora).
function seedFreshDiskCache(): void {
  hoisted.diskStore = {
    [cachePath()]: JSON.stringify({
      catalog: LIVE_CATALOG,
      fetchedAt: Date.now(),
      cacheVersion: 1,
      source: "live",
    }),
  };
}
// Un caché de disco "stale" (fetchedAt hace 2 días).
function seedStaleDiskCache(): void {
  hoisted.diskStore = {
    [cachePath()]: JSON.stringify({
      catalog: LIVE_CATALOG,
      fetchedAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
      cacheVersion: 1,
      source: "live",
    }),
  };
}

beforeEach(async () => {
  hoisted.tmpRoot = await mkdtemp(join(tmpdir(), "models-dev-test-"));
  hoisted.diskStore = null;
  _resetModelsDevCacheForTests();
});

afterEach(async () => {
  await rm(hoisted.tmpRoot, { recursive: true, force: true });
});

// ─── resolveCatalog ────────────────────────────────────────────────────────

describe("resolveCatalog", () => {
  it("escenario 1: sin caché, live OK → devuelve el live y lo persiste", async () => {
    const fetch = okFetch();
    const cat = await resolveCatalog({ fetch });

    expect(Object.keys(cat.providers).length).toBeGreaterThan(0);
    expect(cat.providers.anthropic).toBeDefined();
    // Se escribió a disco (cacheVersion 1, source live).
    const onDisk = JSON.parse(hoisted.diskStore![cachePath()]);
    expect(onDisk.source).toBe("live");
    expect(onDisk.cacheVersion).toBe(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("escenario 2: sin caché, live fail → snapshot embebido (offline floor)", async () => {
    const fetch = failFetch();
    const cat = await resolveCatalog({ fetch });

    // El snapshot embebido real del paquete trae 192 providers.
    expect(Object.keys(cat.providers).length).toBeGreaterThanOrEqual(150);
    expect(cat.providers.anthropic).toBeDefined();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("escenario 2b: cold-start concurrente → UN solo fetch (dedupe)", async () => {
    let calls = 0;
    const fetch = vi.fn(async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 20)); // ventana para solapar
      return okFetch()("https://models.dev/catalog.json" as any);
    });
    const [a, b] = await Promise.all([
      resolveCatalog({ fetch }),
      resolveCatalog({ fetch }),
    ]);
    expect(calls).toBe(1); // la segunda reutiliza la promesa en vuelo
    expect(a.providers.anthropic).toBeDefined();
    expect(b.providers.anthropic).toBeDefined();
  });

  it("escenario 3: caché en memoria fresca → no hace fetch live sincrónico", async () => {
    // Primera llamada puebla la memoria (live OK).
    await resolveCatalog({ fetch: okFetch() });
    // Segunda llamada con memoria fresca: el resultado se sirve de memoria.
    const fetch2 = okFetch();
    const cat = await resolveCatalog({ fetch: fetch2 });
    // El fixture live tiene exactamente 6 providers → no es el snapshot (192).
    expect(Object.keys(cat.providers).length).toBe(6);
    expect(cat.providers.anthropic).toBeDefined();
  });

  it("escenario 4: caché en disco fresca, memoria vacía → sirve la caché de disco", async () => {
    seedFreshDiskCache();
    const cat = await resolveCatalog({ fetch: okFetch() });
    // Servido de la caché de disco (el fixture → 6 providers, no snapshot).
    expect(Object.keys(cat.providers).length).toBe(6);
    expect(cat.providers.anthropic).toBeDefined();
  });

  it("escenario 5: caché en disco STALE, live fail → sirve la caché stale (stale-while-revalidate)", async () => {
    seedStaleDiskCache();
    const fetch = failFetch();
    const cat = await resolveCatalog({ fetch });
    // El live falló, pero la caché stale se sirve (fixture → 6 providers,
    // NO el snapshot de 192).
    expect(Object.keys(cat.providers).length).toBe(6);
    expect(cat.providers.anthropic).toBeDefined();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("force=true: omite la memoria y hace fetch live aunque haya memoria fresca", async () => {
    await resolveCatalog({ fetch: okFetch() }); // puebla memoria
    const fetch2 = okFetch();
    const cat = await refreshCatalog({ fetch: fetch2 });
    expect(cat.providers.anthropic).toBeDefined();
    // refreshCatalog limpia y hace fetch de nuevo.
    expect(fetch2).toHaveBeenCalledTimes(1);
  });
});

describe("clearModelsDevCache", () => {
  it("borra la memoria y el fichero de disco", async () => {
    // Rama live (sin disco previo): puebla memoria + disco SIN lanzar
    // refreshBackground, así el test es determinista (no hay escritura
    // en vuelo que reescriba el disco tras el clear).
    await resolveCatalog({ fetch: okFetch() });
    expect(hoisted.diskStore![cachePath()]).toBeDefined();

    await clearModelsDevCache();
    expect(hoisted.diskStore![cachePath()]).toBeUndefined();

    // Memoria borrada + disco vacío + live fallando → snapshot embebido.
    const cat = await resolveCatalog({ fetch: failFetch() });
    expect(Object.keys(cat.providers).length).toBeGreaterThanOrEqual(150);
  });
});

// ─── getCachedModelCaps (#230) ────────────────────────────────────────────

describe("getCachedModelCaps", () => {
  it("devuelve null sin caché en memoria (cold-start, no fetch)", async () => {
    const { getCachedModelCaps } = await import("./models_dev_service");
    // Memoria vacía (beforeEach ya resetea) — sin fetch, sin disco.
    expect(getCachedModelCaps("anthropic", "claude-sonnet-4-20250514")).toBeNull();
  });

  it("devuelve contextWindow + maxOutput cuando la caché está poblada", async () => {
    // Puebla la caché en memoria con el fixture (6 providers, live OK).
    await resolveCatalog({ fetch: okFetch() });
    const { getCachedModelCaps, findModel } = await import("./models_dev_service");

    // Buscamos el primer modelo del fixture con context > 0.
    const cat = await resolveCatalog({ fetch: okFetch() });
    const firstProvider = Object.keys(cat.providers)[0]!;
    const firstModelId = Object.keys(cat.providers[firstProvider]!.models)[0]!;
    const hit = findModel(cat, firstProvider, firstModelId);
    const expectedContext = hit.model?.limit?.context ?? null;
    const expectedOutput = hit.model?.limit?.output ?? undefined;

    expect(expectedContext).toBeTruthy();
    const caps = getCachedModelCaps(firstProvider, firstModelId);
    expect(caps).not.toBeNull();
    expect(caps!.contextWindow).toBe(expectedContext);
    if (expectedOutput !== undefined) {
      expect(caps!.maxOutput).toBe(expectedOutput);
    }
  });

  it("devuelve null para un provider/modelo que no existe en la caché", async () => {
    await resolveCatalog({ fetch: okFetch() });
    const { getCachedModelCaps } = await import("./models_dev_service");
    expect(getCachedModelCaps("nonexistent", "fake-model")).toBeNull();
  });
});
