import { createTypedHandler } from "./base";
import { miscContracts } from "../types/misc";
import { openRouterCompletion } from "../utils/openrouter";
import log from "electron-log";

const logger = log.scope("playground");

// Active AbortController for cancellation support
let activeController: AbortController | null = null;

export function registerPlaygroundHandlers() {
  createTypedHandler(miscContracts.playgroundCompletion, async (_, { model, prompt }) => {
    logger.info(`Playground completion request: model=${model}`);

    // Abort any previous in-flight request
    if (activeController) {
      activeController.abort();
    }

    const controller = new AbortController();
    activeController = controller;

    try {
      const data = await openRouterCompletion({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        title: "playground",
        signal: controller.signal,
      });

      const text =
        data?.choices?.[0]?.message?.content ||
        JSON.stringify(data, null, 2);

      return {
        text,
        inputTokens: data?.usage?.prompt_tokens,
        outputTokens: data?.usage?.completion_tokens,
      };
    } catch (error: any) {
      if (error.name === "AbortError" || controller.signal.aborted) {
        logger.info(`Playground request cancelled: model=${model}`);
        throw new Error("Cancelado");
      }
      logger.error("Playground completion failed:", error);
      return {
        text: `Error: ${error.message || String(error)}`,
      };
    } finally {
      if (activeController === controller) {
        activeController = null;
      }
    }
  });

  createTypedHandler(miscContracts.playgroundCancel, async () => {
    if (activeController) {
      logger.info("Playground cancel requested");
      activeController.abort();
      activeController = null;
      return { cancelled: true };
    }
    return { cancelled: false };
  });

  // ── Playground analysis ──────────────────────────────────────────────────
  createTypedHandler(miscContracts.playgroundAnalyze, async (_, { model, originalPrompt, results }) => {
    logger.info(`Playground analysis request: model=${model}, results=${results.length}`);

    const completedResults = results.filter(r => !r.error && !r.timeout);
    if (completedResults.length === 0) {
      return { text: JSON.stringify({ error: "No hay resultados completados para analizar." }) };
    }

    const systemPrompt = `Eres un analista experto de primer nivel especializado en evaluar y comparar respuestas generadas por modelos de inteligencia artificial. Tu misión es determinar cuáles son las mejores respuestas entre un conjunto de candidatos.

Se te proporcionará:
1. El prompt original que se envió a todos los modelos
2. Las respuestas de cada modelo junto con sus métricas de rendimiento (tiempo de respuesta, tokens de entrada/salida)

Debes responder EXCLUSIVAMENTE en formato JSON válido con la siguiente estructura exacta:

{
  "best_quality_time_ratio": {
    "model_api_name": "<apiName del modelo ganador>",
    "model_display_name": "<nombre visible del modelo ganador>",
    "score": <número de 1 a 100>,
    "reasoning": "<explicación detallada de por qué este modelo ofrece la mejor relación calidad/tiempo>"
  },
  "best_quality_only": {
    "model_api_name": "<apiName del modelo ganador>",
    "model_display_name": "<nombre visible del modelo ganador>",
    "score": <número de 1 a 100>,
    "reasoning": "<explicación detallada de por qué este modelo tiene la mejor calidad absoluta>"
  },
  "rankings": [
    {
      "model_api_name": "<apiName>",
      "model_display_name": "<nombre visible>",
      "quality_score": <1-100>,
      "speed_score": <1-100>,
      "overall_score": <1-100>,
      "brief": "<resumen breve de fortalezas/debilidades>"
    }
  ],
  "summary": "<resumen ejecutivo general de la comparativa en 2-3 frases>"
}

CRITERIOS DE EVALUACIÓN:
- Calidad: Precisión, completitud, coherencia, relevancia al prompt, y profundidad de la respuesta
- Velocidad: Tiempo de respuesta (menor = mejor) 
- Relación calidad/tiempo: Un modelo puede ser ligeramente inferior en calidad pero mucho más rápido, lo que lo hace más eficiente
- Los rankings deben estar ordenados de mejor a peor en puntuación general (overall_score)

Responde SOLO con el JSON, sin texto adicional ni markdown.`;

    const userContent = `## Prompt Original
${originalPrompt}

## Respuestas de los Modelos

${completedResults.map((r, i) => `### Modelo ${i + 1}: ${r.modelDisplayName} (${r.modelApiName})
- Tiempo de respuesta: ${(r.durationMs / 1000).toFixed(2)}s (${r.durationMs}ms)
${r.inputTokens != null ? `- Tokens de entrada: ${r.inputTokens}` : ''}
${r.outputTokens != null ? `- Tokens de salida: ${r.outputTokens}` : ''}
- Longitud de respuesta: ${r.text.length} caracteres

**Respuesta:**
\`\`\`
${r.text.slice(0, 8000)}${r.text.length > 8000 ? '\n... (truncado)' : ''}
\`\`\`
`).join('\n---\n\n')}`;

    try {
      const data = await openRouterCompletion({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        temperature: 0.3,
        title: "playground-analysis",
        response_format: { type: "json_object" },
      });

      const text = data?.choices?.[0]?.message?.content || JSON.stringify(data, null, 2);
      return { text };
    } catch (error: any) {
      logger.error("Playground analysis failed:", error);
      return { text: JSON.stringify({ error: error.message || String(error) }) };
    }
  });

  logger.info("Registered playground handlers");
}
