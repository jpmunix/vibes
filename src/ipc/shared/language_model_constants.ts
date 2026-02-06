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
  // DESHABILITADO TEMPORALMENTE - Auto-router funciona mal
  // "auto-router": [
  //   {
  //     name: "auto",
  //     displayName: "Selección Automática",
  //     description:
  //       "La IA analiza tu tarea y selecciona automáticamente el mejor modelo según complejidad",
  //     maxOutputTokens: undefined,
  //     contextWindow: undefined,
  //     temperature: 0,
  //     dollarSigns: 2,
  //     brainSigns: 2,
  //     tag: "Auto",
  //     tagColor: "blue",
  //   },
  // ],
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
