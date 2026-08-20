/**
 * Tool translations — Spanish (es).
 *
 * Source of truth for human-facing tool labels and descriptions in the shell
 * (permission pill, settings, tooltips). The runtime (vibes-core) carries no
 * localized strings (P1): it only knows tool ids, categories, risk levels and
 * schemas. Adding a new tool = add an entry here (and in tools.en.ts).
 */

export interface ToolTranslation {
  label: string;
  description: string;
}

export const toolTranslationsEs: Record<string, ToolTranslation> = {
  read_file: {
    label: "Leer archivos",
    description: "Leer el contenido de archivos del proyecto",
  },
  write_file: {
    label: "Escribir archivos",
    description: "Crear y sobrescribir archivos del proyecto",
  },
  edit_file: {
    label: "Editar archivos",
    description: "Modificar archivos existentes del proyecto",
  },
  patch: {
    label: "Aplicar parches",
    description: "Aplicar cambios a varios archivos de forma atómica",
  },
  glob: {
    label: "Buscar archivos por patrón",
    description: "Encontrar archivos por nombre o patrón (glob)",
  },
  grep: {
    label: "Buscar contenido",
    description: "Buscar texto dentro de los archivos del proyecto",
  },
  shell: {
    label: "Terminal (bash)",
    description: "Ejecutar comandos en la terminal del proyecto",
  },
  git_log: {
    label: "Ver historial git",
    description: "Listar los commits del repositorio",
  },
  git_diff: {
    label: "Ver cambios git",
    description: "Mostrar los cambios sin confirmar del repositorio",
  },
  list_dir: {
    label: "Listar directorio",
    description: "Listar el contenido de un directorio",
  },
  question: {
    label: "Preguntar al usuario",
    description: "Hacerte preguntas cuando necesita más información",
  },
  todowrite: {
    label: "Lista de tareas",
    description: "Gestionar la lista de tareas del agente",
  },
};
