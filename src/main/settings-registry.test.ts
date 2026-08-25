import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS } from "./settings-defaults";
import { SETTINGS_REGISTRY } from "./settings-registry";

/**
 * Card #200 — requerimiento bloqueante de munix:
 * "Si defino un setting debe forzarnos a definir su reset oficial."
 *
 * Red de seguridad del registry tipado. El `satisfies` de settings-registry.ts
 * ya rompe la compilación si falta una clave; este test da el mensaje claro y
 * detecta también claves obsoletas (registradas pero ya sin default).
 */
describe("settings-registry: exhaustividad del reset", () => {
  const registryKeys = Object.keys(SETTINGS_REGISTRY);
  const defaultKeys = Object.keys(DEFAULT_SETTINGS);

  it("todo setting con default tiene su reset oficial registrado", () => {
    const missing = defaultKeys.filter((k) => !registryKeys.includes(k));
    expect(missing, `Settings sin reset registrado: ${missing.join(", ")}`).toEqual([]);
  });

  it("no hay claves obsoletas en el registry (claves sin default)", () => {
    const stale = registryKeys.filter((k) => !defaultKeys.includes(k));
    expect(stale, `Registry con claves obsoletas: ${stale.join(", ")}`).toEqual([]);
  });

  it("toda entrada del registry tiene un reset válido", () => {
    for (const [key, entry] of Object.entries(SETTINGS_REGISTRY)) {
      const reset = entry.reset;
      if (reset.kind === "kv") {
        // válido: borrar la clave del KV → default de fábrica
      } else if (reset.kind === "fn") {
        expect(typeof reset.fn, `reset fn de "${key}" debe ser función`).toBe("function");
      } else if (reset.kind === "skip") {
        expect(reset.reason, `skip de "${key}" debe llevar razón`).toBeTruthy();
      } else {
        // exhaustividad del union type: si alguien añade un kind nuevo sin
        // manejarlo, este test se rompe (el registry tampoco lo resetea).
        throw new Error(`kind de reset desconocido para "${key}": ${JSON.stringify(reset)}`);
      }
    }
  });

  it("los settings de runtime/sesión están marcados como skip (no se tocan)", () => {
    const skipKeys = Object.entries(SETTINGS_REGISTRY)
      .filter(([, e]) => e.reset.kind === "skip")
      .map(([k]) => k);
    // windowState / isRunning / hasRunBefore / lastKnownPerformance son estado
    // de máquina, NO config de usuario → skip explícito.
    for (const k of ["windowState", "isRunning", "hasRunBefore", "lastKnownPerformance"]) {
      expect(skipKeys, `"${k}" debería estar en skip`).toContain(k);
    }
  });
});
