/**
 * Blindaje G18 (UI coherencia) — regla "congelado".
 *
 * isTodoSpinning encapsula la decisión de la UI: una tarea `in_progress`
 * solo "gira" mientras el chat está en activo (isStreaming). Cuando la
 * conversación se detiene, el spinner se congela para no mentirle al
 * usuario (el LLM ya no puede cambiar nada hasta la siguiente ronda).
 *
 * Prueba la función pura sin montar el componente (coherente con el patrón
 * de tests de este repo: funciones exportadas, no render).
 */

import { describe, expect, it } from "vitest";
import { isTodoSpinning } from "./TodoList";

describe("TodoList.isTodoSpinning (blindaje 'congelado')", () => {
  it("in_progress + chat activo → gire (spinner en movimiento)", () => {
    expect(isTodoSpinning("in_progress", true)).toBe(true);
  });

  it("in_progress + chat detenido → se congela (spinner estático)", () => {
    expect(isTodoSpinning("in_progress", false)).toBe(false);
  });

  it("completed nunca gira, ni activa ni detenida", () => {
    expect(isTodoSpinning("completed", true)).toBe(false);
    expect(isTodoSpinning("completed", false)).toBe(false);
  });

  it("pending nunca gira (círculo punteado, neutro), ni activa ni detenida", () => {
    expect(isTodoSpinning("pending", true)).toBe(false);
    expect(isTodoSpinning("pending", false)).toBe(false);
  });

  it("cancelled nunca gira", () => {
    expect(isTodoSpinning("cancelled", true)).toBe(false);
    expect(isTodoSpinning("cancelled", false)).toBe(false);
  });
});
