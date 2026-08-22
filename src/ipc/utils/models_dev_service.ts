/**
 * models_dev_service.ts — Catálogo multi-proveedor de models.dev (card #87)
 *
 * Envuelve el SDK `@opencode-ai/models` (pin 0.0.49) con una capa de caché
 * propia. El SDK da dos fuentes:
 *   - `Models.make()` → fetch live tipado (`/catalog.json`), stateless, sin caché.
 *   - `@opencode-ai/models/snapshot` → copia embebida del catálogo (máx ~24h),
 *     para runtimes sin red, tests y cold-start.
 *
 * Nuestra política (decisión munix): snapshot como floor + fetch live con TTL
 * 1 día (stale-while-revalidate). El snapshot SÓLO se importa en dinámico en el
 * path de fallback para no inflar el bundle del hot path (son ~4.9 MB).
 *
 * P1: este módulo vive en la carcasa (Vibes). El runtime (vibes-core) no sabe
 * de catálogos.
 */
import log from "electron-log";
import { app } from "electron";
import * as path from "path";
import * as fs from "fs/promises";
import {
  Models,
  type Catalog,
  type Model,
  type ModelMetadata,
} from "@opencode-ai/models";
import type { ModelOption } from "../shared/language_model_constants";

// Re-exportamos los tipos del SDK para que el resto de la carcasa los importe
// de este servicio (API pública de la card) en vez de del paquete directamente.
export type { Catalog, Model, ModelMetadata, Provider } from "@opencode-ai/models";

const logger = log.scope("models-dev");

const MODELS_DEV_BASE_URL = "https://models.dev";
const FETCH_TIMEOUT_MS = 10_000;
const CACHE_VERSION = 1;
const CACHE_TTL_MS = 1 * 24 * 60 * 60 * 1000; // 1 día
const CACHE_FILENAME = "models-dev-catalog-cache.json";

// ─── Caché ────────────────────────────────────────────────────────────────

interface CachedCatalog {
  catalog: Catalog;
  fetchedAt: number;
  cacheVersion: number;
  source: "live" | "snapshot";
}

// Caché en memoria (module-level) para evitar re-lecturas de disco.
let memoryCache: CachedCatalog | null = null;

export function _resetModelsDevCacheForTests(): void {
  memoryCache = null;
  lastBackgroundRefreshAt = 0;
  inFlightLive = null;
}

function getCacheFilePath(): string {
  return path.join(app.getPath("userData"), CACHE_FILENAME);
}

async function readCacheFromDisk(): Promise<CachedCatalog | null> {
  try {
    const data = await fs.readFile(getCacheFilePath(), "utf-8");
    const parsed = JSON.parse(data) as CachedCatalog;
    if (parsed?.catalog && typeof parsed.fetchedAt === "number") {
      return parsed;
    }
  } catch {
    // Sin fichero o corrupto → null (es la rama normal en primer arranque).
  }
  return null;
}

async function writeCacheToDisk(cached: CachedCatalog): Promise<void> {
  try {
    await fs.writeFile(getCacheFilePath(), JSON.stringify(cached), "utf-8");
  } catch (err) {
    logger.warn("Failed to write models.dev catalog cache to disk:", err);
  }
}

function isCacheFresh(cached: CachedCatalog | null): boolean {
  if (!cached) return false;
  if (cached.cacheVersion !== CACHE_VERSION) return false;
  return Date.now() - cached.fetchedAt < CACHE_TTL_MS;
}

// ─── Fuentes ──────────────────────────────────────────────────────────────

/**
 * Fetch live del catálogo completo (`/catalog.json`) usando el SDK tipado.
 * `fetch` es inyectable para tests (proxies, polyfills, test doubles).
 */
async function fetchLiveCatalog(
  fetchImpl?: typeof globalThis.fetch,
): Promise<Catalog> {
  const client = Models.make({
    baseUrl: MODELS_DEV_BASE_URL,
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  });
  return client.catalog({ signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
}

/**
 * Snapshot embebido del SDK (copia del catálogo, máx ~24h). Se importa en
 * dinámico para no inflar el bundle del hot path.
 */
async function loadSnapshotCatalog(): Promise<Catalog> {
  const mod = await import("@opencode-ai/models/snapshot");
  return { providers: mod.providers, models: mod.models };
}

// ─── API pública ──────────────────────────────────────────────────────────

/**
 * Intervalo mínimo entre refrescos en background. Sin esto, CADA llamada a
 * `resolveCatalog` con caché fresca disparaba un fetch live (el catálogo se
 * pide decenas de veces por sesión → tormenta de red contra models.dev).
 */
const BACKGROUND_REFRESH_MIN_INTERVAL_MS = 5 * 60 * 1000;

/** Promesa de fetch live en vuelo (dedupe de llamadas concurrentes en cold-start). */
let inFlightLive: Promise<Catalog> | null = null;

/** Timestamp del último refresco en background lanzado. */
let lastBackgroundRefreshAt = 0;

export interface ResolveCatalogOptions {
  /** Fetch inyectable (tests/proxies). Por defecto `globalThis.fetch`. */
  fetch?: typeof globalThis.fetch;
  /**
   * Si `true`, omite la caché en memoria y en disco e intenta fetch live.
   * Se usa por el handler de refresh manual.
   */
  force?: boolean;
}

/**
 * Resuelve el catálogo multi-proveedor con la política de fuentes (decisión
 * munix): memoria → disco fresco → fetch live → snapshot embebido.
 *
 * - Si hay caché en memoria (o disco fresco) → la devuelve y refresca en
 *   segundo plano (stale-while-revalidate).
 * - Si no → fetch live. Si el live falla o la caché está rota → snapshot.
 *
 * Nunca rechaza: en el peor caso devuelve el snapshot embebido (arranque
 * offline garantizado).
 */
export async function resolveCatalog(
  opts: ResolveCatalogOptions = {},
): Promise<Catalog> {
  // 1. Memoria
  if (!opts.force && isCacheFresh(memoryCache)) {
    refreshInBackground(opts);
    return memoryCache!.catalog;
  }

  // 2. Disco fresco
  const disk = await readCacheFromDisk();
  if (!opts.force && disk && isCacheFresh(disk)) {
    memoryCache = disk;
    refreshInBackground(opts);
    return disk.catalog;
  }

  // 3. Fetch live (con stale-while-revalidate si hay disco viejo)
  if (opts.force || !disk) {
    // Dedupe: si ya hay un live en vuelo (cold-start concurrente), esperar al
    // mismo resultado. Con catch propio: si ese live falla, este caller cae
    // al snapshot/stale en vez de propagar la excepción (nunca se rechaza).
    if (inFlightLive) {
      try {
        return await inFlightLive;
      } catch {
        // fallthrough → snapshot (o disco viejo si existe)
      }
    }
    const livePromise = fetchLiveCatalog(opts.fetch).then((live) => {
      const cached: CachedCatalog = {
        catalog: live,
        fetchedAt: Date.now(),
        cacheVersion: CACHE_VERSION,
        source: "live",
      };
      memoryCache = cached;
      return writeCacheToDisk(cached).then(() => {
        logger.info(
          `Fetched models.dev catalog live: ${Object.keys(live.providers).length} providers`,
        );
        return live;
      });
    });
    inFlightLive = livePromise;
    try {
      const live = await livePromise;
      return live;
    } catch (err: any) {
      logger.warn(`Live models.dev catalog fetch failed: ${err?.message}`);
    } finally {
      inFlightLive = null;
    }
    // Fallthrough → snapshot (o disco viejo si existe)
  }

  // 4. Disco viejo (stale) si lo hay
  if (disk) {
    memoryCache = disk;
    refreshInBackground(opts);
    return disk.catalog;
  }

  // 5. Snapshot embebido (offline floor)
  try {
    const snap = await loadSnapshotCatalog();
    memoryCache = {
      catalog: snap,
      fetchedAt: Date.now(),
      cacheVersion: CACHE_VERSION,
      source: "snapshot",
    };
    // No escribir el snapshot a disco como "fresco": tiene su propio mtime.
    // Sí lo cacheamos en memoria para no re-importar en cada llamada.
    logger.warn(
      `Served embedded models.dev snapshot: ${Object.keys(snap.providers).length} providers`,
    );
    return snap;
  } catch (err: any) {
    // Caso extremo: ni snapshot disponible. Devolver catálogo vacío.
    logger.error(`No models.dev source available: ${err?.message}`);
    return { providers: {}, models: {} };
  }
}

/** Refresco en background (fire-and-forget), nunca bloquea ni lanza. */
function refreshInBackground(opts: ResolveCatalogOptions): void {
  // Throttle: sin esto, cada llamada con caché fresca disparaba un fetch
  // (el catálogo se resuelve muchas veces por sesión). Máx 1 refresco
  // background cada 5 minutos; los demás se sirven de la caché vigente.
  const now = Date.now();
  if (now - lastBackgroundRefreshAt < BACKGROUND_REFRESH_MIN_INTERVAL_MS) {
    return;
  }
  lastBackgroundRefreshAt = now;
  fetchLiveCatalog(opts.fetch)
    .then((live) => {
      const cached: CachedCatalog = {
        catalog: live,
        fetchedAt: Date.now(),
        cacheVersion: CACHE_VERSION,
        source: "live",
      };
      memoryCache = cached;
      return writeCacheToDisk(cached);
    })
    .catch((err) =>
      logger.warn(`Background models.dev refresh failed: ${err?.message}`),
    );
}

/** Borra la caché (memoria + disco). Para el handler de refresh manual. */
export async function clearModelsDevCache(): Promise<void> {
  memoryCache = null;
  await fs.unlink(getCacheFilePath()).catch(() => {});
}

/**
 * Forzado: limpia la caché y hace fetch live. Si el live falla, deja caer el
 * snapshot. Úsalo desde el botón "refrescar catálogo" de la UI (Slice B).
 */
export async function refreshCatalog(
  opts: ResolveCatalogOptions = {},
): Promise<Catalog> {
  await clearModelsDevCache();
  return resolveCatalog({ ...opts, force: true });
}

// ─── Transform: catálogo → ModelOption ────────────────────────────────────

/** USD por millón → escala de 1-4 $ (misma escala que openai_compatible). */
function outputCostToSigns(outputPer1M: number): number {
  if (outputPer1M <= 0) return 0;
  if (outputPer1M <= 1) return 1;
  if (outputPer1M <= 5) return 2;
  if (outputPer1M <= 15) return 3;
  return 4;
}

/** Costo del catálogo (USD por 1M) → campos de precio de ModelOption. */
export function pricingFromCost(cost: {
  input: number;
  output: number;
}): { pricingInput?: string; pricingOutput?: string; dollarSigns?: number } {
  const dollarSigns = outputCostToSigns(cost.output);
  return {
    pricingInput: `$${cost.input.toFixed(2)}/M`,
    pricingOutput: `$${cost.output.toFixed(2)}/M`,
    dollarSigns,
  };
}

/**
 * Resuelve el costo aplicable de un `ModelCost` para un tamaño de contexto dado.
 *
 * `ModelCost` puede traer `tiers` (precio a partir de cierto tamaño de
 * contexto, p. ej. openai/gpt-5.5 cobra más arriba de 272k). Regla:
 *   - Sin tiers → el costo base.
 *   - Con tiers → el tier cuyo `size` sea el más alto que no supere `contextSize`
 *     (el último umbral ya cruzado). Si `contextSize` está por debajo de todos
 *     los tiers (o no se da), el costo base.
 */
export function resolveModelCost(
  cost: {
    input: number;
    output: number;
    tiers?: { input: number; output: number; tier: { type: string; size: number } }[];
  },
  contextSize?: number,
): { input: number; output: number } {
  if (!cost.tiers || cost.tiers.length === 0) {
    return { input: cost.input, output: cost.output };
  }
  if (contextSize == null) {
    return { input: cost.input, output: cost.output };
  }
  // Tier aplicable: el umbral más alto que no supere contextSize.
  const applicable = cost.tiers
    .filter((t) => t.tier.size <= contextSize)
    .sort((a, b) => b.tier.size - a.tier.size)[0];
  if (applicable) {
    return { input: applicable.input, output: applicable.output };
  }
  return { input: cost.input, output: cost.output };
}

/**
 * Mapea un modelo del catálogo a nuestro `ModelOption`.
 *
 * `overrideName` permite imponer el ID compuesto (`provider/model`) que usa
 * Vibes; por defecto se usa el `id` del modelo (que para OpenRouter ya viene
 * compuesto, y para los nativos es el id "pelado" del provider).
 */
export function toModelOption(
  model: Model,
  meta?: ModelMetadata,
  overrideName?: string,
): ModelOption {
  const supportedParameters: string[] = [];
  if (model.tool_call) supportedParameters.push("tools");
  if (model.reasoning) supportedParameters.push("reasoning");
  if (model.temperature) supportedParameters.push("temperature");
  if (model.structured_output) supportedParameters.push("structured_output");

  const option: ModelOption = {
    name: overrideName ?? model.id,
    displayName: meta?.name ?? model.name,
    description: (meta?.description ?? model.description ?? "").slice(0, 200),
    supportedParameters,
  };

  if (model.limit?.context) option.contextWindow = model.limit.context;
  if (model.limit?.output) option.maxOutputTokens = model.limit.output;
  if (model.modalities?.input) option.inputModalities = model.modalities.input;
  if (model.modalities?.output) option.outputModalities = model.modalities.output;
  if (model.reasoning) {
    option.tag = "Reasoning";
    option.tagColor = "purple";
  }

  if (model.cost) {
    const effective = resolveModelCost(model.cost, model.limit?.context);
    const pricing = pricingFromCost(effective);
    option.pricingInput = pricing.pricingInput;
    option.pricingOutput = pricing.pricingOutput;
    option.dollarSigns = pricing.dollarSigns;
  }

  return option;
}

/**
 * Filtro "relevante para coding agentic" (espejo del criterio de
 * openrouter_models_service): texto in/out, contexto ≥ 32k, soporta tools,
 * no deprecated.
 */
export function isRelevantForCoding(model: Model): boolean {
  if (model.status === "deprecated") return false;
  if (!model.tool_call) return false;
  if (!model.limit || model.limit.context < 32_000) return false;
  if (!model.modalities?.input?.includes("text")) return false;
  if (!model.modalities?.output?.includes("text")) return false;
  return true;
}

/**
 * Listado de modelos de un provider del catálogo, ya transformados y filtrados.
 *
 * El ID compuesto que usa Vibes: para `openrouter` el id ya viene en formato
 * `vendor/model`; para el resto se compone `providerId/modelId`.
 */
export async function getCatalogModels(
  providerId: string,
  opts: ResolveCatalogOptions = {},
): Promise<ModelOption[]> {
  const catalog = await resolveCatalog(opts);
  const provider = catalog.providers[providerId];
  if (!provider) return [];

  const out: ModelOption[] = [];
  for (const model of Object.values(provider.models)) {
    if (!isRelevantForCoding(model)) continue;
    const composite =
      providerId === "openrouter" ? model.id : `${providerId}/${model.id}`;
    const meta = catalog.models[composite];
    out.push(toModelOption(model, meta, composite));
  }
  // Orden: displayName (la UI agrupa/ordena más adelante).
  out.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return out;
}

// ─── Lookup: catálogo por ID ───────────────────────────────────────────────

function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/[.\-_ ]+/g, "");
}

interface LookupHit {
  model?: Model;
  meta?: ModelMetadata;
  /** ID compuesto que usa Vibes (p. ej. "anthropic/claude-opus-4-6"). */
  canonicalId?: string;
}

/**
 * Busca un modelo en el catálogo.
 *
 * Orden de búsqueda (de más a menos estricto):
 *   1. Exacto en el provider indicado (`provider.models[id]`, con el id tal o
 *      "pelado" si el id trae prefijo `x/`).
 *   2. Metadata provider-agnóstica por ID canónico (`catalog.models[id]`).
 *   3. Global por id normalizado (cualquier provider).
 */
export function findModel(
  catalog: Catalog,
  providerId: string,
  modelId: string,
): LookupHit {
  const provider = catalog.providers[providerId];
  const slash = modelId.indexOf("/");
  const bare = slash >= 0 ? modelId.slice(slash + 1) : modelId;

  // 1. Exacto en el provider.
  if (provider) {
    if (provider.models[modelId]) {
      return {
        model: provider.models[modelId],
        meta: catalog.models[modelId] ?? catalog.models[`${providerId}/${modelId}`],
        canonicalId: `${providerId}/${modelId}`,
      };
    }
    if (provider.models[bare]) {
      return {
        model: provider.models[bare],
        meta: catalog.models[`${providerId}/${bare}`],
        canonicalId: `${providerId}/${bare}`,
      };
    }
  }

  // 2. Metadata provider-agnóstica por ID canónico.
  const meta = catalog.models[modelId];
  if (meta) return { meta, canonicalId: modelId };

  // 3. Global por id normalizado (cualquier provider).
  const norm = normalizeKey(modelId);
  const normBare = normalizeKey(bare);
  for (const [pid, p] of Object.entries(catalog.providers)) {
    const hit =
      p.models[modelId] ??
      p.models[bare] ??
      Object.values(p.models).find(
        (m) => normalizeKey(m.id) === norm || normalizeKey(m.id) === normBare,
      );
    if (hit) {
      return {
        model: hit,
        meta: catalog.models[`${pid}/${hit.id}`],
        canonicalId: `${pid}/${hit.id}`,
      };
    }
  }

  return { meta };
}

// ─── Enriquecimiento: ModelOption de provider + huecos del catálogo ────────

/**
 * Rellena los huecos de un `ModelOption` procedente de un provider runtime
 * (p. ej. un `/v1/models` pobre de un proxy) con los datos del catálogo.
 *
 * Precedencia (decisión opencode): el valor que ya trae el provider GANA; el
 * catálogo solo completa campos ausentes. Nunca sobreescribe.
 */
export function enrichModelOption(
  base: ModelOption,
  catalog: Catalog,
  modelId: string,
): ModelOption {
  const hit = findModel(catalog, guessProviderFromId(modelId), modelId);
  const catalogOption = hit.model
    ? toModelOption(hit.model, hit.meta)
    : hit.meta
      ? metaToOption(hit.meta)
      : null;
  if (!catalogOption) return base;

  const out: ModelOption = { ...base };
  if (out.contextWindow == null && catalogOption.contextWindow != null) {
    out.contextWindow = catalogOption.contextWindow;
  }
  if (out.maxOutputTokens == null && catalogOption.maxOutputTokens != null) {
    out.maxOutputTokens = catalogOption.maxOutputTokens;
  }
  if (out.pricingInput == null && catalogOption.pricingInput != null) {
    out.pricingInput = catalogOption.pricingInput;
  }
  if (out.pricingOutput == null && catalogOption.pricingOutput != null) {
    out.pricingOutput = catalogOption.pricingOutput;
  }
  if (out.dollarSigns == null && catalogOption.dollarSigns != null) {
    out.dollarSigns = catalogOption.dollarSigns;
  }
  if (out.description == null || out.description === "") {
    out.description = catalogOption.description;
  }
  if (!out.inputModalities?.length && catalogOption.inputModalities) {
    out.inputModalities = catalogOption.inputModalities;
  }
  if (!out.outputModalities?.length && catalogOption.outputModalities) {
    out.outputModalities = catalogOption.outputModalities;
  }
  if (!out.supportedParameters?.length && catalogOption.supportedParameters) {
    out.supportedParameters = catalogOption.supportedParameters;
  }
  if (!out.tag && catalogOption.tag) {
    out.tag = catalogOption.tag;
    out.tagColor = catalogOption.tagColor;
  }
  return out;
}

/** Extrae el prefijo de provider de un ID compuesto (para el lookup). */
function guessProviderFromId(modelId: string): string {
  const slash = modelId.indexOf("/");
  return slash >= 0 ? modelId.slice(0, slash) : "";
}

/** Mapea metadata provider-agnóstica → ModelOption (sin precio/limites). */
function metaToOption(meta: ModelMetadata): ModelOption {
  const supportedParameters: string[] = [];
  if (meta.tool_call) supportedParameters.push("tools");
  if (meta.reasoning) supportedParameters.push("reasoning");
  const option: ModelOption = {
    name: meta.id,
    displayName: meta.name,
    description: (meta.description ?? "").slice(0, 200),
    supportedParameters,
  };
  if (meta.limit?.context) option.contextWindow = meta.limit.context;
  if (meta.limit?.output) option.maxOutputTokens = meta.limit.output;
  if (meta.modalities?.input) option.inputModalities = meta.modalities.input;
  if (meta.modalities?.output) option.outputModalities = meta.modalities.output;
  if (meta.reasoning) {
    option.tag = "Reasoning";
    option.tagColor = "purple";
  }
  return option;
}

// ─── Helpers del validator (Slice D) ───────────────────────────────────────

/** ¿Existe el modelo en el catálogo (cualquier fuente de lookup)? */
export function isModelKnown(
  catalog: Catalog,
  providerId: string,
  modelId: string,
): boolean {
  const hit = findModel(catalog, providerId, modelId);
  return hit.model != null || hit.meta != null;
}

/** ¿El modelo está marcado `deprecated` en el catálogo? */
export function isModelDeprecated(
  catalog: Catalog,
  providerId: string,
  modelId: string,
): boolean {
  const hit = findModel(catalog, providerId, modelId);
  return hit.model?.status === "deprecated";
}

/**
 * Fallback sensible por provider: el modelo GA (no deprecated) del MISMO
 * provider con más contexto que soporte tools. Si el provider no está en el
 * catálogo (custom/local), devuelve undefined y el caller decide.
 */
export function getFallbackModel(
  catalog: Catalog,
  providerId: string,
  currentModelId?: string,
): string | undefined {
  const provider = catalog.providers[providerId];
  if (!provider) return undefined;
  const candidates = Object.values(provider.models).filter((m) => {
    if (m.status === "deprecated") return false;
    if (!m.tool_call) return false;
    if (!m.limit || m.limit.context < 32_000) return false;
    if (currentModelId && m.id === currentModelId) return false;
    return true;
  });
  if (candidates.length === 0) return undefined;
  candidates.sort((a, b) => (b.limit?.context ?? 0) - (a.limit?.context ?? 0));
  const best = candidates[0];
  // best.id es la KEY del catálogo: pelada para providers nativos
  // (claude-opus-4-5), compuesta para openrouter (aion-labs/aion-2.0).
  // Coincide con el formato que Vibes guarda en selectedModel.name.
  return best.id;
}

// ─── Enriquecimiento en lote (Slice C) ─────────────────────────────────────

/**
 * Resuelve el catálogo y enriquece una lista de `ModelOption` procedentes de
 * un provider runtime (p. ej. un `/v1/models` pobre de un proxy).
 *
 * Cada modelo se enriquece con su ID crudo (`ids[i]`). Si el catálogo no
 * conoce el modelo, se devuelve intacto. Nunca lanza: un fallo del catálogo
 * deja los modelos tal cual (el caller sigue con su fetch).
 */
export async function enrichModelOptions(
  models: ModelOption[],
  ids: string[],
  opts: ResolveCatalogOptions = {},
): Promise<ModelOption[]> {
  if (models.length === 0) return models;
  let catalog: Catalog;
  try {
    catalog = await resolveCatalog(opts);
  } catch (err: any) {
    logger.warn(`Catalog resolve failed during enrich: ${err?.message}`);
    return models;
  }
  return models.map((m, i) =>
    enrichModelOption(m, catalog, ids[i] ?? m.name),
  );
}
