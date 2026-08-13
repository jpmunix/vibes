// =============================================================================
// Verificación de proveedores OpenAI-compatible (GET /models)
// =============================================================================
//
// Lógica extraída del handler `verifyCustomProvider` para poder testearla
// con fixtures de /models sin red (se inyecta el `fetcher`).
//
// Devuelve `{ ok, count, models }` (mantiene `count` por compat con la UI
// actual) o `{ ok: false, error }` con el mensaje de error de siempre.

import { parseModelsResponse } from "./openai_compatible_models_parser";

export interface VerifyCustomProviderResult {
  ok: boolean;
  count?: number;
  models?: { id: string }[];
  error?: string;
}

/**
 * Verifica un endpoint OpenAI-compatible haciendo GET {baseUrl}/models.
 *
 * @param apiBaseUrl   URL base (se le quitan las barras finales)
 * @param apiKey       API key opcional (se envía como Bearer)
 * @param fetcher      fetch inyectable (global fetch en producción, mock en tests)
 * @param onRawData    callback opcional con la respuesta JSON cruda (para logs)
 */
export async function verifyCustomProviderEndpoint(
  apiBaseUrl: string,
  apiKey: string | undefined,
  fetcher: typeof fetch,
  onRawData?: (data: unknown) => void,
): Promise<VerifyCustomProviderResult> {
  try {
    const url = apiBaseUrl.replace(/\/+$/, "");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
    const response = await fetcher(`${url}/models`, {
      method: "GET",
      headers,
    });
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    onRawData?.(data);

    const models = parseModelsResponse(data);
    return { ok: true, count: models.length, models };
  } catch (error: any) {
    return { ok: false, error: error.message };
  }
}
