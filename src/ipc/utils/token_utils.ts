import { LargeLanguageModel } from "@/lib/schemas";
import { readSettings } from "../../main/settings";
import { Message } from "@/ipc/types";

import { findLanguageModel } from "./findLanguageModel";
import { findModel, resolveCatalog } from "./models_dev_service";

// Estimate tokens (4 characters per token)
export const estimateTokens = (text: string): number => {
  return Math.ceil(text.length / 4);
};

export const estimateMessagesTokens = (messages: Message[]): number => {
  return messages.reduce(
    (acc, message) => acc + estimateTokens(message.content),
    0,
  );
};

/**
 * Resuelve el contextWindow real del modelo activo (#223).
 *
 * Precedencia:
 *   1. Modelo resuelto vía findLanguageModel (tolerante multi-proveedor) —
 *      incluye el contextWindow que ya trae del catálogo o del provider.
 *   2. Lookup directo al catálogo models.dev (fuente de verdad, card #209) —
 *      findModel busca exacto → metadata → normalizado global.
 *   3. null = desconocido. NUNCA un default falso: el gauge muestra "?" y el
 *      capping de maxOutputTokens no se aplica (sentinela estilo opencode).
 */
export async function getContextWindow(): Promise<number | null> {
  const settings = readSettings();

  const modelOption = await findLanguageModel(settings.selectedModel);
  if (modelOption?.contextWindow) return modelOption.contextWindow;

  // Fallback: consulta directa al catálogo (aunque la lista de modelos del
  // provider no lo haya resuelto — p. ej. openrouter como gateway).
  try {
    const catalog = await resolveCatalog();
    const hit = findModel(
      catalog,
      settings.selectedModel.provider,
      settings.selectedModel.name,
    );
    const cw = hit.model?.limit?.context ?? hit.meta?.limit?.context ?? null;
    if (cw) return cw;
  } catch {
    // catálogo no disponible (offline sin snapshot) → seguimos a null
  }

  return null;
}

export async function getMaxTokens(
  model: LargeLanguageModel,
): Promise<number | undefined> {
  const modelOption = await findLanguageModel(model);
  return modelOption?.maxOutputTokens ?? undefined;
}

export async function getTemperature(
  model: LargeLanguageModel,
): Promise<number> {
  // Always use the user-configured value from the Inference Tuner (default: 1.0)
  const settings = readSettings();
  return settings.inferenceTemperature ?? 0.2;
}
