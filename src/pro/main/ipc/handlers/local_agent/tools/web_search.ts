import { z } from "zod";
import log from "electron-log";
import {
  ToolDefinition,
  AgentContext,
  escapeXmlAttr,
  escapeXmlContent,
} from "./types";
import { engineFetch } from "./engine_fetch";
import { readSettings } from "@/main/settings";

const logger = log.scope("web_search");

const webSearchSchema = z.object({
  query: z.string().describe("The search query to look up on the web"),
});

const DESCRIPTION = `
Usa esta herramienta para acceder a información en tiempo real más allá de la fecha de corte de tus datos de entrenamiento.

Cuándo buscar:
- Documentación actual de API, versiones de librerías o cambios importantes
- Mejores prácticas recientes, avisos de seguridad o correcciones de errores
- Mensajes de error específicos o soluciones de resolución de problemas
- Actualizaciones recientes de frameworks o avisos de obsolescencia

Consejos para la consulta:
- Sé específico: Incluye números de versión, mensajes de error exactos o términos técnicos
- Añade contexto: "React 19 useEffect cleanup" en lugar de solo "React hooks"

Ejemplos:

<example>
Nombres de modelos de la API de OpenAI GPT-5
</example>

<example>
NextJS 14 app router middleware auth
</example>
`;

/**
 * Parse SSE events from a buffer and extract content deltas.
 * Returns the remaining unparsed buffer.
 * Throws an error if an SSE error event is received.
 */
function parseSSEEvents(
  buffer: string,
  onContent: (content: string) => void,
): string {
  const lines = buffer.split("\n");
  // Keep the last potentially incomplete line
  const remaining = lines.pop() ?? "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith("data: ")) {
      continue;
    }

    const data = trimmed.slice(6); // Remove "data: " prefix

    // Check for stream end marker
    if (data === "[DONE]") {
      continue;
    }

    try {
      const json = JSON.parse(data);

      // Check for OpenAI-style SSE error: { error: { message: "...", type: "...", code: "..." } }
      if (json.error) {
        const errorMessage =
          json.error.message || json.error.type || "Unknown SSE error";
        throw new Error(`Web search SSE error: ${errorMessage}`);
      }

      // OpenAI-style SSE format: { choices: [{ delta: { content: "..." } }] }
      const content = json.choices?.[0]?.delta?.content;
      if (content) {
        onContent(content);
      }
    } catch (e) {
      // Re-throw SSE errors
      if (e instanceof Error && e.message.startsWith("Web search SSE error:")) {
        throw e;
      }
      // Skip malformed JSON lines
      logger.warn("Failed to parse SSE JSON:", data);
    }
  }

  return remaining;
}

/**
 * Call Serper.dev API for web search
 */
async function callSerperSearch(
  query: string,
  ctx: AgentContext,
  apiKey: string,
): Promise<string> {
  ctx.onXmlStream(`<dyad-web-search query="${escapeXmlAttr(query)}">`);

  const url = `https://google.serper.dev/search?q=${encodeURIComponent(query)}&gl=es&hl=es`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Serper search failed: ${response.status} ${response.statusText} - ${errorText}`,
    );
  }

  const data = await response.json();

  // Convert JSON response to readable text format
  let result = `# Resultados de búsqueda para: "${query}"\n\n`;

  // Add organic results
  if (data.organic && Array.isArray(data.organic)) {
    result += "## Resultados principales:\n\n";
    for (const item of data.organic.slice(0, 5)) {
      result += `### ${item.title}\n`;
      result += `**URL:** ${item.link}\n`;
      if (item.snippet) {
        result += `${item.snippet}\n`;
      }
      result += "\n";
    }
  }

  // Add answer box if present
  if (data.answerBox) {
    result += "## Respuesta destacada:\n\n";
    if (data.answerBox.answer) {
      result += `${data.answerBox.answer}\n\n`;
    }
    if (data.answerBox.snippet) {
      result += `${data.answerBox.snippet}\n\n`;
    }
  }

  // Add knowledge graph if present
  if (data.knowledgeGraph) {
    result += "## Información adicional:\n\n";
    if (data.knowledgeGraph.title) {
      result += `**${data.knowledgeGraph.title}**\n`;
    }
    if (data.knowledgeGraph.description) {
      result += `${data.knowledgeGraph.description}\n`;
    }
  }

  // Stream the result
  ctx.onXmlStream(
    `<dyad-web-search query="${escapeXmlAttr(query)}">${escapeXmlContent(result)}`,
  );

  return result;
}

/**
 * Call the web search SSE endpoint and stream results (legacy Dyad Pro)
 */
async function callWebSearchSSE(
  query: string,
  ctx: AgentContext,
): Promise<string> {
  ctx.onXmlStream(`<dyad-web-search query="${escapeXmlAttr(query)}">`);

  const response = await engineFetch(ctx, "/tools/web-search", {
    method: "POST",
    headers: {
      Accept: "text/event-stream",
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Web search failed: ${response.status} ${response.statusText} - ${errorText}`,
    );
  }

  if (!response.body) {
    throw new Error("Web search response has no body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let accumulated = "";
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Parse SSE events and accumulate content
      buffer = parseSSEEvents(buffer, (content) => {
        accumulated += content;
        // Stream intermediate results to UI with dyad-web-search prefix
        ctx.onXmlStream(
          `<dyad-web-search query="${escapeXmlAttr(query)}">${escapeXmlContent(accumulated)}`,
        );
      });
    }

    // Handle any remaining buffer content
    if (buffer.trim()) {
      parseSSEEvents(buffer + "\n", (content) => {
        accumulated += content;
      });
    }
  } finally {
    reader.releaseLock();
  }

  return accumulated;
}

export const webSearchTool: ToolDefinition<z.infer<typeof webSearchSchema>> = {
  name: "web_search",
  description: DESCRIPTION,
  inputSchema: webSearchSchema,
  defaultConsent: "ask",

  // Enable only if Serper API key is configured
  isEnabled: (ctx) => {
    const settings = readSettings();
    return !!settings.serperApiKey?.value;
  },

  getConsentPreview: (args) => `Search the web: "${args.query}"`,

  execute: async (args, ctx: AgentContext) => {
    logger.log(`Executing web search: ${args.query}`);

    const settings = readSettings();
    const serperApiKey = settings.serperApiKey?.value;

    if (!serperApiKey) {
      throw new Error("Serper API key not configured. Please configure it in settings.");
    }

    const result = await callSerperSearch(args.query, ctx, serperApiKey);

    if (!result) {
      throw new Error("Web search returned no results");
    }

    // Write final result to UI and DB with dyad-web-search wrapper
    ctx.onXmlComplete(
      `<dyad-web-search query="${escapeXmlAttr(args.query)}">${escapeXmlContent(result)}</dyad-web-search>`,
    );

    logger.log(`Web search completed for query: ${args.query}`);
    return result;
  },
};
