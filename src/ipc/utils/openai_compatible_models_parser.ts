// =============================================================================
// Parser tolerante de respuestas /models OpenAI-compatible
// =============================================================================
//
// Módulo PURO (sin imports de electron) para poder usarse tanto en el proceso
// main (handlers) como en el renderer (diálogos de proveedores).
//
// Acepta:
//   - Formato estándar OpenAI:  { object: "list", data: [{ id, ... }, ...] }
//   - Variantes de proveedores: array plano [{ id, ... }, ...] o ["id-a", "id-b"]
//     (algunos proxies devuelven la lista sin envoltorio `data`, o ids sueltos).

export interface ParsedModelId {
  id: string;
}

/**
 * Extrae los ids de modelo de una respuesta /models, tolerando variantes.
 * Devuelve `[]` cuando la respuesta es válida pero no contiene modelos
 * (el endpoint respondió pero no devuelve modelos → empty state en UI).
 */
export function parseModelsResponse(data: unknown): ParsedModelId[] {
  const list = Array.isArray(data)
    ? data
    : data !== null &&
        typeof data === "object" &&
        Array.isArray((data as { data?: unknown }).data)
      ? (data as { data: unknown[] }).data
      : [];

  return list
    .map((item) =>
      typeof item === "string"
        ? item
        : item !== null && typeof item === "object"
          ? (item as { id?: unknown }).id
          : undefined,
    )
    .filter((id): id is string => typeof id === "string" && id.length > 0)
    .map((id) => ({ id }));
}
