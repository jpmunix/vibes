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
  pricingInput?: string;
  pricingOutput?: string;
  inputModalities?: string[];
  outputModalities?: string[];
}

export const GPT_5_2_MODEL_NAME = "gpt-5.2";
export const SONNET_4_5 = "claude-sonnet-4-5-20250929";
export const GEMINI_3_FLASH = "gemini-3-flash-preview";
export const GPT_5_MINI = "openai/gpt-5-mini";

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
      name: "google/gemini-3.1-pro-preview",
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
      name: "anthropic/claude-opus-4.6",
      displayName: "Claude Opus 4.6",
      description:
        "El modelo más potente de Anthropic para código y tareas profesionales de larga duración. Diseñado para agentes que operan en flujos de trabajo completos, destacando en codebases grandes, refactorizaciones complejas y debugging multi-paso. Mantiene coherencia excepcional en outputs muy largos y sesiones extendidas.",
      maxOutputTokens: 128_000,
      contextWindow: 1_000_000,
      temperature: 0,
      dollarSigns: 4,
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
      name: GPT_5_MINI,
      displayName: "GPT-5 Mini",
      description:
        "Versión compacta de GPT-5 para razonamiento ligero. Ofrece la misma precisión y seguridad que GPT-5 con menor latencia y costo. Sucesor de o4-mini.",
      maxOutputTokens: 65_000,
      contextWindow: 400_000,
      temperature: 0,
      dollarSigns: 1,
      brainSigns: 2,
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
    {
      name: "x-ai/grok-4.1-fast",
      displayName: "Grok 4.1 Fast",
      description:
        "Velocidad extrema y razonamiento agudo con una ventana de contexto de 2M; el futuro del tiempo real de xAI.",
      maxOutputTokens: 30_000,
      contextWindow: 2_000_000,
      temperature: 0,
      dollarSigns: 1,
      brainSigns: 1,
    },
    {
      name: "moonshotai/kimi-k2.5",
      displayName: "MoonshotAI: Kimi K2.5",
      description:
        "SOTA en visual coding y paradigma de agentes; excelente razonamiento general y multimodal.",
      maxOutputTokens: 65_000,
      contextWindow: 262_144,
      temperature: 0,
      dollarSigns: 1,
      brainSigns: 2,
    },
    {
      name: "minimax/minimax-m2.5",
      displayName: "MiniMax M2.5",
      description:
        "Modelo SOTA diseñado para productividad del mundo real. Experto en generación y operación de archivos Word, Excel y PowerPoint, cambiando fluidamente entre entornos de software diversos. Destaca en SWE-Bench (80.2%) y es altamente eficiente en tokens gracias a su entrenamiento en planificación optimizada.",
      maxOutputTokens: 131_100,
      contextWindow: 204_800,
      temperature: 0,
      dollarSigns: 1,
      brainSigns: 1,
    },
    {
      name: "x-ai/grok-code-fast-1",
      displayName: "Grok Code Fast 1",
      description:
        "Modelo de razonamiento rápido y económico especializado en coding agentic. Con trazas de razonamiento visibles en la respuesta, permite a los desarrolladores guiar a Grok Code para flujos de trabajo de alta calidad. Ideal para desarrollo ágil con balance entre velocidad y precisión.",
      maxOutputTokens: 10_000,
      contextWindow: 256_000,
      temperature: 0,
      dollarSigns: 1,
      brainSigns: 1,
    },
  ],
};

export const DEFAULT_ENABLED_MODELS: string[] = [
  "google/gemini-3-flash-preview",
  "google/gemini-3.1-pro-preview",
  "google/gemini-2.5-pro",
  "google/gemini-2.5-flash",
  "anthropic/claude-sonnet-4.5",
  "anthropic/claude-opus-4.6",
  "openai/gpt-5.1-codex-mini",
  "openai/gpt-4.1",
  "openai/gpt-4.1-mini",
  "openai/gpt-4.1-nano",
  GPT_5_MINI,
  "qwen/qwen-plus-2025-07-28",
  "x-ai/grok-4.1-fast",
  "moonshotai/kimi-k2.5",
  "minimax/minimax-m2.5",
  "x-ai/grok-code-fast-1",
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
