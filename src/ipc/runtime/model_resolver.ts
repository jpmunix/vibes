/**
 * B1: Resolves Vibes' model/provider settings into a runtime
 * ProviderDescriptor. The vibes-core runtime is provider-agnostic and only
 * speaks the `openai-compatible` protocol today (OpenCode-compatible
 * endpoints). So:
 *   - openrouter  → https://openrouter.ai/api/v1
 *   - custom::*   → the custom provider's apiBaseUrl (already OpenAI-compat)
 *   - ollama/lmstudio → their local OpenAI-compat endpoint
 *   - anything else → OpenRouter-style direct providers are NOT OpenAI
 *     compatible endpoints in general (anthropic/google have their own
 *     APIs), so for the MVP we route primary chat models through
 *     OpenRouter when available and fall back to custom providers.
 *
 * This deliberately mirrors getRegularModelClient()'s resolution order
 * (settings.providerSettings → env var → customProviders) so the runtime
 * sees the same credentials the rest of Vibes uses.
 */

import log from "electron-log";
import { readSettings } from "../../main/settings";
import { getEnvVar } from "../utils/read_env";
import { PROVIDER_TO_ENV_VAR } from "../shared/language_model_constants";
import type { UserSettings } from "../../lib/schemas";

const logger = log.scope("runtime_model_resolver");

export type RuntimeModelTarget = {
  protocol: "openai-compatible";
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
};

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

function pickApiKey(providerId: string, settings: UserSettings): string | undefined {
  // 1. Explicit key in providerSettings.
  const fromSettings = settings.providerSettings?.[providerId]?.apiKey?.value;
  if (fromSettings) return fromSettings;

  // 2. OpenRouter multi-key support.
  if (providerId === "openrouter") {
    const or = settings.providerSettings?.openrouter as
      | { selectedKeyId?: string; keys?: Array<{ id: string; key?: { value?: string } }> }
      | undefined;
    if (or?.selectedKeyId && (or.keys?.length ?? 0) > 0) {
      const selected = or.keys?.find((k) => k.id === or.selectedKeyId);
      if (selected?.key?.value) return selected.key.value;
    }
  }

  // 3. Shell env var (macOS apps don't inherit the terminal env).
  const envVarName = PROVIDER_TO_ENV_VAR[providerId];
  if (envVarName) return getEnvVar(envVarName);

  return undefined;
}

/**
 * Resolves the model target for a chat turn. Precedence:
 * custom static model > selectedModel.
 *
 * NOTA (card #113, 2026-08-27): settings.agentModels fue ELIMINADO — el
 * runtime (vibes-core) no maneja agentes y toda sesión usa el modelo
 * principal del chat. La precedencia "agentModels override > selectedModel"
 * era de la época del adapter OpenCode (resolveModelForAgent). Deuda de
 * reintroducir per-agent model en card #211 (AgentDefinition.model ya
 * existe en vibes-core pero ningún código lo consume).
 *
 * Returns null when no usable OpenAI-compatible endpoint can be resolved
 * (e.g. only anthropic/google keys configured) — the caller decides how to
 * surface the error.
 */
export function resolveRuntimeModelTarget(options?: {
  customAgentModelSource?: "chat" | "static";
  customAgentModel?: string | null;
}): RuntimeModelTarget | null {
  const settings = readSettings();
  return resolveRuntimeModelTargetFromSettings(settings, options);
}

export function resolveRuntimeModelTargetFromSettings(
  settings: UserSettings,
  options?: {
    customAgentModelSource?: "chat" | "static";
    customAgentModel?: string | null;
  },
): RuntimeModelTarget | null {
  const selected = settings.selectedModel;

  // ── 1. Custom agents with an explicit static model win ────────────────
  if (options?.customAgentModelSource === "static" && options.customAgentModel) {
    const parsed = parseRuntimeModelString(options.customAgentModel, settings);
    if (parsed) return parsed;
  }

  // ── 2. Selected model ──────────────────────────────────────────────────
  if (!selected?.provider || !selected?.name) {
    logger.warn("[RuntimeModel] No selectedModel configured");
    return null;
  }

  const providerId = selected.provider;

  // Custom providers: resolve from settings.customProviders (apiBaseUrl + key).
  const customConfig = settings.customProviders?.find((p) => p.id === providerId);
  if (customConfig?.apiBaseUrl) {
    const apiKey =
      pickApiKey(providerId, settings) ?? customConfig.apiKey?.value;
    return {
      protocol: "openai-compatible",
      baseUrl: customConfig.apiBaseUrl,
      apiKey: apiKey ?? "",
      defaultModel: selected.name,
    };
  }

  // Local providers.
  if (providerId === "ollama") {
    const base = (settings.ollamaBaseUrl || "http://localhost:11434").replace(/\/+$/, "");
    return {
      protocol: "openai-compatible",
      baseUrl: `${base}/v1`,
      apiKey: "",
      defaultModel: selected.name,
    };
  }
  if (providerId === "lmstudio") {
    return {
      protocol: "openai-compatible",
      baseUrl: "http://localhost:1234/v1",
      apiKey: "",
      defaultModel: selected.name,
    };
  }

  // OpenRouter: native OpenAI-compatible endpoint.
  if (providerId === "openrouter") {
    const apiKey = pickApiKey("openrouter", settings);
    if (!apiKey) {
      logger.warn("[RuntimeModel] OpenRouter selected but no API key found");
      return null;
    }
    return {
      protocol: "openai-compatible",
      baseUrl: OPENROUTER_BASE_URL,
      apiKey,
      defaultModel: selected.name,
    };
  }

  // Non-OpenAI-compatible cloud providers (openai/anthropic/google/xai...):
  // the MVP runtime only speaks openai-compatible. Route through OpenRouter
  // if a key exists, using the gateway-prefixed model name when available.
  const openRouterKey = pickApiKey("openrouter", settings);
  if (openRouterKey) {
    logger.info(
      `[RuntimeModel] Provider "${providerId}" is not openai-compatible — routing via OpenRouter`,
    );
    return {
      protocol: "openai-compatible",
      baseUrl: OPENROUTER_BASE_URL,
      apiKey: openRouterKey,
      defaultModel: `${providerId}/${selected.name}`,
    };
  }

  logger.warn(
    `[RuntimeModel] No openai-compatible route for provider "${providerId}" (no OpenRouter fallback key)`,
  );
  return null;
}

/**
 * Parses a "provider/model" string the way parseModelString does for custom
 * static models. Returns null if it cannot be resolved to a usable target.
 */
function parseRuntimeModelString(
  modelString: string,
  settings: UserSettings,
): RuntimeModelTarget | null {
  const sepIdx = modelString.indexOf("/");
  if (sepIdx === -1) return null;
  const provider = modelString.slice(0, sepIdx);
  const name = modelString.slice(sepIdx + 1);
  return resolveForExplicitModel(provider, name, settings);
}

function resolveForExplicitModel(
  providerId: string,
  modelName: string,
  settings: UserSettings,
): RuntimeModelTarget | null {
  const customConfig = settings.customProviders?.find((p) => p.id === providerId);
  if (customConfig?.apiBaseUrl) {
    return {
      protocol: "openai-compatible",
      baseUrl: customConfig.apiBaseUrl,
      apiKey: pickApiKey(providerId, settings) ?? customConfig.apiKey?.value ?? "",
      defaultModel: modelName,
    };
  }
  if (providerId === "ollama") {
    const base = (settings.ollamaBaseUrl || "http://localhost:11434").replace(/\/+$/, "");
    return { protocol: "openai-compatible", baseUrl: `${base}/v1`, apiKey: "", defaultModel: modelName };
  }
  if (providerId === "lmstudio") {
    return { protocol: "openai-compatible", baseUrl: "http://localhost:1234/v1", apiKey: "", defaultModel: modelName };
  }
  if (providerId === "openrouter") {
    const apiKey = pickApiKey("openrouter", settings);
    if (!apiKey) return null;
    return { protocol: "openai-compatible", baseUrl: OPENROUTER_BASE_URL, apiKey, defaultModel: modelName };
  }
  const openRouterKey = pickApiKey("openrouter", settings);
  if (openRouterKey) {
    return {
      protocol: "openai-compatible",
      baseUrl: OPENROUTER_BASE_URL,
      apiKey: openRouterKey,
      defaultModel: `${providerId}/${modelName}`,
    };
  }
  return null;
}

/**
 * #215: parsea un string de modelo tal y como lo escriben los selectores de la
 * UI (strategist/executor) a `{ provider, name }`. Soporta:
 *   - "custom::<providerId>::<model>" → provider = custom::<providerId>
 *   - "ollama::<model>" / "lmstudio::<model>" → locals
 *   - "vendor/model" (OpenRouter-style) → provider = vendor, name = model
 *   - plain "<model>" → openrouter
 * Es el mismo formato que compone useMultiProviderModels.
 */
function parseModelProviderString(modelString: string): { provider: string; name: string } {
  if (modelString.startsWith("custom::")) {
    const rest = modelString.slice("custom::".length);
    const lastSep = rest.lastIndexOf("::");
    if (lastSep > 0) {
      // provider = custom::<id> (con prefijo), igual que model_validator/playground.
      return {
        provider: `custom::${rest.slice(0, lastSep)}`,
        name: rest.slice(lastSep + 2),
      };
    }
    // "custom::<nombre>" sin id de provider — forma legacy; el id es "custom".
    return { provider: "custom", name: rest };
  }
  const sep = modelString.indexOf("::");
  if (sep > 0) {
    return { provider: modelString.slice(0, sep), name: modelString.slice(sep + 2) };
  }
  const slash = modelString.indexOf("/");
  if (slash > 0) {
    return { provider: modelString.slice(0, slash), name: modelString.slice(slash + 1) };
  }
  return { provider: "openrouter", name: modelString };
}

/**
 * #215: resuelve un string de fallbackModel de la UI a un RuntimeModelTarget.
 * Reutiliza resolveForExplicitModel tras parsear el provider. `null` si no
 * resoluble (provider sin credenciales, formato inválido, etc.).
 */
export function resolveRuntimeFallbackTarget(
  modelString: string,
  settings: UserSettings,
): RuntimeModelTarget | null {
  if (!modelString || modelString.trim() === "") return null;
  const { provider, name } = parseModelProviderString(modelString);
  return resolveForExplicitModel(provider, name, settings);
}
