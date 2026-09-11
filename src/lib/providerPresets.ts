/**
 * Catálogo canónico de presets de proveedores de IA.
 * Card #99 — Slice A
 *
 * Define los 12 presets oficiales soportados más la opción Custom genérica.
 * Centraliza URLs base por defecto, requerimientos de clave y headers extra.
 */

export interface ProviderPreset {
  id: string;
  name: string;
  defaultName: string;
  defaultBaseUrl: string;
  requiresApiKey: boolean;
  apiKeyPlaceholder?: string;
  kind: "cloud" | "local" | "openai-compatible" | "custom";
  helpUrl?: string;
  extraHeaders?: Record<string, string>;
  isCustom?: boolean;
}

export const OPENROUTER_DEFAULT_HEADERS: Record<string, string> = {
  "HTTP-Referer": "https://vibes.diy",
  "X-Title": "Vibes",
};

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "openrouter",
    name: "OpenRouter",
    defaultName: "OpenRouter",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    requiresApiKey: true,
    apiKeyPlaceholder: "sk-or-v1-...",
    kind: "cloud",
    helpUrl: "https://openrouter.ai/settings/keys",
    extraHeaders: OPENROUTER_DEFAULT_HEADERS,
  },
  {
    id: "openai",
    name: "OpenAI",
    defaultName: "OpenAI",
    defaultBaseUrl: "https://api.openai.com/v1",
    requiresApiKey: true,
    apiKeyPlaceholder: "sk-proj-...",
    kind: "cloud",
    helpUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    defaultName: "DeepSeek",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    requiresApiKey: true,
    apiKeyPlaceholder: "sk-...",
    kind: "openai-compatible",
    helpUrl: "https://platform.deepseek.com/api_keys",
  },
  {
    id: "groq",
    name: "Groq",
    defaultName: "Groq",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    requiresApiKey: true,
    apiKeyPlaceholder: "gsk_...",
    kind: "openai-compatible",
    helpUrl: "https://console.groq.com/keys",
  },
  {
    id: "xai",
    name: "xAI (Grok)",
    defaultName: "xAI",
    defaultBaseUrl: "https://api.x.ai/v1",
    requiresApiKey: true,
    apiKeyPlaceholder: "xai-...",
    kind: "cloud",
    helpUrl: "https://console.x.ai",
  },
  {
    id: "ollama",
    name: "Ollama",
    defaultName: "Ollama Local",
    defaultBaseUrl: "http://localhost:11434/v1",
    requiresApiKey: false,
    apiKeyPlaceholder: "(No requerida)",
    kind: "local",
    helpUrl: "https://ollama.com",
  },
  {
    id: "lmstudio",
    name: "LM Studio",
    defaultName: "LM Studio Local",
    defaultBaseUrl: "http://localhost:1234/v1",
    requiresApiKey: false,
    apiKeyPlaceholder: "(No requerida)",
    kind: "local",
    helpUrl: "https://lmstudio.ai",
  },
  {
    id: "custom",
    name: "Personalizado (OpenAI-compatible)",
    defaultName: "",
    defaultBaseUrl: "",
    requiresApiKey: false,
    apiKeyPlaceholder: "sk-...",
    kind: "custom",
    isCustom: true,
  },
];

/**
 * Obtener un preset por su ID canónico.
 */
export function getPresetById(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((p) => p.id === id);
}

/**
 * Resolver el preset correspondiente a una configuración de proveedor.
 * Si no tiene presetId o no coincide con ninguno, se considera Custom.
 * Migración: proveedores existentes sin presetId se resuelven como 'custom'.
 */
export function resolvePresetOrCustom(provider?: {
  presetId?: string;
  apiBaseUrl?: string;
  id?: string;
}): ProviderPreset {
  if (!provider) {
    return getPresetById("custom")!;
  }

  if (provider.presetId) {
    const found = getPresetById(provider.presetId);
    if (found) return found;
  }

  return getPresetById("custom")!;
}

/**
 * Verifica si un presetId es uno de los 12 presets canónicos conocidos (excluyendo 'custom').
 */
export function isCanonicalPreset(presetId?: string): boolean {
  if (!presetId || presetId === "custom") return false;
  return PROVIDER_PRESETS.some((p) => p.id === presetId && !p.isCustom);
}
