import { useEffect, useState } from "react";
import { useAtomValue } from "jotai";
import { isStreamingByIdAtom } from "@/atoms/chatAtoms";

/**
 * Decisión de pausa de animaciones (función pura, exportada para testear).
 *
 * Lógica del "punto intermedio" (#VIBES-202):
 * - Si la ventana/documento está oculto (minimizado, otra workspace) → pausar
 *   SIEMPRE (el usuario no está mirando, no hay razón para producir frames).
 * - Si la ventana no tiene foco PERO hay un streaming activo → NO pausar
 *   (el usuario puede estar vigilando el progreso de lado).
 * - Si no hay foco y no hay streaming → pausar (reposo real = 0% CPU).
 */
export function shouldPauseAnimations({
  isDocumentHidden,
  hasWindowFocus,
  hasActiveStream,
}: {
  isDocumentHidden: boolean;
  hasWindowFocus: boolean;
  hasActiveStream: boolean;
}): boolean {
  if (isDocumentHidden) return true;
  if (hasActiveStream) return false;
  return !hasWindowFocus;
}

/**
 * Hook: ¿deben pausarse las animaciones ahora mismo?
 *
 * Escucha los eventos de visibilidad y foco de la ventana, y lee el estado
 * global de streaming (jotai). Devuelve `true` cuando no hay razón para
 * seguir produciendo frames (app en reposo / oculta).
 *
 * Uso:
 *   const paused = useAnimationsPaused();
 *   // Si paused, renderiza el frame estático / aplica animation-play-state.
 */
export function useAnimationsPaused(): boolean {
  const [visibility, setVisibility] = useState(() => !document.hidden);
  const [windowFocus, setWindowFocus] = useState(() => document.hasFocus());
  const isStreamingById = useAtomValue(isStreamingByIdAtom);

  useEffect(() => {
    const onVisibility = () => setVisibility(!document.hidden);
    const onFocus = () => setWindowFocus(true);
    const onBlur = () => setWindowFocus(false);

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  const hasActiveStream = Array.from(isStreamingById.values()).some(Boolean);

  return shouldPauseAnimations({
    isDocumentHidden: !visibility,
    hasWindowFocus: windowFocus,
    hasActiveStream,
  });
}
