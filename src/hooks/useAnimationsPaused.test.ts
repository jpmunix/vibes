/**
 * Blindaje #VIBES-202 (rendimiento) — lógica de pausa de animaciones.
 *
 * shouldPauseAnimations encapsula el "punto intermedio":
 * animaciones presentes mientras las miras, coste ~0 cuando no las miras.
 *
 * Prueba la función pura sin montar el hook (coherente con el patrón de
 * tests de este repo: funciones exportadas, no render).
 */
import { describe, expect, it } from "vitest";
import { shouldPauseAnimations } from "./useAnimationsPaused";

describe("shouldPauseAnimations (#VIBES-202)", () => {
  it("ventana oculta → pausar SIEMPRE (minimizada / otra workspace)", () => {
    expect(
      shouldPauseAnimations({
        isDocumentHidden: true,
        hasWindowFocus: true,
        hasActiveStream: false,
      }),
    ).toBe(true);
    // Aunque haya streaming activo, si no se ve, no tiene sentido animar.
    expect(
      shouldPauseAnimations({
        isDocumentHidden: true,
        hasWindowFocus: true,
        hasActiveStream: true,
      }),
    ).toBe(true);
  });

  it("visible + con foco + sin streaming → NO pausar (primer plano)", () => {
    expect(
      shouldPauseAnimations({
        isDocumentHidden: false,
        hasWindowFocus: true,
        hasActiveStream: false,
      }),
    ).toBe(false);
  });

  it("visible + con foco + streaming activo → NO pausar (se está mirando)", () => {
    expect(
      shouldPauseAnimations({
        isDocumentHidden: false,
        hasWindowFocus: true,
        hasActiveStream: true,
      }),
    ).toBe(false);
  });

  it("visible + sin foco + streaming activo → NO pausar (vigilando de lado)", () => {
    expect(
      shouldPauseAnimations({
        isDocumentHidden: false,
        hasWindowFocus: false,
        hasActiveStream: true,
      }),
    ).toBe(false);
  });

  it("visible + sin foco + sin streaming → pausar (reposo real = 0% CPU)", () => {
    expect(
      shouldPauseAnimations({
        isDocumentHidden: false,
        hasWindowFocus: false,
        hasActiveStream: false,
      }),
    ).toBe(true);
  });
});
