/**
 * Card #242 — Tests de integración para re-validación de modelos al cambiar ajustes / proveedores.
 *
 * Verifica que al actualizar settings o cambiar la configuración de un proveedor
 * se evalúa correctamente la validez y se computa la firma determinista de slots.
 */
import { describe, it, expect } from "vitest";
import {
  getInvalidSlotsSignature,
  type InvalidModelSlot,
} from "../../atoms/modelValidationAtoms";
import {
  buildDisabledProviderIds,
  validateModelReferences,
  type ValidationDeps,
} from "./model_validator";
import type { UserSettings } from "../../lib/schemas";
import sampleFixture from "./__fixtures__/models-dev-sample.json";
import type { Catalog } from "@opencode-ai/models";

const CATALOG = sampleFixture as unknown as Catalog;

describe("Model Revalidation & Signatures (Card #242)", () => {
  const deps: ValidationDeps = {
    catalog: CATALOG,
    customModelNames: new Set<string>(),
    configuredProviderIds: new Set<string>(["openrouter", "ollama"]),
    disabledProviders: new Set<string>(),
  };

  it("getInvalidSlotsSignature genera firmas estables e independientes del orden", () => {
    const slotA: InvalidModelSlot = {
      slotKey: "selectedModel",
      labelKey: "models.validation.slotSelectedModel",
      currentValue: "openrouter::broken-model",
      providerId: "openrouter",
      modelName: "broken-model",
      reason: "model_not_found",
    };
    const slotB: InvalidModelSlot = {
      slotKey: "strategistModel",
      labelKey: "models.validation.slotStrategistModel",
      currentValue: "",
      providerId: "",
      modelName: "",
      reason: "model_unspecified",
    };

    const sig1 = getInvalidSlotsSignature([slotA, slotB]);
    const sig2 = getInvalidSlotsSignature([slotB, slotA]);

    expect(sig1).toBe(sig2);
    expect(sig1).toContain("selectedModel:model_not_found");
    expect(sig1).toContain("strategistModel:model_unspecified");
  });

  it("re-validación detecta en caliente cuando un provider pasa a estar deshabilitado", () => {
    const settings = {
      selectedModel: { name: "aion-labs/aion-2.0", provider: "openrouter" },
      executorModel: "openrouter::aion-labs/aion-2.0",
      strategistModel: "openrouter::aion-labs/aion-2.0",
      disabledProviders: ["openrouter"],
    } as unknown as UserSettings;

    const disabled = buildDisabledProviderIds(settings);
    const result = validateModelReferences(settings, {
      ...deps,
      disabledProviders: disabled,
    });

    expect(result.isValid).toBe(false);
    expect(result.invalidSlots.some((s) => s.reason === "provider_disabled")).toBe(true);
  });

  it("re-validación detecta en caliente cuando se solventa un modelo nulo", () => {
    const brokenSettings = {
      selectedModel: { name: "aion-labs/aion-2.0", provider: "openrouter" },
      executorModel: "openrouter::aion-labs/aion-2.0",
      strategistModel: null,
    } as unknown as UserSettings;

    const brokenResult = validateModelReferences(brokenSettings, deps);
    expect(brokenResult.isValid).toBe(false);
    expect(brokenResult.invalidSlots.some((s) => s.slotKey === "strategistModel")).toBe(true);

    const fixedSettings = {
      ...brokenSettings,
      strategistModel: "openrouter::aion-labs/aion-2.0",
    } as unknown as UserSettings;

    const fixedResult = validateModelReferences(fixedSettings, deps);
    expect(fixedResult.isValid).toBe(true);
    expect(fixedResult.invalidSlots).toHaveLength(0);
  });
});
