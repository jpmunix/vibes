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
 * Decisión de pausa de polling en reposo (#VIBES-204).
 *
 * A diferencia de las animaciones (que pueden seguir con foco perdido si hay
 * streaming visible), el polling IPC es trabajo puro: si el usuario no está
 * mirando y no hay streaming activo, cada tick es CPU/IPC quemada sin nadie
 * mirando. Reglas:
 * - Documento oculto → pausar SIEMPRE.
 * - Sin foco + streaming activo → mantener polling.
 * - Sin foco + sin streaming → pausar.
 */
export function shouldPausePolling({
  isDocumentHidden,
  hasWindowFocus,
  hasActiveStream,
}: {
  isDocumentHidden: boolean;
  hasWindowFocus: boolean;
  hasActiveStream: boolean;
}): boolean {
  return shouldPauseAnimations({ isDocumentHidden, hasWindowFocus, hasActiveStream });
}

/**
 * Hook: ¿debe pausarse un interval de polling cuando la app está en reposo?
 *
 * #VIBES-204: ServerControlButton hacía polling IPC cada 2s incondicionalmente.
 * Ahora se pausa cuando la ventana está oculta o sin foco (salvo streaming).
 * El primer fetch ocurre siempre al montar; los ticks posteriores se saltan
 * mientras paused=true. Al volver el foco, fetchStatus() se re-ejecuta para
 * refrescar sin esperar al siguiente tick.
 *
 * Uso:
 *   const paused = usePollingPaused();
 *   useEffect(() => {
 *     fetchStatus();
 *     if (!paused) {
 *       const id = setInterval(fetchStatus, 2000);
 *       return () => clearInterval(id);
 *     }
 *   }, [paused, fetchStatus]);
 */
export function usePollingPaused(): boolean {
  return useAnimationsPaused();
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
