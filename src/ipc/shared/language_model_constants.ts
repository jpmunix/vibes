import { LanguageModel } from "@/ipc/types";

export const PROVIDERS_THAT_SUPPORT_THINKING: (keyof typeof MODEL_OPTIONS)[] = [
  "google",
];

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
}

export const GPT_5_2_MODEL_NAME = "gpt-5.2";
export const SONNET_4_5 = "claude-sonnet-4-5-20250929";
export const GEMINI_3_FLASH = "gemini-3-flash-preview";

export const MODEL_OPTIONS: Record<string, ModelOption[]> = {
  openai: [
    // https://platform.openai.com/docs/models/gpt-5.1
    {
      name: GPT_5_2_MODEL_NAME,
      displayName: "GPT 5.2",
      description: "OpenAI's latest model",
      // Technically it's 128k but OpenAI errors if you set max_tokens instead of max_completion_tokens
      maxOutputTokens: undefined,
      contextWindow: 400_000,
      // Requires temperature to be default value (1)
      temperature: 1,
      dollarSigns: 3,
      brainSigns: 3,
    },
    // https://platform.openai.com/docs/models/gpt-5.1
    {
      name: "gpt-5.1",
      displayName: "GPT 5.1",
      description:
        "OpenAI's flagship model- smarter, faster, and more conversational",
      // Technically it's 128k but OpenAI errors if you set max_tokens instead of max_completion_tokens
      maxOutputTokens: undefined,
      contextWindow: 400_000,
      // Requires temperature to be default value (1)
      temperature: 1,
      dollarSigns: 3,
      brainSigns: 3,
    },
    // https://platform.openai.com/docs/models/gpt-5.1-codex
    {
      name: "gpt-5.1-codex",
      displayName: "GPT 5.1 Codex",
      description: "OpenAI's advanced coding workflows",
      // Technically it's 128k but OpenAI errors if you set max_tokens instead of max_completion_tokens
      maxOutputTokens: undefined,
      contextWindow: 400_000,
      // Requires temperature to be default value (1)
      temperature: 1,
      dollarSigns: 3,
      brainSigns: 3,
    },
    // https://platform.openai.com/docs/models/gpt-5.1-codex-mini
    {
      name: "gpt-5.1-codex-mini",
      displayName: "GPT 5.1 Codex Mini",
      description: "OpenAI's compact and efficient coding model",
      // Technically it's 128k but OpenAI errors if you set max_tokens instead of max_completion_tokens
      maxOutputTokens: undefined,
      contextWindow: 400_000,
      // Requires temperature to be default value (1)
      temperature: 1,
      dollarSigns: 2,
      brainSigns: 2,
    },

    // https://platform.openai.com/docs/models/gpt-5
    {
      name: "gpt-5",
      displayName: "GPT 5",
      description: "OpenAI's flagship model",
      // Technically it's 128k but OpenAI errors if you set max_tokens instead of max_completion_tokens
      maxOutputTokens: undefined,
      contextWindow: 400_000,
      // Requires temperature to be default value (1)
      temperature: 1,
      dollarSigns: 3,
      brainSigns: 3,
    },
    // https://platform.openai.com/docs/models/gpt-5-codex
    {
      name: "gpt-5-codex",
      displayName: "GPT 5 Codex",
      description: "OpenAI's flagship model optimized for coding",
      // Technically it's 128k but OpenAI errors if you set max_tokens instead of max_completion_tokens
      maxOutputTokens: undefined,
      contextWindow: 400_000,
      // Requires temperature to be default value (1)
      temperature: 1,
      dollarSigns: 3,
      brainSigns: 3,
    },
    // https://platform.openai.com/docs/models/gpt-5-mini
    {
      name: "gpt-5-mini",
      displayName: "GPT 5 Mini",
      description: "OpenAI's lightweight, but intelligent model",
      // Technically it's 128k but OpenAI errors if you set max_tokens instead of max_completion_tokens
      maxOutputTokens: undefined,
      contextWindow: 400_000,
      // Requires temperature to be default value (1)
      temperature: 1,
      dollarSigns: 2,
      brainSigns: 2,
    },
  ],
  // https://docs.anthropic.com/en/docs/about-claude/models/all-models#model-comparison-table
  anthropic: [
    {
      name: "claude-opus-4-5",
      displayName: "Claude Opus 4.5",
      description:
        "Anthropic's best model for coding (note: this model is very expensive!)",
      // Set to 32k since context window is 1M tokens
      maxOutputTokens: 32_000,
      contextWindow: 200_000,
      temperature: 0,
      dollarSigns: 5,
      brainSigns: 3,
    },
    {
      name: SONNET_4_5,
      displayName: "Claude Sonnet 4.5",
      description:
        "Anthropic's best model for coding (note: >200k tokens is very expensive!)",
      // Set to 32k since context window is 1M tokens
      maxOutputTokens: 32_000,
      contextWindow: 1_000_000,
      temperature: 0,
      dollarSigns: 5,
      brainSigns: 3,
    },
    {
      name: "claude-sonnet-4-20250514",
      displayName: "Claude Sonnet 4",
      description: "Excellent coder (note: >200k tokens is very expensive!)",
      // Set to 32k since context window is 1M tokens
      maxOutputTokens: 32_000,
      contextWindow: 1_000_000,
      temperature: 0,
      dollarSigns: 5,
      brainSigns: 2,
    },
  ],
  google: [
    // https://ai.google.dev/gemini-api/docs/models#gemini-3-pro
    {
      name: "gemini-3-pro-preview",
      displayName: "Gemini 3 Pro (Preview)",
      description: "Google's latest Gemini model",
      // See Flash 2.5 comment below (go 1 below just to be safe, even though it seems OK now).
      maxOutputTokens: 65_536 - 1,
      // Gemini context window = input token + output token
      contextWindow: 1_048_576,
      // Recommended by Google: https://ai.google.dev/gemini-api/docs/gemini-3?thinking=high#temperature
      temperature: 1.0,
      dollarSigns: 4,
      brainSigns: 3,
    },
    // https://ai.google.dev/gemini-api/docs/models#gemini-3-pro
    {
      name: GEMINI_3_FLASH,
      displayName: "Gemini 3 Flash (Preview)",
      description: "Powerful coding model at a good price",
      // See Flash 2.5 comment below (go 1 below just to be safe, even though it seems OK now).
      maxOutputTokens: 65_536 - 1,
      // Gemini context window = input token + output token
      contextWindow: 1_048_576,
      // Recommended by Google: https://ai.google.dev/gemini-api/docs/gemini-3?thinking=high#temperature
      temperature: 1.0,
      dollarSigns: 2,
      brainSigns: 2,
    },
    // https://ai.google.dev/gemini-api/docs/models#gemini-2.5-pro-preview-03-25
    {
      name: "gemini-2.5-pro",
      displayName: "Gemini 2.5 Pro",
      description: "Google's Gemini 2.5 Pro model",
      // See Flash 2.5 comment below (go 1 below just to be safe, even though it seems OK now).
      maxOutputTokens: 65_536 - 1,
      // Gemini context window = input token + output token
      contextWindow: 1_048_576,
      temperature: 0,
      dollarSigns: 3,
      brainSigns: 2,
    },
    // https://ai.google.dev/gemini-api/docs/models#gemini-2.5-flash-preview
    {
      name: "gemini-flash-latest",
      displayName: "Gemini 2.5 Flash",
      description: "Google's Gemini 2.5 Flash model (free tier available)",
      // Weirdly for Vertex AI, the output token limit is *exclusive* of the stated limit.
      maxOutputTokens: 65_536 - 1,
      // Gemini context window = input token + output token
      contextWindow: 1_048_576,
      temperature: 0,
      dollarSigns: 2,
      brainSigns: 2,
    },
  ],
  openrouter: [
    {
      name: "google/gemini-3-flash-preview",
      displayName: "Gemini 3 Flash",
      description: "Ideal para el desarrollo diario",
      maxOutputTokens: 65_000,
      contextWindow: 1_000_000,
      temperature: 0,
      dollarSigns: 2,
      brainSigns: 2,
    },
    {
      name: "google/gemini-3-pro-preview",
      displayName: "Gemini 3 Pro",
      description: "Ideal para resolver bugs o problemas más complejos",
      maxOutputTokens: 65_000,
      contextWindow: 1_000_000,
      temperature: 0,
      dollarSigns: 3,
      brainSigns: 3,
    },
    {
      name: "google/gemini-2.5-pro",
      displayName: "Gemini 2.5 Pro",
      description:
        "Élite en razonamiento lógico y código complejo; costo medio-alto con velocidad moderada",
      maxOutputTokens: 65_000,
      contextWindow: 1_000_000,
      temperature: 0,
      dollarSigns: 3,
      brainSigns: 2,
    },
    {
      name: "google/gemini-2.5-flash",
      displayName: "Gemini 2.5 Flash",
      description:
        "Equilibrio óptimo: código sólido, extremadamente rápido y el más económico de su clase.",
      maxOutputTokens: 65_000,
      contextWindow: 1_000_000,
      temperature: 0,
      dollarSigns: 1,
      brainSigns: 2,
    },
    {
      name: "anthropic/claude-sonnet-4.5",
      displayName: "Claude Sonnet 4.5",
      description:
        'El equilibrio perfecto; código con "sentido común", razonamiento humano superior y velocidad media a un precio altamente eficiente',
      maxOutputTokens: 65_000,
      contextWindow: 1000000,
      temperature: 0,
      dollarSigns: 3,
      brainSigns: 3,
    },
    {
      name: "openai/gpt-5.1-codex-mini",
      displayName: "GPT 5.1 Codex mini",
      description:
        "Revolucionario en síntesis: código moderno, costo competitivo y gran rapidez",
      maxOutputTokens: 100_000,
      contextWindow: 400_000,
      temperature: 0,
      dollarSigns: 2,
      brainSigns: 2,
    },
    {
      name: "openai/gpt-4.1",
      displayName: "GPT 4.1",
      description:
        "El estándar de oro: código muy refinado y fiable, precio alto y velocidad constante.",
      maxOutputTokens: 32_000,
      contextWindow: 1_000_000,
      temperature: 0,
      dollarSigns: 3,
      brainSigns: 2,
    },
    {
      name: "openai/gpt-4.1-mini",
      displayName: "GPT 4.1 mini",
      description:
        "Eficiencia pura: ideal para scripts rápidos y tareas repetitivas, muy barato y veloz",
      maxOutputTokens: 32_000,
      contextWindow: 1_000_000,
      temperature: 0,
      dollarSigns: 1,
      brainSigns: 1,
    },
    {
      name: "openai/gpt-4.1-nano",
      displayName: "GPT 4.1 nano",
      description:
        'Instantáneo y casi gratuito; perfecto para "snippets" simples o autocompletado básico.',
      maxOutputTokens: 32_000,
      contextWindow: 1_000_000,
      temperature: 0,
      dollarSigns: 1,
      brainSigns: 1,
    },
    {
      name: "qwen/qwen-plus-2025-07-28",
      displayName: "Qwen Plus",
      description:
        "La alternativa potente: excelente en algoritmos, muy económico y velocidad estable.",
      maxOutputTokens: 32_000,
      contextWindow: 1_000_000,
      temperature: 0,
      dollarSigns: 2,
      brainSigns: 2,
    },
  ],
};

export const TURBO_MODELS: LanguageModel[] = [
  {
    apiName: "glm-4.7:turbo",
    displayName: "GLM 4.7",
    description: "Strong coding model (very fast)",
    maxOutputTokens: 32_000,
    contextWindow: 131_000,
    temperature: 0.7,
    dollarSigns: 3,
    brainSigns: 2,
    type: "cloud",
  },
  {
    apiName: "kimi-k2:turbo",
    displayName: "Kimi K2",
    description: "Kimi 0905 update (fast)",
    maxOutputTokens: 16_000,
    contextWindow: 256_000,
    temperature: 0,
    dollarSigns: 2,
    brainSigns: 2,
    type: "cloud",
  },
];

export const FREE_OPENROUTER_MODEL_NAMES = MODEL_OPTIONS.openrouter
  .filter((model) => model.name.endsWith(":free"))
  .map((model) => model.name);

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
