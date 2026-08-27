export interface ModelOption {
  name: string;
  displayName: string;
  description: string;
  dollarSigns?: number;
  brainSigns?: number;
  temperature?: number;
  tag?: string;
  tagColor?: string;
  maxOutputTokens?: number;
  contextWindow?: number;
  pricingInput?: string;
  pricingOutput?: string;
  inputModalities?: string[];
  outputModalities?: string[];
  supportedParameters?: string[];
}

export const GPT_5_2_MODEL_NAME = "gpt-5.2";
export const SONNET_4_5 = "claude-sonnet-4-5-20250929";
export const GEMINI_3_FLASH = "gemini-3-flash-preview";

// ═══════════════════════════════════════════════════════════════════
// CENTRALIZED MODEL DEFAULTS
// All fallback model references across the app MUST use these constants.
// To change a default, update ONLY here.
// ═══════════════════════════════════════════════════════════════════

/** Cheap/fast model for internal tasks: titles, summaries, compaction, todos, debates */
export const FALLBACK_STANDARD_MODEL = "google/gemini-2.5-flash-lite";

/** Strong model for thinking tasks: turbo edits, knowledge extraction */
// FALLBACK_PRO_MODEL removed — proModeModel has zero runtime consumers

/** Default model for the main chat selector */
export const FALLBACK_SELECTED_MODEL = "google/gemini-3-flash-preview";

export const DEFAULT_ENABLED_MODELS: string[] = [
  "anthropic/claude-opus-4.6",
  "google/gemini-3.1-pro-preview",
  "google/gemini-3-flash-preview",
  "openai/gpt-5.1-codex-max",
  "openai/gpt-5.2-codex",
  "openai/gpt-5.1-codex-mini",
  "x-ai/grok-code-fast-1",
  "moonshotai/kimi-k2.5",
  "minimax/minimax-m2.5",
  "qwen/qwen-plus-2025-07-28:thinking",
];

export const PROVIDER_TO_ENV_VAR: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GEMINI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  azure: "AZURE_API_KEY",
  xai: "XAI_API_KEY",
  bedrock: "AWS_BEARER_TOKEN_BEDROCK",
};

export const CLOUD_PROVIDERS: Record<
  string,
  {
    displayName: string;
    hasFreeTier?: boolean;
    websiteUrl?: string;
    gatewayPrefix: string;
    secondary?: boolean;
  }
> = {
  // DESHABILITADO TEMPORALMENTE - Auto-router funciona mal
  // "auto-router": {
  //   displayName: "Auto-Router (IA)",
  //   hasFreeTier: true,
  //   websiteUrl: undefined,
  //   gatewayPrefix: "",
  // },
  openrouter: {
    displayName: "OpenRouter",
    hasFreeTier: true,
    websiteUrl: "https://openrouter.ai/settings/keys",
    gatewayPrefix: "openrouter/",
  },
  openai: {
    displayName: "OpenAI",
    hasFreeTier: false,
    websiteUrl: "https://platform.openai.com/api-keys",
    gatewayPrefix: "",
  },
  anthropic: {
    displayName: "Anthropic",
    hasFreeTier: false,
    websiteUrl: "https://console.anthropic.com/settings/keys",
    gatewayPrefix: "anthropic/",
  },
  google: {
    displayName: "Google",
    hasFreeTier: true,
    websiteUrl: "https://aistudio.google.com/app/apikey",
    gatewayPrefix: "gemini/",
  },
};

export const LOCAL_PROVIDERS: Record<
  string,
  {
    displayName: string;
    hasFreeTier: boolean;
  }
> = {
  ollama: {
    displayName: "Ollama",
    hasFreeTier: true,
  },
  lmstudio: {
    displayName: "LM Studio",
    hasFreeTier: true,
  },
};

export const CUSTOM_PROVIDER_PREFIX = "custom::";
