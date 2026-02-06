import { generateText } from "ai";
import type { LargeLanguageModel, UserSettings } from "@/lib/schemas";
import { getModelClient } from "./get_model_client";
import log from "electron-log";
import {
  MODEL_ROUTER_SYSTEM_PROMPT,
  MODEL_ROUTER_USER_PROMPT_TEMPLATE,
} from "../../prompts/model_router_prompt";

const logger = log.scope("model_router");

export interface TaskAnalysisResult {
  complexity: 1 | 2 | 3 | 4 | 5;
  taskType:
    | "bug-fix"
    | "feature"
    | "refactor"
    | "architecture"
    | "documentation"
    | "explanation"
    | "optimization";
  reasoning: string;
  recommendedModel: LargeLanguageModel;
}

interface AvailableModel {
  model: LargeLanguageModel;
  dollarSigns?: number;
  brainSigns?: number;
  displayName: string;
}

/**
 * Classifies a model into one of the 5 complexity tiers based on its characteristics.
 *
 * Tier 1 (Trivial): nano models
 * Tier 2 (Simple): mini models, fast flash models
 * Tier 3 (Standard): balanced flash/standard models
 * Tier 4 (Advanced): codex-mini, pro models with moderate cost
 * Tier 5 (Complex): top-tier pro models
 */
function classifyModelTier(model: AvailableModel): 1 | 2 | 3 | 4 | 5 {
  const name = model.displayName.toLowerCase();
  const dollar = model.dollarSigns ?? 2;
  const brain = model.brainSigns ?? 2;

  // Tier 1: Nano models (ultra-cheap, minimal reasoning)
  if (name.includes("nano")) {
    return 1;
  }

  // Tier 5: Top-tier models (expensive, max reasoning)
  // gemini-3-pro, claude-sonnet-4.5, gpt-5.2
  if (dollar >= 3 && brain >= 3) {
    return 5;
  }

  // Tier 2: Mini models and cheap flash models
  // gpt-4.1-mini, gemini-2.5-flash (dollar=1, brain≤2)
  if (dollar === 1 && (name.includes("mini") || name.includes("flash"))) {
    return 2;
  }

  // Tier 4: Advanced models (moderate cost, good reasoning)
  // gpt-5.1-codex-mini, gemini-2.5-pro (dollar=2-3, brain=2, not mini/nano)
  if (
    dollar >= 2 &&
    brain >= 2 &&
    !name.includes("mini") &&
    !name.includes("nano") &&
    (name.includes("codex") || name.includes("2.5-pro") || dollar === 3)
  ) {
    return 4;
  }

  // Tier 3: Standard models (balanced)
  // gemini-3-flash, default fallback
  return 3;
}

/**
 * Analyzes task complexity and recommends the most appropriate model
 * from the available provider models.
 */
export async function analyzeAndRouteModel(
  prompt: string,
  availableModels: AvailableModel[],
  settings: UserSettings,
  attachmentCount = 0,
): Promise<TaskAnalysisResult> {
  try {
    // Use the cheapest/fastest available model as the router
    const routerModel = selectRouterModel(availableModels);

    if (!routerModel) {
      logger.warn("No suitable router model found, using first available");
      return {
        complexity: 3,
        taskType: "feature",
        reasoning: "Default routing (no router model available)",
        recommendedModel: availableModels[0].model,
      };
    }

    logger.info(
      `Using ${routerModel.displayName} as router model to analyze task complexity`,
    );

    // Get model client for the router
    const { modelClient } = await getModelClient(routerModel.model, settings);

    // Call the router model to analyze complexity
    const response = await generateText({
      model: modelClient.model,
      messages: [
        {
          role: "system",
          content: MODEL_ROUTER_SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: MODEL_ROUTER_USER_PROMPT_TEMPLATE(prompt, attachmentCount),
        },
      ],
      temperature: 0,
    });

    // Parse the JSON response
    const analysisText = response.text.trim();
    logger.info(`Router analysis response: ${analysisText}`);

    let analysis: {
      complexity: number;
      taskType: string;
      reasoning: string;
    };

    try {
      // Try to extract JSON if wrapped in markdown
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      const jsonText = jsonMatch ? jsonMatch[0] : analysisText;
      analysis = JSON.parse(jsonText);
    } catch (parseError) {
      logger.error("Failed to parse router response:", parseError);
      // Fallback to medium complexity
      analysis = {
        complexity: 3,
        taskType: "feature",
        reasoning: "Failed to parse router response",
      };
    }

    // Validate complexity is in range
    const complexity = Math.max(
      1,
      Math.min(5, analysis.complexity),
    ) as TaskAnalysisResult["complexity"];

    // Select best model based on complexity
    const recommendedModel = selectModelByComplexity(
      complexity,
      availableModels,
    );

    const selectedTier = classifyModelTier(recommendedModel);
    logger.info(
      `Task complexity: ${complexity}, Type: ${analysis.taskType}, Selected: ${recommendedModel.displayName} (Tier ${selectedTier})`,
    );
    logger.info(`Reasoning: ${analysis.reasoning}`);

    return {
      complexity,
      taskType: analysis.taskType as TaskAnalysisResult["taskType"],
      reasoning: analysis.reasoning,
      recommendedModel: recommendedModel.model,
    };
  } catch (error) {
    logger.error("Error in model routing:", error);
    // Fallback to first available model
    return {
      complexity: 3,
      taskType: "feature",
      reasoning: `Error in routing: ${error instanceof Error ? error.message : String(error)}`,
      recommendedModel: availableModels[0].model,
    };
  }
}

/**
 * Selects the cheapest/fastest model as the router.
 * Prioritizes: nano > flash (dollar=1) > mini > others
 */
function selectRouterModel(
  availableModels: AvailableModel[],
): AvailableModel | null {
  if (availableModels.length === 0) return null;

  // Sort by preference: nano > flash > mini, then by cost
  const sorted = [...availableModels].sort((a, b) => {
    const aName = a.displayName.toLowerCase();
    const bName = b.displayName.toLowerCase();
    const aDollar = a.dollarSigns ?? 3;
    const bDollar = b.dollarSigns ?? 3;

    // Highest priority: nano models (gpt-4.1-nano)
    const aIsNano = aName.includes("nano");
    const bIsNano = bName.includes("nano");
    if (aIsNano && !bIsNano) return -1;
    if (!aIsNano && bIsNano) return 1;

    // Second priority: flash models with dollar=1 (gemini-2.5-flash)
    const aIsFlash = aName.includes("flash") && aDollar === 1;
    const bIsFlash = bName.includes("flash") && bDollar === 1;
    if (aIsFlash && !bIsFlash) return -1;
    if (!aIsFlash && bIsFlash) return 1;

    // Third priority: mini models
    const aIsMini = aName.includes("mini");
    const bIsMini = bName.includes("mini");
    if (aIsMini && !bIsMini) return -1;
    if (!aIsMini && bIsMini) return 1;

    // Fallback: cheaper is better
    return aDollar - bDollar;
  });

  return sorted[0];
}

/**
 * Selects the most appropriate model based on task complexity using the new 5-tier system.
 *
 * Strategy:
 * - Tier 1 (Trivial): Prefer nano models
 * - Tier 2 (Simple): Prefer mini/fast flash models
 * - Tier 3 (Standard): Prefer balanced models like gemini-3-flash
 * - Tier 4 (Advanced): Prefer codex-mini, gemini-2.5-pro
 * - Tier 5 (Complex): Prefer top-tier models (gemini-3-pro, claude-sonnet-4.5)
 */
function selectModelByComplexity(
  complexity: 1 | 2 | 3 | 4 | 5,
  availableModels: AvailableModel[],
): AvailableModel {
  // Classify all available models by tier
  const modelsByTier = new Map<number, AvailableModel[]>();
  for (const model of availableModels) {
    const tier = classifyModelTier(model);
    if (!modelsByTier.has(tier)) {
      modelsByTier.set(tier, []);
    }
    modelsByTier.get(tier)!.push(model);
  }

  // Try to find a model matching the exact complexity tier
  const exactMatch = modelsByTier.get(complexity);
  if (exactMatch && exactMatch.length > 0) {
    // If multiple models in the tier, prefer by name patterns
    return selectBestFromTier(exactMatch, complexity);
  }

  // If no exact match, find the closest tier
  const tiers = Array.from(modelsByTier.keys()).sort((a, b) => a - b);
  let closestTier = tiers[0];
  let minDistance = Math.abs(complexity - closestTier);

  for (const tier of tiers) {
    const distance = Math.abs(complexity - tier);
    if (distance < minDistance) {
      minDistance = distance;
      closestTier = tier;
    }
  }

  const closestModels = modelsByTier.get(closestTier)!;
  return selectBestFromTier(closestModels, complexity);
}

/**
 * Selects the best model from a tier based on preferences for that complexity level.
 */
function selectBestFromTier(
  models: AvailableModel[],
  complexity: 1 | 2 | 3 | 4 | 5,
): AvailableModel {
  if (models.length === 1) return models[0];

  // For low complexity (1-2), prefer cheaper/faster
  if (complexity <= 2) {
    const sorted = [...models].sort((a, b) => {
      const aDollar = a.dollarSigns ?? 2;
      const bDollar = b.dollarSigns ?? 2;
      if (aDollar !== bDollar) return aDollar - bDollar;

      // Prefer "nano" > "flash" > "mini"
      const aName = a.displayName.toLowerCase();
      const bName = b.displayName.toLowerCase();
      if (aName.includes("nano") && !bName.includes("nano")) return -1;
      if (!aName.includes("nano") && bName.includes("nano")) return 1;
      if (aName.includes("flash") && !bName.includes("flash")) return -1;
      if (!aName.includes("flash") && bName.includes("flash")) return 1;

      return 0;
    });
    return sorted[0];
  }

  // For high complexity (4-5), prefer more capable models
  if (complexity >= 4) {
    const sorted = [...models].sort((a, b) => {
      const aBrain = a.brainSigns ?? 2;
      const bBrain = b.brainSigns ?? 2;
      if (aBrain !== bBrain) return bBrain - aBrain; // Higher brain is better

      const aDollar = a.dollarSigns ?? 2;
      const bDollar = b.dollarSigns ?? 2;
      return bDollar - aDollar; // Higher dollar (more capable) is better
    });
    return sorted[0];
  }

  // For medium complexity (3), prefer balanced models
  const sorted = [...models].sort((a, b) => {
    const aBalance =
      Math.abs((a.dollarSigns ?? 2) - 2) + Math.abs((a.brainSigns ?? 2) - 2);
    const bBalance =
      Math.abs((b.dollarSigns ?? 2) - 2) + Math.abs((b.brainSigns ?? 2) - 2);
    return aBalance - bBalance; // Closer to 2/2 is better
  });
  return sorted[0];
}
