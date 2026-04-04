// TODO: Switch back when reasoning_details encryption issue is fixed
// import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type {
  LargeLanguageModel,
  UserSettings,
} from "../../lib/schemas";
import { getEnvVar } from "./read_env";
import log from "electron-log";
import {
  FREE_OPENROUTER_MODEL_NAMES,
  GEMINI_3_FLASH,
  GPT_5_2_MODEL_NAME,
  SONNET_4_5,
} from "../shared/language_model_constants";
import { getLanguageModelProviders } from "../shared/language_model_helpers";
import { LanguageModelProvider } from "@/ipc/types";
import {
  createVibesEngine,
  type VibesEngineProvider,
} from "./llm_engine_provider";

import { LM_STUDIO_BASE_URL } from "./lm_studio_utils";
import { createOllamaProvider } from "./ollama_provider";
import { getOllamaApiUrl } from "../handlers/local_model_ollama_handler";
import { createFallback } from "./fallback_ai_model";

const vibesEngineUrl = process.env.VIBES_ENGINE_URL;
const disableRemoteEngine =
  process.env.VIBES_DISABLE_REMOTE_ENGINE === "true" ||
  process.env.VIBES_ENABLE_REMOTE_ENGINE === "false";

const AUTO_MODELS = [
  {
    provider: "openai",
    name: GPT_5_2_MODEL_NAME,
  },
  {
    provider: "anthropic",
    name: SONNET_4_5,
  },
  {
    provider: "google",
    name: GEMINI_3_FLASH,
  },
  {
    provider: "google",
    name: "gemini-2.5-flash",
  },
];

export interface ModelClient {
  model: LanguageModel;
  builtinProviderId?: string;
}

const logger = log.scope("getModelClient");
export async function getModelClient(
  model: LargeLanguageModel,
  settings: UserSettings,
  // files?: File[],
): Promise<{
  modelClient: ModelClient;
  isEngineEnabled?: boolean;
  isSmartContextEnabled?: boolean;
}> {
  const allProviders = await getLanguageModelProviders();

  const vibesApiKey = settings.providerSettings?.auto?.apiKey?.value;

  // --- Handle specific provider ---
  const providerConfig = allProviders.find((p) => p.id === model.provider);

  if (!providerConfig) {
    throw new Error(`Configuration not found for provider: ${model.provider}`);
  }

  if (disableRemoteEngine) {
    logger.warn(
      "Remote Vibes engine disabled via env (VIBES_DISABLE_REMOTE_ENGINE=true or VIBES_ENABLE_REMOTE_ENGINE=false); using direct provider clients.",
    );
  }

  // Handle Vibes Pro override
  if (vibesApiKey && !disableRemoteEngine) {
    // Check if the selected provider supports Vibes Pro (has a gateway prefix) OR
    // we're using local engine.
    // IMPORTANT: some providers like OpenAI have an empty string gateway prefix,
    // so we do a nullish and not a truthy check here.
    if (providerConfig.gatewayPrefix != null || vibesEngineUrl) {
      const enableSmartFilesContext = settings.enableProSmartFilesContextMode;
      const provider = createVibesEngine({
        apiKey: vibesApiKey,
        baseURL: vibesEngineUrl ?? "https://engine.dyad.sh/v1",
        vibesOptions: {
          enableLazyEdits:
            settings.selectedChatMode === "ask"
              ? false
              : settings.enableProLazyEditsMode &&
              settings.proLazyEditsMode !== "v2",
          enableSmartFilesContext,
        },
        settings,
      });

      logger.info(
        `\x1b[1;97;44m Using Vibes Pro API key for model: ${model.name} \x1b[0m`,
      );

      logger.info(
        `\x1b[1;30;42m Using Vibes Pro engine: ${vibesEngineUrl ?? "<prod>"} \x1b[0m`,
      );

      // Do not use free variant (for openrouter).
      const modelName = model.name.split(":free")[0];
      const proModelClient = getProModelClient({
        model,
        settings,
        provider,
        modelId: `${providerConfig.gatewayPrefix || ""}${modelName}`,
      });

      return {
        modelClient: proModelClient,
        isEngineEnabled: true,
        isSmartContextEnabled: enableSmartFilesContext,
      };
    } else {
      logger.warn(
        `Vibes Pro enabled, but provider ${model.provider} does not have a gateway prefix defined. Falling back to direct provider connection.`,
      );
      // Fall through to regular provider logic if gateway prefix is missing
    }
  }
  // Handle 'auto' provider by trying each model in AUTO_MODELS until one works
  if (model.provider === "auto") {
    if (model.name === "free") {
      const openRouterProvider = allProviders.find(
        (p) => p.id === "openrouter",
      );
      if (!openRouterProvider) {
        throw new Error("OpenRouter provider not found");
      }
      return {
        modelClient: {
          model: createFallback({
            models: FREE_OPENROUTER_MODEL_NAMES.map(
              (name: string) =>
                getRegularModelClient(
                  { provider: "openrouter", name },
                  settings,
                  openRouterProvider,
                ).modelClient.model,
            ),
          }),
          builtinProviderId: "openrouter",
        },
        isEngineEnabled: false,
      };
    }
    for (const autoModel of AUTO_MODELS) {
      const providerInfo = allProviders.find(
        (p) => p.id === autoModel.provider,
      );
      const envVarName = providerInfo?.envVarName;

      const apiKey =
        settings.providerSettings?.[autoModel.provider]?.apiKey?.value ||
        (envVarName ? getEnvVar(envVarName) : undefined);

      if (apiKey) {
        logger.log(
          `Using provider: ${autoModel.provider} model: ${autoModel.name}`,
        );
        // Recursively call with the specific model found
        return await getModelClient(
          {
            provider: autoModel.provider,
            name: autoModel.name,
          },
          settings,
        );
      }
    }
    // If no models have API keys, throw an error
    throw new Error(
      "No API keys available for any model supported by the 'auto' provider.",
    );
  }
  return getRegularModelClient(model, settings, providerConfig);
}

function getProModelClient({
  model,
  settings,
  provider,
  modelId,
}: {
  model: LargeLanguageModel;
  settings: UserSettings;
  provider: VibesEngineProvider;
  modelId: string;
}): ModelClient {
  if (
    settings.selectedChatMode === "agent" &&
    model.provider === "auto" &&
    model.name === "auto"
  ) {
    return {
      // We need to do the fallback here (and not server-side)
      // because GPT-5* models need to use responses API to get
      // full functionality (e.g. thinking summaries).
      model: createFallback({
        models: [
          // openai requires no prefix.
          provider.responses(`${GPT_5_2_MODEL_NAME}`, { providerId: "openai" }),
          provider(`anthropic/${SONNET_4_5}`, { providerId: "anthropic" }),
          provider(`gemini/${GEMINI_3_FLASH}`, { providerId: "google" }),
        ],
      }),
      // Using openAI as the default provider.
      // TODO: we should remove this and rely on the provider id passed into the provider().
      builtinProviderId: "openai",
    };
  }
  if (
    settings.selectedChatMode === "agent" &&
    model.provider === "openai"
  ) {
    return {
      model: provider.responses(modelId, { providerId: model.provider }),
      builtinProviderId: model.provider,
    };
  }
  return {
    model: provider(modelId, { providerId: model.provider }),
    builtinProviderId: model.provider,
  };
}

function getRegularModelClient(
  model: LargeLanguageModel,
  settings: UserSettings,
  providerConfig: LanguageModelProvider,
): {
  modelClient: ModelClient;
  backupModelClients: ModelClient[];
} {
  // Get API key for the specific provider
  let apiKey =
    settings.providerSettings?.[model.provider]?.apiKey?.value ||
    (providerConfig.envVarName
      ? getEnvVar(providerConfig.envVarName)
      : undefined);

  // Special handling for OpenRouter multiple keys
  if (model.provider === "openrouter") {
    const openRouterSettings = settings.providerSettings?.openrouter as any;
    if (
      openRouterSettings?.selectedKeyId &&
      openRouterSettings?.keys?.length > 0
    ) {
      const selectedKey = openRouterSettings.keys.find(
        (k: any) => k.id === openRouterSettings.selectedKeyId,
      );
      if (selectedKey?.key?.value) {
        apiKey = selectedKey.key.value;
      }
    }
  }

  const providerId = providerConfig.id;
  // Create client based on provider ID or type
  switch (providerId) {
    case "openrouter": {
      // NOTE: Using createOpenAICompatible instead of createOpenRouter because
      // the official SDK (@openrouter/ai-sdk-provider) prioritizes encrypted
      // reasoning_details over plain text reasoning, causing [REDACTED] to appear.
      // Switch back to createOpenRouter when this is fixed upstream.
      const webSearchEnabled = settings.enableWebSearch !== false;
      const provider = createOpenAICompatible({
        name: "openrouter",
        baseURL: "https://openrouter.ai/api/v1",
        apiKey,
        // Inject OpenRouter server tools (e.g. web_search) into the request body.
        // The SDK builds the standard `tools` array from AI SDK tool definitions;
        // we merge our server tools alongside them so both coexist in one request.
        transformRequestBody: webSearchEnabled
          ? (body: Record<string, any>) => {
              const serverTools: any[] = [
                { type: "openrouter:web_search" },
              ];
              const existingTools = body.tools;
              return {
                ...body,
                tools: existingTools
                  ? [...existingTools, ...serverTools]
                  : serverTools,
              };
            }
          : undefined,
      });
      return {
        modelClient: {
          model: provider(model.name),
          builtinProviderId: providerId,
        },
        backupModelClients: [],
      };
    }

    case "ollama": {
      const provider = createOllamaProvider({ baseURL: getOllamaApiUrl() });
      return {
        modelClient: {
          model: provider(model.name),
          builtinProviderId: providerId,
        },
        backupModelClients: [],
      };
    }
    case "lmstudio": {
      // LM Studio uses OpenAI compatible API
      const baseURL = providerConfig.apiBaseUrl || LM_STUDIO_BASE_URL + "/v1";
      const provider = createOpenAICompatible({
        name: "lmstudio",
        baseURL,
      });
      return {
        modelClient: {
          model: provider(model.name),
        },
        backupModelClients: [],
      };
    }

    default: {
      // Handle custom providers
      if (providerConfig.type === "custom") {
        if (!providerConfig.apiBaseUrl) {
          throw new Error(
            `Custom provider ${model.provider} is missing the API Base URL.`,
          );
        }
        // Assume custom providers are OpenAI compatible for now
        const provider = createOpenAICompatible({
          name: providerConfig.id,
          baseURL: providerConfig.apiBaseUrl,
          apiKey,
        });
        return {
          modelClient: {
            model: provider(model.name),
          },
          backupModelClients: [],
        };
      }
      // If it's not a known ID and not type 'custom', it's unsupported
      throw new Error(`Unsupported model provider: ${model.provider}`);
    }
  }
}
