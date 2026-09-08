/**
 * Model Validator — Boot-time & runtime validation (card #242)
 *
 * Valida que las referencias a modelos configuradas en la app apunten a
 * proveedores y modelos existentes:
 *   - Provider local (ollama/lmstudio)   → formato válido; nunca bloquea por red.
 *   - Provider custom (custom::id)       → valida que el provider esté configurado
 *                                          en settings.customProviders y que el modelo
 *                                          exista en su caché si está disponible.
 *   - Provider nativo / OpenRouter       → contra el catálogo de models.dev.
 *   - Custom agents con modelo estático  → misma validación por referencia.
 *
 * ⚠️ DECISIÓN EN PIEDRA (munix):
 * CERO reescritura automática de settings. Si un modelo no existe o su proveedor
 * fue borrado, NO se aplican fallbacks ni se llama a writeSettings.
 * Se reportan los slots inválidos para que la UI presente una modal bloqueante
 * que obligue al usuario a reasignar cada slot antes de chatear.
 */
import log from "electron-log";
import { BrowserWindow } from "electron";
import { readSettings } from "../../main/settings";
import { getRemoteDb } from "../../db/remote";
import * as remoteSchema from "../../db/remote-schema";
import { eq } from "drizzle-orm";
import { safeSend } from "./safe_sender";
import {
  CLOUD_PROVIDERS,
  LOCAL_PROVIDERS as HARDCODED_LOCAL_PROVIDERS,
  CUSTOM_PROVIDER_PREFIX,
} from "../shared/language_model_constants";
import {
  MODEL_PROVIDER_SEPARATOR,
  type UserSettings,
} from "../../lib/schemas";
import {
  parseModelReference,
} from "./model_reference";
import {
  resolveCatalog,
  isModelKnown,
  type Catalog,
} from "./models_dev_service";
// Fuente única del naming de las cachés de modelos por provider (card #242).
import {
  getCacheFilePath,
  CACHE_VERSION,
} from "./openai_compatible_models_service";
import * as fs from "fs/promises";

const logger = log.scope("model_validator");

export const LOCAL_PROVIDERS = new Set(["ollama", "lmstudio"]);

export type ModelSlotKey =
  | "selectedModel"
  | "strategistModel"
  | "executorModel"
  | "fallbackModel"
  | "memoriesSynthesisModelV2"
  | "memoriesRouterModelV2"
  | `customAgent:${number}`;

/**
 * Prefijo del namespace i18n donde viven los nombres visibles de los slots.
 * Debe existir en `messages.es.ts` y `messages.en.ts` (paridad garantizada por
 * el test de i18n).
 */
export const SLOT_LABEL_KEY_PREFIX = "models.validation.slots";

export interface InvalidModelSlot {
  slotKey: ModelSlotKey;
  /**
   * Clave i18n del nombre visible del slot (p. ej.
   * `models.validation.slots.executorModel`).
   *
   * ⚠️ Frontera P1 (§1.6 + §1.15): el backend NO decide idioma. Antes esto era
   * un string en español hardcodeado que la modal pintaba tal cual, lo que
   * rompía la app en inglés. Ahora el backend nombra el slot y la carcasa
   * traduce.
   */
  labelKey: string;
  /** Parámetros de interpolación para `labelKey` (p. ej. el nombre del agente). */
  labelParams?: Record<string, string>;
  currentValue: string;
  providerId: string;
  modelName: string;
  /**
   * Motivo por el que el slot está roto.
   *
   * `provider_disabled` (card #242): el proveedor EXISTE y el modelo existe en
   * su catálogo, pero el usuario lo ha desactivado en Ajustes → no puede servir
   * peticiones. Antes el validador no miraba `disabledProviders` en absoluto y
   * reportaba `isValid: true` con todos los slots apuntando a proveedores
   * apagados: la UI pintaba el placeholder "Seleccionar…" (el valor no está en
   * la lista, porque `useMultiProviderModels` filtra los desactivados) mientras
   * el backend juraba que todo estaba bien. Nadie veía nada roto.
   */
  reason:
    | "provider_missing"
    | "provider_disabled"
    | "model_not_found"
    | "model_unspecified";
}

export interface ValidationDeps {
  catalog: Catalog;
  /** Nombres de custom models legacy en la DB (tabla language_models) */
  customModelNames: Set<string>;
  /** IDs de custom providers configurados (ej. "custom::paretoinference" o "paretoinference") */
  configuredProviderIds: Set<string>;
  /**
   * IDs de proveedores que el usuario ha DESACTIVADO en Ajustes (card #242).
   *
   * Se construye desde `settings.disabledProviders` + `ollama` cuando
   * `settings.ollamaEnabled === false` (Ollama no vive en `disabledProviders`:
   * tiene su propio toggle — ver `OllamaProviderSection`). Contiene las dos
   * variantes del id custom (con y sin prefijo `custom::`) para que el lookup
   * sea tolerante, igual que `configuredProviderIds`.
   *
   * Un slot que apunta a un proveedor de esta lista está ROTO aunque el modelo
   * exista en su catálogo: nadie va a poder servir la petición.
   */
  disabledProviders?: Set<string>;
  /** Modelos cacheados conocidos por providerId */
  providerModelMap?: Map<string, Set<string>>;
  /** Custom agents registrados */
  customAgents?: Array<{
    id: number;
    name: string;
    modelSource?: string;
    model?: string | null;
  }>;
}

export interface ModelValidationResult {
  isValid: boolean;
  invalidSlots: InvalidModelSlot[];
}

/**
 * Normaliza un providerId a su forma canónica `custom::<id>`.
 *
 * `configuredProviderIds` contiene deliberadamente ambas variantes (con y sin
 * prefijo) para que el lookup sea tolerante, pero el mapa de modelos cacheados
 * debe indexarse SIEMPRE con una sola forma o el lookup se vuelve una lotería
 * (card #242).
 */
function toCanonicalCustomId(providerId: string): string {
  return providerId.startsWith(CUSTOM_PROVIDER_PREFIX)
    ? providerId
    : `${CUSTOM_PROVIDER_PREFIX}${providerId}`;
}

/**
 * Normaliza un providerId eliminando o agregando el prefijo custom:: si aplica
 * para comparar con configuredProviderIds.
 */
function isCustomProviderConfigured(
  providerId: string,
  configuredProviderIds: Set<string>,
): boolean {
  if (configuredProviderIds.has(providerId)) return true;
  if (providerId.startsWith(CUSTOM_PROVIDER_PREFIX)) {
    const raw = providerId.slice(CUSTOM_PROVIDER_PREFIX.length);
    return configuredProviderIds.has(raw);
  }
  return configuredProviderIds.has(`${CUSTOM_PROVIDER_PREFIX}${providerId}`);
}

/**
 * ¿El usuario ha DESACTIVADO este proveedor en Ajustes? (card #242)
 *
 * Tolerante al prefijo `custom::` igual que `isCustomProviderConfigured`: el
 * mismo proveedor puede aparecer como `custom::minube` o `minube` según quién
 * lo escribiera, y una desactivación a medias sería un falso negativo.
 */
function isProviderDisabled(
  providerId: string,
  disabledProviders: Set<string> | undefined,
): boolean {
  if (!disabledProviders || disabledProviders.size === 0) return false;
  if (disabledProviders.has(providerId)) return true;
  if (providerId.startsWith(CUSTOM_PROVIDER_PREFIX)) {
    const raw = providerId.slice(CUSTOM_PROVIDER_PREFIX.length);
    if (disabledProviders.has(raw)) return true;
    return disabledProviders.has(toCanonicalCustomId(raw));
  }
  return disabledProviders.has(`${CUSTOM_PROVIDER_PREFIX}${providerId}`);
}

/**
 * Determina si el proveedor existe / está configurado.
 */
function isProviderKnown(
  providerId: string,
  configuredProviderIds: Set<string>,
  catalog: Catalog,
): boolean {
  if (LOCAL_PROVIDERS.has(providerId) || (HARDCODED_LOCAL_PROVIDERS as Record<string, unknown>)[providerId]) {
    return true;
  }
  if ((CLOUD_PROVIDERS as Record<string, unknown>)[providerId] || providerId === "openrouter") {
    return true;
  }
  if (providerId.startsWith("custom::") || providerId === "custom") {
    return isCustomProviderConfigured(providerId, configuredProviderIds);
  }
  // Proveedores nativos en el catálogo de models.dev
  if (catalog.providers && catalog.providers[providerId]) {
    return true;
  }
  return false;
}

/**
 * ¿El modelo es conocido para el provider dado?
 * - Desactivado por el usuario → SIEMPRE inválido (no es un problema de red,
 *   es una decisión de configuración que deja el slot sin ruta de salida).
 * - Local → siempre true (no bloqueamos por caída de red/daemon).
 * - Custom provider → si tenemos caché con modelos, validamos existencia; si no hay caché, no bloqueamos por red.
 * - Cloud/Nativo/OpenRouter → contra catálogo de models.dev.
 */
function isModelValidForProvider(
  catalog: Catalog,
  customModelNames: Set<string>,
  configuredProviderIds: Set<string>,
  providerModelMap: Map<string, Set<string>> | undefined,
  providerId: string,
  name: string,
  disabledProviders?: Set<string>,
): {
  valid: boolean;
  reason?: "provider_missing" | "provider_disabled" | "model_not_found";
} {
  if (!isProviderKnown(providerId, configuredProviderIds, catalog)) {
    return { valid: false, reason: "provider_missing" };
  }

  // Desactivado por el usuario en Ajustes → roto. Se comprueba ANTES del
  // early-return de locales: apagar Ollama (`ollamaEnabled: false`) es una
  // decisión de configuración explícita, no una caída de red/daemon, así que
  // un slot que apunta a un modelo local con Ollama apagado NO tiene salida.
  if (isProviderDisabled(providerId, disabledProviders)) {
    return { valid: false, reason: "provider_disabled" };
  }

  // Locales: no bloqueamos por disponibilidad de red / daemon
  if (LOCAL_PROVIDERS.has(providerId) || (HARDCODED_LOCAL_PROVIDERS as Record<string, unknown>)[providerId]) {
    return { valid: true };
  }

  // Custom models registrados en la DB legacy
  if (customModelNames.has(name)) {
    return { valid: true };
  }

  // Custom provider configurado
  if (providerId.startsWith(CUSTOM_PROVIDER_PREFIX) || providerId === "custom") {
    if (!isCustomProviderConfigured(providerId, configuredProviderIds)) {
      return { valid: false, reason: "provider_missing" };
    }
    // El mapa se indexa SIEMPRE con la forma canónica `custom::<id>`
    // (ver loadCachedCustomProviderModels), así que basta un lookup.
    if (providerModelMap) {
      const modelsForProvider = providerModelMap.get(
        toCanonicalCustomId(providerId),
      );

      if (modelsForProvider && modelsForProvider.size > 0) {
        if (modelsForProvider.has(name)) {
          return { valid: true };
        }
        return { valid: false, reason: "model_not_found" };
      }
    }
    // Sin caché (provider recién añadido o nunca consultado) → no bloqueamos:
    // decisión en piedra de munix, jamás bloquear por falta de red.
    return { valid: true };
  }

  // Catálogo vacío (sin red y sin snapshot) → no bloquear
  if (!catalog.providers || Object.keys(catalog.providers).length === 0) {
    return { valid: true };
  }

  const knownInCatalog = isModelKnown(catalog, providerId, name);
  if (!knownInCatalog) {
    return { valid: false, reason: "model_not_found" };
  }

  return { valid: true };
}

/**
 * Valida TODAS las referencias a modelos configuradas.
 * Función pura (sin I/O, sin mutaciones de settings).
 */
export function validateModelReferences(
  settings: UserSettings,
  deps: ValidationDeps,
): ModelValidationResult {
  const {
    catalog,
    customModelNames,
    configuredProviderIds,
    providerModelMap,
    customAgents,
    disabledProviders,
  } = deps;

  const invalidSlots: InvalidModelSlot[] = [];

  // Helper para verificar una referencia genérica
  const checkSlot = (
    slotKey: ModelSlotKey,
    labelKey: string,
    rawReference: string | undefined | null,
    options?: {
      defaultProvider?: string;
      labelParams?: Record<string, string>;
      optional?: boolean;
    },
  ) => {
    const defaultProvider = options?.defaultProvider ?? "openrouter";
    const labelParams = options?.labelParams;
    const isOptional = options?.optional ?? false;

    if (!rawReference || typeof rawReference !== "string" || !rawReference.trim()) {
      if (!isOptional) {
        invalidSlots.push({
          slotKey,
          labelKey,
          ...(labelParams ? { labelParams } : {}),
          currentValue: rawReference ? String(rawReference) : "null / empty",
          providerId: "",
          modelName: "",
          reason: "model_unspecified",
        });
      }
      return;
    }

    const parsed = parseModelReference(rawReference, defaultProvider);
    if (!parsed) {
      invalidSlots.push({
        slotKey,
        labelKey,
        ...(labelParams ? { labelParams } : {}),
        currentValue: rawReference,
        providerId: defaultProvider,
        modelName: rawReference,
        reason: "model_not_found",
      });
      return;
    }

    const check = isModelValidForProvider(
      catalog,
      customModelNames,
      configuredProviderIds,
      providerModelMap,
      parsed.provider,
      parsed.model,
      disabledProviders,
    );

    if (!check.valid) {
      invalidSlots.push({
        slotKey,
        labelKey,
        ...(labelParams ? { labelParams } : {}),
        currentValue: rawReference,
        providerId: parsed.provider,
        modelName: parsed.model,
        reason: check.reason || "model_not_found",
      });
    }
  };

  // 1. selectedModel (Chat principal)
  if (!settings.selectedModel?.name?.trim()) {
    invalidSlots.push({
      slotKey: "selectedModel",
      labelKey: `${SLOT_LABEL_KEY_PREFIX}.selectedModel`,
      currentValue: settings.selectedModel?.name || "null / empty",
      providerId: settings.selectedModel?.provider || "",
      modelName: "",
      reason: "model_unspecified",
    });
  } else {
    const sm = settings.selectedModel;
    const provider = sm.provider || "openrouter";
    const check = isModelValidForProvider(
      catalog,
      customModelNames,
      configuredProviderIds,
      providerModelMap,
      provider,
      sm.name,
      disabledProviders,
    );
    if (!check.valid) {
      invalidSlots.push({
        slotKey: "selectedModel",
        labelKey: `${SLOT_LABEL_KEY_PREFIX}.selectedModel`,
        currentValue:
          provider === "openrouter"
            ? sm.name
            : `${provider}${MODEL_PROVIDER_SEPARATOR}${sm.name}`,
        providerId: provider,
        modelName: sm.name,
        reason: check.reason || "model_not_found",
      });
    }
  }

  // 2. Modelo Ejecutor (tareas ligeras, títulos, mockups, commits) — OBLIGATORIO
  checkSlot(
    "executorModel",
    `${SLOT_LABEL_KEY_PREFIX}.executorModel`,
    settings.executorModel,
  );

  // 3. Modelo Estratega (asistente de prompts, resúmenes, etc.) — OBLIGATORIO
  checkSlot(
    "strategistModel",
    `${SLOT_LABEL_KEY_PREFIX}.strategistModel`,
    settings.strategistModel,
  );

  // 4. Modelo de Respaldo (fallback ante errores 5xx / timeout) — OPCIONAL (puede ser sin respaldo)
  checkSlot(
    "fallbackModel",
    `${SLOT_LABEL_KEY_PREFIX}.fallbackModel`,
    settings.fallbackModel,
    { optional: true },
  );

  // 5. Modelos de Memories — OBLIGATORIO si memories están activadas
  checkSlot(
    "memoriesSynthesisModelV2",
    `${SLOT_LABEL_KEY_PREFIX}.memoriesSynthesisModelV2`,
    settings.memoriesSynthesisModelV2,
    { optional: true },
  );
  checkSlot(
    "memoriesRouterModelV2",
    `${SLOT_LABEL_KEY_PREFIX}.memoriesRouterModelV2`,
    settings.memoriesRouterModelV2,
    { optional: !settings.memoriesEnabled },
  );

  // 6. Custom Agents con modelo estático
  if (Array.isArray(customAgents)) {
    for (const agent of customAgents) {
      if (agent.modelSource === "static" && agent.model) {
        checkSlot(
          `customAgent:${agent.id}`,
          `${SLOT_LABEL_KEY_PREFIX}.customAgent`,
          agent.model,
          { labelParams: { name: agent.name } },
        );
      }
    }
  }

  return {
    isValid: invalidSlots.length === 0,
    invalidSlots,
  };
}

// ─── I/O & Boot Validator (Sin reescritura) ──────────────────────────────────

/**
 * Lee del disco las listas de modelos cacheadas de los custom providers.
 *
 * ⚠️ Card #242 — bug corregido: esta función construía el nombre del fichero a
 * mano (`${sanitized}-models-cache.json` sobre el id PELADO), mientras el
 * servicio que lo escribe usa el id CON prefijo (`custom__minube-...`).
 * Nunca encontraba la caché → `isModelValidForProvider` caía en la rama
 * "sin caché no bloqueamos" → la validación de custom providers era un placebo.
 * Ahora la ruta la da `getCacheFilePath`, fuente única del naming.
 */
export async function loadCachedCustomProviderModels(
  configuredProviderIds: Set<string>,
): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();

  // Dedupe: configuredProviderIds trae las dos variantes del mismo provider
  // ("custom::minube" y "minube"). Sin esto se lee el mismo provider dos veces,
  // fallando siempre una de ellas.
  const canonicalIds = new Set<string>();
  for (const providerId of configuredProviderIds) {
    canonicalIds.add(toCanonicalCustomId(providerId));
  }

  for (const canonicalId of canonicalIds) {
    const filePath = getCacheFilePath(canonicalId);
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      const parsed = JSON.parse(raw);

      if (!Array.isArray(parsed?.models)) {
        logger.debug(
          `[ModelValidator] Cache for ${canonicalId} has no models array — ignored`,
        );
        continue;
      }

      // Caché de un formato antiguo: se trata como ausente (no bloqueamos con
      // datos obsoletos) en vez de validar contra una lista potencialmente mal
      // formada.
      if (parsed.cacheVersion !== CACHE_VERSION) {
        logger.debug(
          `[ModelValidator] Cache for ${canonicalId} is stale (v${parsed.cacheVersion} != v${CACHE_VERSION}) — ignored`,
        );
        continue;
      }

      const names = new Set<string>();
      for (const m of parsed.models) {
        if (m?.name) names.add(m.name);
      }
      if (names.size > 0) {
        map.set(canonicalId, names);
      }
    } catch (err: any) {
      // Sin caché para este provider — no bloqueamos, pero dejamos rastro:
      // un catch mudo fue justo lo que ocultó el bug original.
      if (err?.code !== "ENOENT") {
        logger.debug(
          `[ModelValidator] Could not read cache for ${canonicalId}: ${err?.message}`,
        );
      }
    }
  }

  return map;
}

/**
 * Construye el Set de proveedores que el usuario ha DESACTIVADO (card #242).
 *
 * Dos fuentes, porque en esta app la desactivación no se guarda igual según el
 * proveedor:
 *   1. `settings.disabledProviders` — OpenRouter y los custom providers (toggle
 *      en `OpenRouterProviderSection` / `CustomProviderSection`).
 *   2. `settings.ollamaEnabled === false` — Ollama tiene su propio toggle y NO
 *      aparece nunca en `disabledProviders` (`OllamaProviderSection`).
 *
 * Se guardan ambas variantes del id custom (con y sin prefijo `custom::`) para
 * que `isProviderDisabled` sea tolerante, igual que con `configuredProviderIds`.
 *
 * Exportado (no privado) porque es lógica pura con edge-cases propios y va
 * testeada en `model_validator.test.ts`.
 */
export function buildDisabledProviderIds(
  settings: Pick<UserSettings, "disabledProviders" | "ollamaEnabled">,
): Set<string> {
  const disabled = new Set<string>();

  if (Array.isArray(settings.disabledProviders)) {
    for (const raw of settings.disabledProviders) {
      if (typeof raw !== "string" || !raw.trim()) continue;
      const id = raw.trim();
      disabled.add(id);
      // Tolerancia al prefijo: "custom::minube" ↔ "minube"
      if (id.startsWith(CUSTOM_PROVIDER_PREFIX)) {
        disabled.add(id.slice(CUSTOM_PROVIDER_PREFIX.length));
      } else {
        disabled.add(`${CUSTOM_PROVIDER_PREFIX}${id}`);
      }
    }
  }

  // Ollama: default es ACTIVADO (`!== false`), así que solo cuenta como
  // desactivado cuando el usuario lo apagó explícitamente.
  if (settings.ollamaEnabled === false) {
    disabled.add("ollama");
  }

  return disabled;
}

/**
 * Valida todas las referencias al boot o a petición.
 * NUNCA llama a writeSettings ni muta los settings.
 * Si encuentra slots rotos, emite el evento para que la UI levante la modal bloqueante.
 */
export async function validateModelSettings(): Promise<ModelValidationResult> {
  try {
    const settings = readSettings();
    const catalog = await resolveCatalog();

    // Extraer IDs de custom providers configurados
    const configuredProviderIds = new Set<string>();
    if (Array.isArray(settings.customProviders)) {
      for (const cp of settings.customProviders) {
        if (cp?.id) {
          configuredProviderIds.add(cp.id);
          if (cp.id.startsWith("custom::")) {
            configuredProviderIds.add(cp.id.slice("custom::".length));
          } else {
            configuredProviderIds.add(`custom::${cp.id}`);
          }
        }
      }
    }

    // Custom models de la DB legacy
    const customModelNames = new Set<string>();
    const userId = settings.userId;
    if (userId) {
      try {
        const db = getRemoteDb();
        const customModels = await db
          .select()
          .from(remoteSchema.languageModels)
          .where(eq(remoteSchema.languageModels.userId, userId));
        for (const cm of customModels) {
          customModelNames.add(cm.apiName);
        }
      } catch (dbErr: any) {
        logger.warn(
          `[ModelValidator] Failed to query custom models: ${dbErr.message}`,
        );
      }
    }

    // Custom agents de la DB
    let customAgentsList: Array<{
      id: number;
      name: string;
      modelSource?: string;
      model?: string | null;
    }> = [];
    if (userId) {
      try {
        const db = getRemoteDb();
        const agents = await db
          .select({
            id: remoteSchema.customAgents.id,
            name: remoteSchema.customAgents.name,
            modelSource: remoteSchema.customAgents.modelSource,
            model: remoteSchema.customAgents.model,
          })
          .from(remoteSchema.customAgents)
          .where(eq(remoteSchema.customAgents.userId, userId));
        customAgentsList = agents;
      } catch (dbErr: any) {
        logger.warn(
          `[ModelValidator] Failed to query custom agents: ${dbErr.message}`,
        );
      }
    }

    // Cargar listas de modelos cacheadas para los custom providers
    const providerModelMap = await loadCachedCustomProviderModels(
      configuredProviderIds,
    );

    // Proveedores que el usuario ha apagado en Ajustes (card #242). Sin esto el
    // validador daba por bueno cualquier slot cuyo proveedor existiera en el
    // catálogo aunque estuviera desactivado: `isValid: true` con toda la app sin
    // ninguna ruta de salida real.
    const disabledProviderIds = buildDisabledProviderIds(settings);

    const result = validateModelReferences(settings, {
      catalog,
      customModelNames,
      configuredProviderIds,
      providerModelMap,
      customAgents: customAgentsList,
      disabledProviders: disabledProviderIds,
    });

    if (!result.isValid) {
      logger.warn(
        `[ModelValidator] Detected ${result.invalidSlots.length} invalid model references:`,
        result.invalidSlots.map((s) => `${s.slotKey}: ${s.currentValue} (${s.reason})`),
      );
    } else {
      logger.info("[ModelValidator] All configured model references are valid ✓");
    }

    // Broadcast del estado al renderer
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed() && win.webContents) {
        safeSend(win.webContents, "models:validation-status", result);
      }
    }

    return result;
  } catch (error: any) {
    logger.warn(`[ModelValidator] Validation failed (non-fatal): ${error.message}`);
    const fallbackResult: ModelValidationResult = { isValid: true, invalidSlots: [] };
    return fallbackResult;
  }
}
