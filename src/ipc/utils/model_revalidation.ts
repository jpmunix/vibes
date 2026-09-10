/**
 * Model Revalidation — re-validación en caliente de los slots de modelo (card #242)
 *
 * El validador de arranque (`validateModelSettings`) solo corría al iniciar la
 * app. Resultado: si el usuario rompía un slot DESPUÉS del arranque (desactivar
 * un proveedor en Ajustes, borrar un custom provider, dejar un modelo a null
 * desde el panel de admin), la app seguía funcionando como si nada hasta el
 * siguiente reinicio. La modal bloqueante nunca aparecía.
 *
 * Este módulo añade el disparo en caliente: se suscribe a los cambios del
 * `preferencesCache` (que es por donde pasan TODAS las escrituras de ajustes,
 * incluidas las de `writeSettings` y `deleteCustomProvider`) y re-valida con
 * debounce cuando cambia una clave relevante.
 *
 * ⚠️ DECISIÓN EN PIEDRA (munix): cero reescritura automática de settings.
 * Aquí NO se arregla nada: solo se vuelve a validar y se emite el resultado para
 * que la UI levante (o baje) la modal bloqueante.
 */
import log from "electron-log";

const logger = log.scope("model_revalidation");

/**
 * Claves de preferencias cuyo cambio puede romper (o arreglar) un slot de
 * modelo. Cualquier otra clave (tema, idioma, zoom, estado de ventana…) se
 * ignora para no re-validar por cada toggle cosmético.
 *
 * Dos familias:
 *   1. Los SLOTS en sí: el valor del modelo asignado a cada hueco.
 *   2. El CONTEXTO que decide si ese valor es válido: proveedores disponibles,
 *      cuáles están apagados y qué credenciales hay.
 */
export const MODEL_REVALIDATION_KEYS: ReadonlySet<string> = new Set([
  // ── Slots ──────────────────────────────────────────────────────────────
  // (selectedModel se gestiona directamente en el selector del chat, no bloquea)
  "strategistModel",
  "executorModel",
  "fallbackModel",
  "memoriesRouterModelV2",
  // ── Contexto de validez ────────────────────────────────────────────────
  // `memoriesEnabled` decide si los slots de memorias son obligatorios.
  "memoriesEnabled",
  // Alta/baja/edición de proveedores custom.
  "customProviders",
  // Toggle de OpenRouter y de los custom providers.
  "disabledProviders",
  // Toggle propio de Ollama (no vive en `disabledProviders`).
  "ollamaEnabled",
  // Credenciales por proveedor: sin key el proveedor no sirve nada.
  "providerSettings",
  // Proveedor activo del selector.
  "activeProviderId",
]);

/**
 * ¿Un cambio en estas claves obliga a re-validar?
 *
 * Función pura y exportada para poder testearla sin Electron, sin DB y sin
 * timers (regla §1.1: toda pieza nueva lleva su test).
 *
 * Acepta una clave suelta o un lote: `preferencesCache.setMany` notifica una
 * vez por clave, y `writeSettings` puede volcar decenas de claves de golpe en
 * una sola operación de ajustes.
 */
export function shouldRevalidate(keys: string | Iterable<string>): boolean {
  if (typeof keys === "string") {
    return MODEL_REVALIDATION_KEYS.has(keys);
  }
  for (const key of keys) {
    if (MODEL_REVALIDATION_KEYS.has(key)) return true;
  }
  return false;
}

/**
 * Revalidador con debounce.
 *
 * Por qué debounce y no validación inmediata: una sola acción de Ajustes
 * dispara varias escrituras seguidas (`setUserSettings` → `decomposeAndPersist`
 * → `setMany` notifica POR CADA CLAVE, y el propio handler hace más escrituras
 * detrás). Validar en cada notificación lanzaría N validaciones concurrentes,
 * cada una leyendo el catálogo de models.dev y las cachés de custom providers
 * del disco. Se agrupan en una sola pasada tras `delayMs` de silencio.
 *
 * Trailing-edge: se valida con el estado YA asentado, no con el intermedio.
 *
 * Devuelve `{ schedule, cancel }`. `cancel` existe para poder desuscribir en
 * tests y en el teardown del proceso principal sin dejar timers colgando.
 */
export function createDebouncedRevalidator(
  fn: () => unknown | Promise<unknown>,
  delayMs = 400,
): { schedule: () => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** Evita solapar dos validaciones si una tarda más que el propio debounce. */
  let inFlight = false;

  const cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const schedule = () => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (inFlight) return;
      inFlight = true;
      // `fn` puede ser async (validar toca disco y red). No se awaitea a
      // propósito: el listener del preferencesCache es síncrono y no debe
      // bloquear la escritura de ajustes. El error se caza y se loggea — un
      // fallo de re-validación jamás debe tirar la app.
      Promise.resolve()
        .then(() => fn())
        .catch((err: any) => {
          logger.warn(
            `[ModelRevalidation] Hot re-validation failed (non-fatal): ${err?.message ?? err}`,
          );
        })
        .finally(() => {
          inFlight = false;
        });
    }, delayMs);
  };

  return { schedule, cancel };
}

/**
 * Suscribe la re-validación en caliente a los cambios de preferencias.
 *
 * Se llama UNA vez desde el arranque del proceso principal, después de
 * registrar los handlers (igual que el resto de wiring de IPC). Devuelve la
 * función de desuscripción.
 *
 * Los imports de `validateModelSettings` y `preferencesCache` son dinámicos:
 * `model_validator` tira de Electron (`BrowserWindow`) y de la DB remota, y
 * este módulo debe poder importarse en tests de unidad sin arrastrar todo eso.
 */
export async function startModelRevalidation(): Promise<() => void> {
  const { preferencesCache } = await import("../../main/preferences-cache");
  const { validateModelSettings } = await import("./model_validator");

  const revalidator = createDebouncedRevalidator(() => validateModelSettings());

  const unsubscribe = preferencesCache.onChange((key: string) => {
    if (!shouldRevalidate(key)) return;
    revalidator.schedule();
  });

  logger.info(
    `[ModelRevalidation] Hot re-validation armed (debounce 400ms, ${MODEL_REVALIDATION_KEYS.size} watched keys)`,
  );

  return () => {
    revalidator.cancel();
    unsubscribe();
  };
}
