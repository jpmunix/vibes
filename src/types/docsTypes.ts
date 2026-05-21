/**
 * Documentation System Types
 *
 * Types for the recursive directory-based documentation system.
 * The documentation lives in `assets/vibes-docs/` and is read
 * from the filesystem at runtime by the main process.
 */

/** Nodo del árbol de documentación */
export interface DocTreeNode {
  /** ID único derivado de la ruta relativa (e.g. "getting-started", "getting-started/bienvenida") */
  id: string;
  /** Título visible en el sidebar */
  title: string;
  /** Icono Lucide opcional (nombre del icono, e.g. "rocket") */
  icon?: string;
  /** Descripción corta */
  description?: string;
  /** Ruta relativa al directorio vibes-docs/ */
  relativePath: string;
  /** Tipo: 'section' (directorio desplegable) o 'page' (artículo .md) */
  type: "section" | "page";
  /** Hijos ordenados (solo para type='section') */
  children?: DocTreeNode[];
  /** Headings h2 extraídos del markdown (solo para type='page') */
  anchors?: { id: string; title: string }[];
}

/** Estructura completa de la documentación */
export interface DocTree {
  root: DocTreeNode;
}

/** Contenido de una página de documentación */
export interface DocPageContent {
  /** Markdown raw del artículo */
  markdown: string;
  /** Metadatos extraídos del frontmatter */
  meta: {
    title: string;
    icon?: string;
    description?: string;
  };
}

/** Resultado de búsqueda en la documentación */
export interface DocSearchResult {
  /** Ruta relativa al archivo .md */
  relativePath: string;
  /** Título de la página */
  title: string;
  /** Fragmento de texto con el match (con contexto alrededor) */
  snippet: string;
  /** Posición del match dentro del snippet para resaltado */
  matchStart: number;
  /** Longitud del texto matcheado (en el snippet, puede differ del query por accents) */
  matchLength: number;
  /** Anchor ID del heading más cercano para scroll directo */
  anchor?: string;
  /** Título del heading más cercano para contexto visual */
  sectionTitle?: string;
}
