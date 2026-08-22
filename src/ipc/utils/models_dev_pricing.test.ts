/**
 * Card #87 — Slice E: precios con fallback al proveedor.
 *
 * Testea la capa de precios:
 *   - resolveModelCost: resuelve el costo aplicable según context-size tiers
 *     (p. ej. openai/gpt-5.5 cobra más arriba de 272k).
 *   - pricingFromCost: USD/M → formato "$X.XX/M" + escala de $.
 *   - Precedencia "el provider gana" (ya en enrichModelOption, ver Slice C):
 *     aquí se reafirma que toModelOption usa el costo del catálogo y el
 *     enriquecimiento NO lo pisa si el provider ya traía precio.
 *   - Nunca "gratis" falso: sin cost → undefined.
 */
import { describe, it, expect } from "vitest";
import { resolveModelCost, pricingFromCost, toModelOption } from "./models_dev_service";
import type { Model } from "@opencode-ai/models";

const baseModel = (patch: Partial<Model>): Model =>
  ({
    id: "m",
    name: "M",
    description: "",
    attachment: false,
    reasoning: false,
    tool_call: true,
    release_date: "2026-01-01",
    last_updated: "2026-01-01",
    modalities: { input: ["text"], output: ["text"] },
    open_weights: false,
    limit: { context: 100000, output: 8192 },
    ...patch,
  }) as unknown as Model;

// ─── resolveModelCost (tiers) ──────────────────────────────────────────────

describe("resolveModelCost", () => {
  it("sin tiers → costo base", () => {
    expect(resolveModelCost({ input: 3, output: 15 })).toEqual({ input: 3, output: 15 });
  });

  it("con tiers y contexto POR ENCIMA del umbral → precio del tier", () => {
    const cost = {
      input: 5,
      output: 25,
      tiers: [{ input: 10, output: 45, tier: { type: "context", size: 272000 } }],
    };
    // 300k > 272k → aplica el tier.
    expect(resolveModelCost(cost, 300000)).toEqual({ input: 10, output: 45 });
  });

  it("con tiers y contexto POR DEBAJO del umbral → costo base", () => {
    const cost = {
      input: 5,
      output: 25,
      tiers: [{ input: 10, output: 45, tier: { type: "context", size: 272000 } }],
    };
    expect(resolveModelCost(cost, 100000)).toEqual({ input: 5, output: 25 });
  });

  it("sin contextSize (no se da) → costo base", () => {
    const cost = {
      input: 5,
      output: 25,
      tiers: [{ input: 10, output: 45, tier: { type: "context", size: 272000 } }],
    };
    expect(resolveModelCost(cost, undefined)).toEqual({ input: 5, output: 25 });
  });

  it("multi-tier → el umbral más alto ya cruzado gana", () => {
    const cost = {
      input: 1,
      output: 1,
      tiers: [
        { input: 5, output: 5, tier: { type: "context", size: 100000 } },
        { input: 20, output: 20, tier: { type: "context", size: 200000 } },
      ],
    };
    // 150k cruza el tier de 100k pero no el de 200k → precio 5/5.
    expect(resolveModelCost(cost, 150000)).toEqual({ input: 5, output: 5 });
    // 250k cruza ambos → 20/20.
    expect(resolveModelCost(cost, 250000)).toEqual({ input: 20, output: 20 });
  });
});

// ─── pricingFromCost ───────────────────────────────────────────────────────

describe("pricingFromCost", () => {
  it("formatea y escala", () => {
    expect(pricingFromCost({ input: 5, output: 25 })).toEqual({
      pricingInput: "$5.00/M",
      pricingOutput: "$25.00/M",
      dollarSigns: 4, // >15
    });
    expect(pricingFromCost({ input: 1, output: 0 }).dollarSigns).toBe(0);
  });
});

// ─── toModelOption aplica tiers al precio ──────────────────────────────────

describe("toModelOption (precio con tiers)", () => {
  it("usa el precio del tier cuando el contexto del modelo lo justifica", () => {
    const model = baseModel({
      limit: { context: 400000, output: 8192 },
      cost: {
        input: 5,
        output: 25,
        tiers: [{ input: 10, output: 45, tier: { type: "context", size: 272000 } }],
      },
    });
    const opt = toModelOption(model);
    // 400k > 272k → precio del tier (10/45), no el base (5/25).
    expect(opt.pricingInput).toBe("$10.00/M");
    expect(opt.pricingOutput).toBe("$45.00/M");
  });

  it("usa el costo base si el contexto no cruza el umbral", () => {
    const model = baseModel({
      limit: { context: 100000, output: 8192 },
      cost: {
        input: 5,
        output: 25,
        tiers: [{ input: 10, output: 45, tier: { type: "context", size: 272000 } }],
      },
    });
    const opt = toModelOption(model);
    expect(opt.pricingInput).toBe("$5.00/M");
    expect(opt.pricingOutput).toBe("$25.00/M");
  });

  it("sin cost → sin precio (nunca 'gratis' falso)", () => {
    const model = baseModel({ cost: undefined });
    const opt = toModelOption(model);
    expect(opt.pricingInput).toBeUndefined();
    expect(opt.dollarSigns).toBeUndefined();
  });
});
