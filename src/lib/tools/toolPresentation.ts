/**
 * Fuente única de presentación de tools del runtime en la carcasa (#168).
 *
 * Un solo mapa `toolId (catálogo vibes-core) → vibes-tag (UI)` compartido por:
 *  - el event_mapper (main): emite el tag correcto para cada tool finished;
 *  - CompactToolBadge (renderer): actualiza badges de mensajes antiguos que
 *    quedaron grabados como `vibes-mcp-tool-call` antes de la unificación.
 *
 * P1: este archivo vive en la carcasa. El runtime (vibes-core) no sabe nada
 * de tags ni de presentación; su catálogo (@vibes/tools) solo define id,
 * categoría, riesgo y schemas.
 *
 * Si añades una tool al catálogo del core, añade su entrada aquí (y sus
 * metadatos visuales en TOOL_META + label/description en lib/i18n/tools.*.ts).
 */

export const RUNTIME_TOOL_TAGS: Record<string, string> = {
  read_file: "vibes-read",
  write_file: "vibes-write",
  edit_file: "vibes-search-replace",
  patch: "vibes-patch",
  glob: "vibes-list-files",
  grep: "vibes-grep",
  shell: "vibes-run-command",
  git_log: "vibes-git",
  git_diff: "vibes-git",
  list_dir: "vibes-list-files",
  question: "vibes-question",
  todowrite: "vibes-todo",
};

/**
 * Resuelve el vibes-tag de una tool del catálogo. Devuelve `undefined` para
 * tool ids desconocidos (MCP real u otras fuentes), que siguen su camino
 * genérico (`vibes-mcp-tool-call`).
 */
export function resolveRuntimeToolTag(toolId: string): string | undefined {
  return RUNTIME_TOOL_TAGS[toolId];
}

/** ¿Es un tool id del catálogo built-in del runtime? */
export function isBuiltInToolId(toolId: string): boolean {
  return Object.prototype.hasOwnProperty.call(RUNTIME_TOOL_TAGS, toolId);
}
