/**
 * Context debug — persistencia a disco (JSONL append-only).
 *
 * Fuente de verdad del log de contexto: un archivo `.log` en `userData` donde
 * cada línea es una entrada `ContextDebugEntry` serializada (JSONL). El main
 * process es de larga vida, así que este archivo sobrevive a que la ventana de
 * debug se cierre y a reinicios de la app: munix entra y se encuentra con el
 * histórico acumulado, que es lo que necesita para un análisis largo y
 * sostenido a lo largo de meses.
 *
 * Reglas:
 * - Append-only, fire-and-forget, no bloquea el loop: si el disco falla, se
 *   traga el error (es debug temporal, no puede tumbar un turno).
 * - El archivo solo crece mientras `debugContext` está ON (= ventana abierta);
 *   ahí el core genera el payload (systemPrompt + messages).
 * - Sin límite de tamaño ni de entradas: munix lo limpia a mano (clear) o lo
 *   abre en su editor.
 *
 * Adicionalmente, se puede exportar a un `.json` con un array JSON válido
 * (no JSONL) para abrir en cualquier viewer/parser JSON sin tener que
 * interpretar JSONL.
 *
 * P1: vive en Vibes (carcasa), no en vibes-core. El runtime no toca disco para
 * esto; solo emite el evento y la carcasa decide si lo persiste.
 */

import { app, shell } from "electron";
import log from "electron-log";
import * as path from "node:path";
import { appendFile, readFile, rm, writeFile } from "node:fs/promises";
import type { ContextDebugEntry } from "../types/system";

const logger = log.scope("context-debug-log");

/** Nombre del archivo del log de contexto (en userData). */
export function getContextDebugLogPath(): string {
  return path.join(app.getPath("userData"), "context-debug.log");
}

/**
 * Añade una entrada al log (una línea JSON). Fire-and-forget: el caller NO
 * debe awaitar ni manejar el rechazo (un fallo de disco no puede tumbar un
 * turno en curso).
 */
export function appendContextDebugEntry(
  entry: ContextDebugEntry,
): void {
  const line = JSON.stringify(entry) + "\n";
  appendFile(getContextDebugLogPath(), line, "utf8").catch((err) => {
    logger.warn(
      `[ContextDebugLog] append failed: ${(err as Error).message}`,
    );
  });
}

/**
 * Lee el log completo desde disco (para restaurar el buffer al abrir la
 * ventana). Devuelve `[]` si el archivo no existe o está vacío. Las líneas
 * corruptas (parciales, p.ej. corte por crash) se saltan sin lanzar.
 */
export async function readContextDebugEntries(): Promise<
  ContextDebugEntry[]
> {
  const filePath = getContextDebugLogPath();
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch {
    // No existe (todavía) o no se puede leer → histórico vacío.
    return [];
  }
  const out: ContextDebugEntry[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed) as ContextDebugEntry);
    } catch {
      // Línea corrupta (crash a mitad de write) → se salta.
    }
  }
  return out;
}

/** Ruta del JSON exportado (array válido, prettified). */
function getContextDebugJsonPath(): string {
  return path.join(app.getPath("userData"), "context-debug.json");
}

/**
 * Exporta el histórico completo a un archivo `.json` con un ARRAY JSON válido
 * (no JSONL): `[ {...}, {...} ]` prettificado con 2 espacios. Ese archivo sí
 * se puede abrir con cualquier parser/viewer de JSON. Devuelve la ruta.
 */
export async function exportContextDebugJson(): Promise<string | null> {
  const entries = await readContextDebugEntries();
  const jsonPath = getContextDebugJsonPath();
  try {
    await writeFile(jsonPath, JSON.stringify(entries, null, 2), "utf8");
    return jsonPath;
  } catch (err) {
    logger.warn(
      `[ContextDebugLog] export failed: ${(err as Error).message}`,
    );
    return null;
  }
}

/**
 * Exporta a `.json` válido y lo abre con el visor/editor predeterminado del
 * sistema. Devuelve true si se abrió, false si no (o si no hay entradas).
 */
export async function openContextDebugJson(): Promise<boolean> {
  const jsonPath = await exportContextDebugJson();
  if (!jsonPath) return false;
  try {
    const err = await shell.openPath(jsonPath);
    return !err;
  } catch {
    return false;
  }
}

/**
 * Borra el log de disco (botón "Clear" de la ventana). El archivo se crea de
 * nuevo al próxima entrada. `force` no hace falta (rm sin force falla suave si
 * no existe).
 */
export async function clearContextDebugLog(): Promise<void> {
  try {
    await rm(getContextDebugLogPath(), { force: true });
  } catch (err) {
    logger.warn(
      `[ContextDebugLog] clear failed: ${(err as Error).message}`,
    );
  }
}
