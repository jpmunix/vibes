import { LargeLanguageModel } from "@/lib/schemas";
import { LanguageModel } from "@/ipc/types";
import { getLanguageModels } from "../shared/language_model_helpers";

export async function findLanguageModel(
  model: LargeLanguageModel,
): Promise<LanguageModel | undefined> {
  const models = await getLanguageModels({
    providerId: model.provider,
  });

  if (model.customModelId) {
    const customModel = models.find(
      (m) => m.type === "custom" && m.id === model.customModelId,
    );
    if (customModel) {
      return customModel;
    }
  }

  // 1. Match exacto (apiName === name)
  let found = models.find((m) => m.apiName === model.name);
  if (found) return found;

  // 2. Pelar prefijos: "provider::model" o "vendor/model" → "model"
  const rawName = model.name.includes("::")
    ? model.name.slice(model.name.lastIndexOf("::") + 2)
    : model.name;
  const bare = rawName.includes("/")
    ? rawName.slice(rawName.lastIndexOf("/") + 1)
    : rawName;

  // 3. Tolerante: apiName pelado, suffix match con "/bare" o "::bare"
  found =
    models.find((m) => m.apiName === bare) ||
    models.find((m) => m.apiName.endsWith(`/${bare}`)) ||
    models.find((m) => m.apiName.endsWith(`::${bare}`));
  if (found) return found;

  // 4. Normalizado (case/puntuación): deepseek-v4-flash == DEEPSEEK_V4.FLASH
  // Compara la parte pelada del apiName (sin prefijo "provider/" o "::").
  const norm = normalizeModelKey(bare);
  const normApiBare = (api: string): string => {
    const s = api.includes("::") ? api.slice(api.lastIndexOf("::") + 2) : api;
    const b = s.includes("/") ? s.slice(s.lastIndexOf("/") + 1) : s;
    return normalizeModelKey(b);
  };
  found = models.find((m) => normApiBare(m.apiName) === norm);
  return found;
}

/**
 * Normaliza un nombre de modelo para comparación tolerante.
 * Misma lógica que normalizeKey en models_dev_service.ts (privada allí).
 */
function normalizeModelKey(s: string): string {
  return s.toLowerCase().replace(/[.\-_ ]+/g, "");
}
