export interface PreprocessedCustomTags {
  processedContent: string;
  inProgressTags: Map<string, Set<number>>;
}

/**
 * Prepara custom tags para el parser mientras llega un snapshot incompleto.
 *
 * Los bloques completos se enmascaran durante el análisis para que strings que
 * parecen tags dentro de código leído/editado no alteren el balance. Después:
 * - elimina cierres huérfanos reales;
 * - añade cierres sintéticos SOLO para aperturas top-level todavía activas;
 * - conserva los offsets de esas aperturas para marcarlas `inProgress`.
 */
export function preprocessUnclosedCustomTags(
  content: string,
  tagNames: readonly string[],
): PreprocessedCustomTags {
  const names = new Set(tagNames);

  // Mantener exactamente la misma longitud conserva los offsets originales.
  const analysis = content.replace(
    /<([\w-]+)(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi,
    (block, tagName: string) =>
      names.has(tagName) ? " ".repeat(block.length) : block,
  );

  const tagPattern = /<\s*(\/?)\s*([\w-]+)(?:\s[^>]*)?>/gi;
  const stacks = new Map<string, Array<{ index: number }>>();
  const orphanClosings: Array<{ index: number; length: number }> = [];
  let match: RegExpExecArray | null;

  while ((match = tagPattern.exec(analysis)) !== null) {
    const tagName = match[2];
    if (!names.has(tagName)) continue;

    const isClosing = match[1] === "/";
    const stack = stacks.get(tagName) ?? [];
    if (isClosing) {
      if (stack.length > 0) stack.pop();
      else orphanClosings.push({ index: match.index, length: match[0].length });
    } else {
      stack.push({ index: match.index });
      stacks.set(tagName, stack);
    }
  }

  // Eliminar de derecha a izquierda para no invalidar posiciones pendientes.
  let processedContent = content;
  for (const orphan of orphanClosings.sort((a, b) => b.index - a.index)) {
    processedContent =
      processedContent.slice(0, orphan.index) +
      processedContent.slice(orphan.index + orphan.length);
  }

  const adjustedIndex = (originalIndex: number): number =>
    originalIndex -
    orphanClosings.reduce(
      (removed, orphan) =>
        orphan.index < originalIndex ? removed + orphan.length : removed,
      0,
    );

  const inProgressTags = new Map<string, Set<number>>();
  const unclosed: Array<{ tagName: string; index: number }> = [];
  for (const [tagName, stack] of stacks) {
    if (stack.length === 0) continue;
    const indexes = new Set<number>();
    for (const opening of stack) {
      const index = adjustedIndex(opening.index);
      indexes.add(index);
      unclosed.push({ tagName, index });
    }
    inProgressTags.set(tagName, indexes);
  }

  // Cerrar en orden inverso de apertura para conservar nesting válido.
  unclosed.sort((a, b) => b.index - a.index);
  processedContent += unclosed.map(({ tagName }) => `</${tagName}>`).join("");

  return { processedContent, inProgressTags };
}
