import { stripDsmlToolCallBlocks } from "@vibes/providers/openai-compatible";
import { normalizeLegacyTags } from "../../../shared/normalizeLegacyTags";

/**
 * Elimina el bloque de texto plano que el bridge inyecta en la hidratación
 * del prompt del LLM:
 *
 *   [Previous Turn Context Summary]
 *   Read: a.ts, b.ts
 *   Listed: src
 *   Modified: c.ts
 *
 * Este texto es memoria de trabajo para el MODELO (ver
 * `runtime_bridge.ts` → `convertHistoryToRuntimeMessages`), no contenido que
 * el usuario deba ver. El LLM a veces lo reproduce al final de su propia
 * respuesta; esa réplica persiste en Bunny y se renderizaba como prosa.
 *
 * Solo afecta al render: el prompt al LLM se construye aparte, así que
 * quitarlo aquí no rompe la memoria entre turnos. Se corta hasta el
 * marcador y se limpia el sangrado sobrante (los `\n\n` previos).
 */
export function stripPreviousTurnSummary(text: string): string {
  const idx = text.indexOf("[Previous Turn Context Summary]");
  if (idx === -1) return text;
  return text.slice(0, idx).replace(/\s+$/, "") + "\n";
}

/**
 * Elimina bloques completos `<vibes-context-summary>…</vibes-context-summary>`
 * del contenido visible. Son metadata interna que el runtime inyecta al final
 * de cada turno (memoria entre turnos; la lee
 * `runtime_bridge.convertHistoryToRuntimeMessages` directamente de la DB para
 * la hidratación del siguiente turno) y NO deben pintarse en la UI.
 *
 * El LLM a veces los reproduce en su respuesta (porque el summary hidratado
 * viaja en su prompt como "[Previous Turn Context Summary]"), y quedan
 * persistidos en el content del mensaje. Como la hidratación del runtime lee
 * el content CRUDO de la DB (antes de cualquier limpieza de render), podemos
 * quitarlos aquí sin romper la memoria entre turnos: retroactividad pura
 * sobre chats viejos, sin migración de DB.
 *
 * Solo afecta al render. Se deja además un strip defensivo en los
 * `parseCustomTags` (worker + componente) para usos del parser con content
 * crudo desde otros sitios.
 */
export function stripContextSummaryTags(text: string): string {
  let out = text;
  // 1) Bloques completos (con o sin atributos).
  out = out.replace(
    /<vibes-context-summary(?:\s[^>]*)?>[\s\S]*?<\/vibes-context-summary>/gi,
    "",
  );
  // 2) Tags sueltos de apertura/cierre que hayan quedado (el modelo a veces
  //    reproduce solo el cierre, p.ej. `</vibes-context-summary>` doble, o la
  //    apertura sin su cierre). Son metadata: nunca deben verse en la UI.
  out = out.replace(/<\/?vibes-context-summary(?:\s[^>]*)?>/gi, "");
  return out;
}

/**
 * Elimina tags de pensamiento huérfanos o sueltos que el modelo o los deltas
 * hayan dejado en el contenido.
 *
 * Durante el streaming o al formatear deltas con tools intermedias, los modelos
 * (especialmente DeepSeek u otros con inline thinking) emiten cierres como
 * `</think>`, `</thought>` o `</vibes-think>` sin apertura correspondiente en
 * ese bloque de texto (o tras ser separado por una tool).
 *
 * ¡CRÍTICO!: Enmascaramos los bloques de tool (`<vibes-...>...</vibes-...>`)
 * primero para que si el agente leyó código que contiene `<think>` (p.ej.
 * version_handlers.ts con regexes de think), ese `<think>` dentro del código
 * no cuente como apertura y deje escapar el `</think>` huérfano de la prosa.
 */
export function stripOrphanThinkTags(text: string): string {
  // 1) Enmascarar custom tags de Vibes (<vibes-...>...</vibes-...>) para no
  // contaminar el conteo con fragmentos de código leídos/editados.
  const toolBlocks: string[] = [];
  let masked = text.replace(
    /<(vibes-[\w-]+)(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi,
    (m) => {
      const idx = toolBlocks.length;
      toolBlocks.push(m);
      return `___VIBES_TOOL_BLOCK_${idx}___`;
    },
  );

  // 2) Convertir pares válidos de pensamiento a <vibes-think>
  masked = masked.replace(
    /<(?:think|thought|thinking|vibes-think)(?:\s[^>]*)?>([\s\S]*?)<\/(?:think|thought|thinking|vibes-think)>/gi,
    "<vibes-think>$1</vibes-think>",
  );

  // 3) Eliminar cualquier apertura o cierre de think huérfano que haya quedado en la prosa
  masked = masked.replace(/<\/?(?:think|thought|thinking)(?:\s[^>]*)?>/gi, "");

  // 4) Restaurar los bloques de tools intactos
  const out = masked.replace(
    /___VIBES_TOOL_BLOCK_(\d+)___/g,
    (_, i) => toolBlocks[Number(i)],
  );

  return out;
}

/**
 * Elimina cierres huérfanos de cualquier tag interno `<vibes-*>` sin tocar
 * bloques completos válidos ni aperturas todavía en progreso durante streaming.
 *
 * El stream puede reenviar snapshots acumulativos y dejar una cola como:
 * `</vibes-write></vibes-token-usage></vibes-cancelled></vibes-files-changed>`.
 * ReactMarkdown la pinta como texto literal. Para distinguirla de código fuente
 * leído por una tool, enmascaramos primero todos los bloques completos y solo
 * eliminamos los cierres que quedan fuera de ellos.
 */
export function stripOrphanVibesClosingTags(text: string): string {
  const completeBlocks: string[] = [];
  const masked = text.replace(
    /<(vibes-[\w-]+)(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi,
    (block) => {
      const index = completeBlocks.length;
      completeBlocks.push(block);
      return `___VIBES_COMPLETE_BLOCK_${index}___`;
    },
  );

  const withoutOrphans = masked.replace(/<\/vibes-[\w-]+\s*>/gi, "");
  return withoutOrphans.replace(
    /___VIBES_COMPLETE_BLOCK_(\d+)___/g,
    (_, index) => completeBlocks[Number(index)],
  );
}

/**
 * Normaliza el contenido de un mensaje ANTES de parsearlo para la UI.
 *
 * 1. `normalizeLegacyTags` — shim backward-compat (dyad-* → vibes-*).
 * 2. `stripDsmlToolCallBlocks` — elimina bloques de tool-calls internos del
 *    modelo (formato DSML / GLM) que algunos proveedores emiten como texto
 *    plano en el stream y que NO deben pintarse en el chat.
 * 3. `stripPreviousTurnSummary` — elimina la réplica en texto plano de la
 *    memoria de turno `[Previous Turn Context Summary]` (ver arriba).
 * 4. `stripContextSummaryTags` — elimina los tags crudos `<vibes-context-summary>`
 *    que el modelo reproduce (retroactivo, ver arriba).
 * 5. `stripOrphanThinkTags` — elimina `</think>` y tags de cierre huérfanos.
 * 6. `stripOrphanVibesClosingTags` — elimina cualquier cierre interno
 *    `<vibes-*>` huérfano restante sin tocar bloques válidos ni aperturas activas.
 *
 * El mismo filtro DSML se aplica en el provider (vibes-core) para los mensajes
 * nuevos en streaming; aquí cubre además los mensajes ya persistidos.
 */
export function normalizeMessageContent(content: string | null | undefined): string {
  if (!content) return "";
  return stripOrphanVibesClosingTags(
    stripOrphanThinkTags(
      stripContextSummaryTags(
        stripPreviousTurnSummary(stripDsmlToolCallBlocks(normalizeLegacyTags(content))),
      ),
    ),
  );
}

/** Versión pensada para valores que pueden no ser string. */
export function hasMessageContent(content: string | null | undefined): content is string {
  return !!content;
}
