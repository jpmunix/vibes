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

  // ── Playground Analysis ──────────────────────────────────────────────
  createTypedHandler(miscContracts.playgroundAnalyze, async (_, { model, originalPrompt, results }) => {
    logger.info(`Playground analysis request: model=${model}, results=${results.length}`);

    // Filter out errored/timed-out results
    const valid = results.filter(r => !r.error && !r.timeout && r.text?.trim());
    if (valid.length === 0) {
      return { text: JSON.stringify({ error: "No hay resultados válidos para analizar." }) };
    }

    // Build context block for the analyst
    const resultsBlock = valid.map((r, i) => {
      return `### Modelo ${i + 1}: ${r.modelDisplayName} (${r.modelApiName})
- Latencia: ${r.durationMs}ms
- Tokens entrada: ${r.inputTokens ?? "N/A"}
- Tokens salida: ${r.outputTokens ?? "N/A"}

Respuesta:
${r.text}`;
    }).join("\n\n---\n\n");

    const systemPrompt = `Eres un analista experto en evaluar respuestas de modelos de inteligencia artificial. Tu trabajo es analizar las respuestas dadas por múltiples modelos al mismo prompt y determinar cuál es el mejor.

Tu análisis DEBE ser en formato JSON estricto con esta estructura exacta:
{
  "summary": "Resumen ejecutivo del análisis en 2-3 frases",
  "bestQualityTime": {
    "modelApiName": "nombre_api_del_modelo",
    "modelDisplayName": "Nombre visible",
    "score": 85,
    "justification": "Explicación de por qué gana en relación calidad/tiempo"
  },
  "bestQualityOnly": {
    "modelApiName": "nombre_api_del_modelo",
    "modelDisplayName": "Nombre visible",
    "score": 92,
    "justification": "Explicación de por qué gana en calidad pura"
  },
  "rankings": [
    {
      "position": 1,
      "modelApiName": "nombre_api_del_modelo",
      "modelDisplayName": "Nombre visible",
      "qualityScore": 92,
      "speedScore": 78,
      "overallScore": 87,
      "shortVerdict": "Breve veredicto de 1 frase"
    }
  ]
}

Criterios de evaluación:
- **Calidad**: precisión, completitud, claridad, estructura y relevancia de la respuesta
- **Velocidad**: tiempo de respuesta (latencia) — menor es mejor
- **Relación calidad/tiempo**: el balance óptimo entre ambos factores
- Los scores van de 0 a 100
- El ranking debe incluir TODOS los modelos ordenados por overallScore descendente
- Responde ÚNICAMENTE con el JSON, sin texto adicional`;

    const userMessage = `Prompt original del usuario:
"${originalPrompt}"

Resultados de los modelos:

${resultsBlock}`;

    try {
      const data = await openRouterCompletion({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.3,
        title: "playground-analysis",
        response_format: { type: "json_object" },
      });

      const text = data?.choices?.[0]?.message?.content || "{}";
      return { text };
    } catch (error: any) {
      logger.error("Playground analysis failed:", error);
      return { text: JSON.stringify({ error: error.message || String(error) }) };
    }
  });

  logger.info("Registered playground handlers");
}
