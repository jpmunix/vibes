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

    logger.info(
      `Task complexity: ${complexity}, Type: ${analysis.taskType}, Selected: ${recommendedModel.displayName}`,
    );

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
 * Prioritizes models with low dollarSigns (1-2) and "flash" or "mini" in the name.
 */
function selectRouterModel(
  availableModels: AvailableModel[],
): AvailableModel | null {
  if (availableModels.length === 0) return null;

  // Sort by dollarSigns (prefer cheaper), then by name (prefer "flash" or "mini")
  const sorted = [...availableModels].sort((a, b) => {
    const aDollar = a.dollarSigns ?? 3;
    const bDollar = b.dollarSigns ?? 3;

    if (aDollar !== bDollar) {
      return aDollar - bDollar;
    }

    // Prefer models with "flash" or "mini" in the name
    const aName = a.displayName.toLowerCase();
    const bName = b.displayName.toLowerCase();
    const aIsFast = aName.includes("flash") || aName.includes("mini");
    const bIsFast = bName.includes("flash") || bName.includes("mini");

    if (aIsFast && !bIsFast) return -1;
    if (!aIsFast && bIsFast) return 1;

    return 0;
  });

  return sorted[0];
}

/**
 * Selects the most appropriate model based on task complexity.
 */
function selectModelByComplexity(
  complexity: 1 | 2 | 3 | 4 | 5,
  availableModels: AvailableModel[],
): AvailableModel {
  // Define target ranges for each complexity level
  let targetDollarSigns: number;
  let targetBrainSigns: number;

  if (complexity <= 2) {
    // Simple tasks: prefer cheap, fast models
    targetDollarSigns = 1;
    targetBrainSigns = 1;
  } else if (complexity === 3) {
    // Medium tasks: balanced models
    targetDollarSigns = 2;
    targetBrainSigns = 2;
  } else {
    // Complex tasks: powerful models
    targetDollarSigns = 3;
    targetBrainSigns = 3;
  }

  // Find best match based on target complexity
  const scored = availableModels.map((model) => {
    const dollar = model.dollarSigns ?? 2;
    const brain = model.brainSigns ?? 2;

    // Calculate distance from target (lower is better)
    const dollarDist = Math.abs(dollar - targetDollarSigns);
    const brainDist = Math.abs(brain - targetBrainSigns);
    const totalDist = dollarDist + brainDist;

    // Prefer higher quality if complexity is high
    const qualityBonus = complexity >= 4 ? brain + dollar : 0;

    return {
      model,
      score: totalDist - qualityBonus * 0.5,
    };
  });

  // Sort by score (lower is better)
  scored.sort((a, b) => a.score - b.score);

  return scored[0].model;
}
