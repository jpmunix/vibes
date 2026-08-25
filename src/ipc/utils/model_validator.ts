/**
 * Model Validator — Boot-time safety net (multi-proveedor, card #87)
 *
 * En cada arranque valida que las referencias a modelos de los settings
 * sigan existiendo. Ahora contra el catálogo multi-proveedor de models.dev
 * (SDK @opencode-ai/models), no solo contra OpenRouter:
 *
 *   - Provider local (ollama/lmstudio)   → solo formato, se valida en runtime.
 *   - Provider custom (custom::/DB)      → contra los custom models de la DB.
 *   - Provider nativo (anthropic/google) → contra catalog.providers[p].models.
 *   - OpenRouter (vendor/model)          → contra catalog.providers.openrouter.
 *
 * Un modelo muerto se reemplaza por un fallback del MISMO provider (si existe
 * un candidato viable); si no, por el fallback universal de OpenRouter. Esto
 * evita la cascada de "model not found" 400/404 sin empujar al usuario a un
 * provider que no eligió.
 *
 * ⚠️  Los cambios se sincronizan a Bunny DB (remote settings), no solo a disco.
 *     getUserSettings() mergea `{ ...local, ...remote }`: sin el sync, los
 *     valores muertos vuelven en cada boot.
 *
 * Se llama desde main.ts durante el splash. Fire-and-forget: nunca lanza.
 */
import log from "electron-log";
import { BrowserWindow } from "electron";
import { readSettings, writeSettings } from "../../main/settings";
import { getRemoteDb } from "../../db/remote";
import * as remoteSchema from "../../db/remote-schema";
import { eq } from "drizzle-orm";
import { safeSend } from "./safe_sender";
import {
  FALLBACK_SELECTED_MODEL,
  FALLBACK_STANDARD_MODEL,
  DEFAULT_ENABLED_MODELS,
} from "../shared/language_model_constants";
import { MODEL_PROVIDER_SEPARATOR } from "../../lib/schemas";
import type { UserSettings } from "../../lib/schemas";
import {
  resolveCatalog,
  isModelKnown,
  isModelDeprecated,
  getFallbackModel,
  type Catalog,
} from "./models_dev_service";

const logger = log.scope("model_validator");

/** Providers locales: el runtime los valida (no van contra el catálogo). */
const LOCAL_PROVIDERS = new Set(["ollama", "lmstudio"]);

// ─── Lógica pura (testeable) ────────────────────────────────────────────────

export interface ValidationDeps {
  catalog: Catalog;
  /** Nombres de custom models de la DB (no se prunan). */
  customModelNames: Set<string>;
}

export interface ValidationResult {
  settings: UserSettings;
  /** Referencias migradas (para el log + broadcast). */
  migrated: string[];
  /** Modelos deprecated detectados (solo aviso, no auto-migrar). */
  deprecated: string[];
}

/**
 * ¿Conocemos el modelo para su provider? Local → siempre conocido (runtime).
 * Custom → en la DB. Nativo/openrouter → en el catálogo.
 *
 * Los custom models de la DB cuentan para CUALQUIER provider (el original
 * solo los cargaba si builtinProviderId === "openrouter", pero un usuario
 * puede crear un custom model apuntando a anthropic/google/etc.). Sin esto,
 * el validator migraría modelos custom perfectamente válidos.
 */
function knownForProvider(
  catalog: Catalog,
  customModelNames: Set<string>,
  providerId: string,
  name: string,
): boolean {
  if (LOCAL_PROVIDERS.has(providerId)) return true;
  if (customModelNames.has(name)) return true;
  if (providerId.startsWith("custom::") || providerId === "custom") {
    return false;
  }
  return isModelKnown(catalog, providerId, name);
}

/** Fallback resuelto: el nombre a guardar + el provider que lo sirve. */
interface ResolvedFallback {
  name: string;
  provider: string;
}

/**
 * Fallback para una referencia muerta de un provider dado. Mantiene los
 * fallbacks específicos de OpenRouter (compat con el comportamiento actual)
 * y añade el fallback por provider para los nativos. Devuelve `{name, provider}`
 * explícito porque un fallback universal puede cambiar también el provider.
 */
function fallbackFor(
  catalog: Catalog,
  providerId: string,
  kind: "selected" | "executor" | "strategist" | "memories",
  currentName?: string,
): ResolvedFallback {
  // OpenRouter: los fallbacks específicos de antes (estables + contract golden).
  if (providerId === "openrouter") {
    switch (kind) {
      case "selected":
        return { name: FALLBACK_SELECTED_MODEL, provider: "openrouter" };
      case "strategist":
        return { name: "deepseek/deepseek-v3.2", provider: "openrouter" };
      default:
        return { name: FALLBACK_STANDARD_MODEL, provider: "openrouter" };
    }
  }
  // Provider nativo: un modelo GA viable del MISMO provider, si lo hay.
  const sameProvider = getFallbackModel(catalog, providerId, currentName);
  if (sameProvider) return { name: sameProvider, provider: providerId };
  // Sin candidato del provider → red universal de OpenRouter (known-good).
  // Nota: cambia el provider a openrouter (el modelo es un vendor/model OR).
  return { name: FALLBACK_SELECTED_MODEL, provider: "openrouter" };
}

/**
 * Valida TODAS las referencias a modelos de los settings contra el catálogo
 * multi-proveedor. Pura: no toca disco/red/DB. Devuelve los settings (inmuta
 * una copia) + lo que migró + los deprecated detectados.
 */
export function validateModelReferences(
  settings: UserSettings,
  deps: ValidationDeps,
): ValidationResult {
  const { catalog, customModelNames } = deps;
  const migrated: string[] = [];
  const deprecated: string[] = [];

  // Guard: catálogo vacío (sin fuente disponible) → no validar nada, para no
  // marcar todas las referencias como muertas. El wrapper también lo comprueba.
  if (Object.keys(catalog.providers).length === 0) {
    return { settings, migrated, deprecated };
  }

  // Copia superficial + selectedModel inmutable (para no mutar el original).
  const next: UserSettings = { ...settings };
  const setSelectModel = (patch: Partial<NonNullable<UserSettings["selectedModel"]>>) => {
    next.selectedModel = { ...next.selectedModel!, ...patch };
  };

  // ── 1. selectedModel (chat principal) ──
  const sm = next.selectedModel;
  if (sm?.name) {
    const provider = sm.provider || "openrouter";
    if (!knownForProvider(catalog, customModelNames, provider, sm.name)) {
      const fb = fallbackFor(catalog, provider, "selected", sm.name);
      logger.warn(
        `[ModelValidator] selectedModel "${sm.name}" (${provider}) no existe → "${fb.name}" (${fb.provider})`,
      );
      setSelectModel({ name: fb.name, provider: fb.provider });
      migrated.push(`selectedModel → ${fb.name} (${fb.provider})`);
    } else if (!LOCAL_PROVIDERS.has(provider) && isModelDeprecated(catalog, provider, sm.name)) {
      deprecated.push(`selectedModel=${sm.name}`);
      logger.warn(
        `[ModelValidator] selectedModel "${sm.name}" está deprecated (no se auto-migra)`,
      );
    }
  }

  // ── 2. Referencias de string (executor/strategist/memories) ──
  const handleStringRef = (
    key: "executorModel" | "strategistModel" | "memoriesSynthesisModelV2" | "memoriesRouterModelV2",
    kind: "executor" | "strategist" | "memories",
  ) => {
    const raw = (next as Record<string, any>)[key];
    if (!raw || typeof raw !== "string") return;

    // Formatos reales en settings (verificados):
    //  - "vendor/model"            → OpenRouter (sin separador).
    //  - "ollama::qwen2.5-coder:7b" → cross-provider (PRIMERA :: es el corte;
    //    los ids de modelo local pueden llevar ":" pero no "::").
    //  - "custom::cortecs::mi-modelo" → custom provider (DOS ::; el id del
    //    provider va entre el primero y el segundo, el resto es el apiName).
    //    Es el formato que compone useMultiProviderModels y que escriben los
    //    selectores (StrategistModelSelector/ExecutorModelSelector).
    let provider: string;
    let name: string;
    if (raw.startsWith("custom::")) {
      // El primer separador es el sufijo fijo del prefijo "custom::"; el
      // SEGUNDO hay que buscarlo a partir de ahí (si busco desde el índice 2
      // encuentro el primero otra vez).
      const second = raw.indexOf(
        MODEL_PROVIDER_SEPARATOR,
        "custom::".length,
      );
      if (second === -1) {
        // "custom::<nombre>" sin id de provider — forma legacy; tratar como
        // referencia de DB con nombre completo.
        provider = "custom";
        name = raw.slice(MODEL_PROVIDER_SEPARATOR.length);
      } else {
        provider = `custom::${raw.slice(
          MODEL_PROVIDER_SEPARATOR.length,
          second,
        )}`;
        name = raw.slice(second + MODEL_PROVIDER_SEPARATOR.length);
      }
    } else if (raw.includes(MODEL_PROVIDER_SEPARATOR)) {
      const sep = raw.indexOf(MODEL_PROVIDER_SEPARATOR);
      provider = raw.slice(0, sep);
      name = raw.slice(sep + MODEL_PROVIDER_SEPARATOR.length);
    } else {
      // Sin separador → convención OpenRouter (vendor/model).
      provider = "openrouter";
      name = raw;
    }

    if (knownForProvider(catalog, customModelNames, provider, name)) {
      // OK. (Los local se consideran conocidos.)
      if (!LOCAL_PROVIDERS.has(provider) && isModelDeprecated(catalog, provider, name)) {
        deprecated.push(`${key}=${raw}`);
        logger.warn(`[ModelValidator] ${key} "${raw}" está deprecated`);
      }
      return;
    }

    const fb = fallbackFor(catalog, provider, kind, name);
    // Reconstruir la referencia según el provider de destino:
    //  - openrouter → el nombre ya es vendor/model (sin separador).
    //  - cross/local → provider::name (formato de string cross-provider).
    const newRef =
      fb.provider === "openrouter"
        ? fb.name
        : `${fb.provider}${MODEL_PROVIDER_SEPARATOR}${fb.name}`;
    logger.warn(`[ModelValidator] ${key} "${raw}" no existe → "${newRef}"`);
    (next as Record<string, any>)[key] = newRef;
    migrated.push(`${key} → ${newRef}`);
  };

  handleStringRef("executorModel", "executor");
  handleStringRef("strategistModel", "strategist");
  handleStringRef("memoriesSynthesisModelV2", "memories");
  handleStringRef("memoriesRouterModelV2", "memories");

  // ── 3. enabledModels (picker) — migración legacy + prune muertas/deprecated ──
  // Card #160: la clave se renombró a enabledModels (neutral multi-provider).
  // La clave legacy enabledOpenRouterModels solo se lee para migrar una vez.
  if (
    Array.isArray((next as Record<string, any>).enabledOpenRouterModels) &&
    !Array.isArray(next.enabledModels)
  ) {
    next.enabledModels = (next as Record<string, any>)
      .enabledOpenRouterModels as string[];
    delete (next as Record<string, any>).enabledOpenRouterModels;
    migrated.push("enabledOpenRouterModels → enabledModels");
  }

  const enabled = next.enabledModels;
  if (enabled && Array.isArray(enabled)) {
    const keep: string[] = [];
    const removed: string[] = [];
    for (const name of enabled) {
      // Modelos cross-provider (custom::id::name, ollama::name) se conservan
      // siempre: no viven en el catálogo de OpenRouter.
      if (name.includes(MODEL_PROVIDER_SEPARATOR)) {
        keep.push(name);
        continue;
      }
      const alive =
        customModelNames.has(name) ||
        (isModelKnown(catalog, "openrouter", name) &&
          !isModelDeprecated(catalog, "openrouter", name));
      if (alive) keep.push(name);
      else removed.push(name);
    }
    if (removed.length > 0) {
      logger.warn(
        `[ModelValidator] Pruned ${removed.length} modelos muertos/deprecated de enabledModels: ${removed.join(", ")}`,
      );
      next.enabledModels = keep.length > 0 ? keep : [...DEFAULT_ENABLED_MODELS];
      migrated.push(`enabledModels: removed ${removed.length}`);
    }
  }

  return { settings: next, migrated, deprecated };
}

// ─── Wrapper con I/O (boot) ─────────────────────────────────────────────────

/**
 * Valida los settings contra el catálogo y persiste si hubo migraciones.
 * Fire-and-forget: nunca lanza, nunca bloquea la UI.
 */
export async function validateModelSettings(): Promise<void> {
  try {
    const settings = readSettings();

    // Catálogo multi-proveedor (live → disk → snapshot). Nunca rechaza.
    const catalog = await resolveCatalog();

    // Guard del original: si el catálogo viene COMPLETAMENTE vacío (sin
    // live, sin disco y sin snapshot — caso extremo), saltarse la validación
    // para no marcar todas las referencias como muertas.
    if (Object.keys(catalog.providers).length === 0) {
      logger.info(
        "[ModelValidator] Skipped — empty catalog (no source available)",
      );
      return;
    }

    // Custom models de la DB (para no prunarlos).
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

    const { settings: next, migrated, deprecated } = validateModelReferences(
      settings,
      { catalog, customModelNames },
    );

    if (deprecated.length > 0) {
      logger.warn(
        `[ModelValidator] Modelos deprecated detectados (solo aviso): ${deprecated.join(", ")}`,
      );
    }

    if (migrated.length > 0) {
      writeSettings(next);
      logger.info(
        `[ModelValidator] Migrated ${migrated.length} stale model references: ${migrated.join("; ")}`,
      );

      // Sync a Bunny DB (crítico: el merge {...local, ...remote} reviviría los muertos).
      try {
        const updated = readSettings();
        const uid = updated.userId;
        if (uid) {
          const db = getRemoteDb();
          const { userId: _u, sessionToken: _s, ...syncable } = updated;
          const settingsJson = JSON.stringify(syncable);
          const existing = await db.query.userSettings.findFirst({
            where: eq(remoteSchema.userSettings.userId, uid),
          });
          if (existing) {
            await db
              .update(remoteSchema.userSettings)
              .set({ settingsJson, updatedAt: new Date() })
              .where(eq(remoteSchema.userSettings.userId, uid));
          } else {
            await db.insert(remoteSchema.userSettings).values({
              userId: uid,
              settingsJson,
              updatedAt: new Date(),
            });
          }
        }
      } catch (syncErr: any) {
        logger.warn(`[ModelValidator] Bunny DB sync failed (non-fatal): ${syncErr.message}`);
      }

      // Broadcast al renderer.
      const updated = readSettings();
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed() && win.webContents) {
          safeSend(win.webContents, "settings:updated-from-backend", updated);
          safeSend(win.webContents, "models:migrated", { changes: migrated });
        }
      }
    } else {
      logger.info("[ModelValidator] All model references are valid ✓");
    }
  } catch (error: any) {
    logger.warn(`[ModelValidator] Validation failed (non-fatal): ${error.message}`);
  }
}
