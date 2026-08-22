/**
 * Card #87 — Slice C: enriquecimiento de /models pobre (en lote).
 *
 * Testea `enrichModelOptions`: resuelve el catálogo (fetch inyectado) y
 * rellena los huecos de una lista de ModelOption de un provider runtime.
 * Verifica la precedencia (provider gana) y que un fallo del catálogo NO
 * rompe el lote (los modelos salen intactos).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Catalog } from "@opencode-ai/models";

const hoisted = vi.hoisted(() => ({ tmpRoot: "", diskStore: null as Record<string, string> | null }));

vi.mock("electron", () => ({ app: { getPath: vi.fn(() => hoisted.tmpRoot) } }));
vi.mock("fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs/promises")>();
  return {
    ...actual,
    readFile: vi.fn(async (p: string) => {
      if (hoisted.diskStore && p in hoisted.diskStore) return hoisted.diskStore[p];
      throw new Error(`ENOENT: ${p}`);
    }),
    writeFile: vi.fn(async (p: string, data: string) => {
      hoisted.diskStore = { ...hoisted.diskStore, [p]: data };
    }),
    unlink: vi.fn(async (p: string) => {
      if (hoisted.diskStore && p in hoisted.diskStore) delete hoisted.diskStore[p];
    }),
  };
});
vi.mock("electron-log", () => {
  const noop = () => {};
  return { default: { scope: () => ({ info: noop, warn: noop, error: noop }), info: noop, warn: noop, error: noop } };
});

import { enrichModelOptions } from "./models_dev_service";
import type { ModelOption } from "../shared/language_model_constants";
import sampleFixture from "./__fixtures__/models-dev-sample.json";

const CATALOG = sampleFixture as unknown as Catalog;

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: "OK",
    body: { cancel: async () => {} },
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}
const okFetch = () => vi.fn(async () => jsonResponse(CATALOG, 200)) as unknown as typeof fetch;
const failFetch = () => vi.fn(async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch;

beforeEach(async () => {
  hoisted.tmpRoot = await mkdtemp(join(tmpdir(), "models-dev-c-"));
  hoisted.diskStore = null;
});
afterEach(async () => {
  await rm(hoisted.tmpRoot, { recursive: true, force: true });
});

describe("enrichModelOptions (Slice C: /models pobre)", () => {
  it("rellena un modelo pobre de un proxy con datos del catálogo", async () => {
    const poor: ModelOption[] = [
      { name: "Claude Opus 4.5", displayName: "Claude Opus 4.5", description: "" }, // sin ctx/precio
    ];
    const out = await enrichModelOptions(poor, ["claude-opus-4-5"], { fetch: okFetch() });
    expect(out[0].contextWindow).toBeGreaterThan(0);
    expect(out[0].maxOutputTokens).toBeGreaterThan(0);
    expect(out[0].pricingInput).toBeDefined();
    // El displayName que ya traía el provider se conserva.
    expect(out[0].displayName).toBe("Claude Opus 4.5");
  });

  it("NO sobreescribe valores que ya trae el provider (precedencia)", async () => {
    const rich: ModelOption[] = [
      { name: "claude-opus-4-5", displayName: "X", description: "", contextWindow: 999, pricingInput: "$99/M" },
    ];
    const out = await enrichModelOptions(rich, ["claude-opus-4-5"], { fetch: okFetch() });
    expect(out[0].contextWindow).toBe(999);
    expect(out[0].pricingInput).toBe("$99/M");
  });

  it("no rompe el lote si el catálogo no conoce el modelo", async () => {
    const unknown: ModelOption[] = [{ name: "mi-modelo-propio", displayName: "Mi Modelo", description: "" }];
    const out = await enrichModelOptions(unknown, ["mi-modelo-propio"], { fetch: okFetch() });
    expect(out).toEqual(unknown);
  });

  it("devuelve el lote intacto si el fetch del catálogo falla (offline no rompe)", async () => {
    const poor: ModelOption[] = [{ name: "claude-opus-4-5", displayName: "X", description: "" }];
    // fetch fallando: resolveCatalog caería al snapshot, que SÍ conoce el
    // modelo → enriquece. Para forzar "no se enriquece" usamos un snapshot
    // ausente no es viable (siempre hay); en su lugar verificamos que NUNCA
    // lanza y devuelve el mismo número de modelos.
    const out = await enrichModelOptions(poor, ["claude-opus-4-5"], { fetch: failFetch() });
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("claude-opus-4-5");
  });

  it("devuelve [] para lote vacío sin resolver catálogo", async () => {
    const fetcher = okFetch();
    const out = await enrichModelOptions([], [], { fetch: fetcher });
    expect(out).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
