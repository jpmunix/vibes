import { UserSettings } from "@/lib/schemas";

export type PromptId =
  | "chat_title"
  | "app_title_short"
  | "app_name_pro"
  | "auto_commit_message"
  | "memory_synthesis"
  | "memory_selection"
  | "memory_onboarding"
  // Context instructions (injected into every chat message)
  | "ctx_language"
  | "ctx_task_management"
  | "ctx_plan_mode"
  | "ctx_build_walkthrough"
  // Runtime base agent prompt (migrado de vibes-core context-engine.ts)
  | "runtime_agent_base"
  // Vision preprocessor prompt (card #195: antes vivía suelto en
  // vision_constants.ts + settings.visionPreprocessorPrompt).
  | "vision";

export const PROMPT_LABELS: Record<PromptId, string> = {
  chat_title: "Títulos de Chat",
  app_title_short: "Títulos de App",
  app_name_pro: "Nombres de App",
  auto_commit_message: "Mensaje de Commit",
  memory_synthesis: "Generación de Memorias",
  memory_selection: "Selección de Memorias",
  memory_onboarding: "Bootstrap de Memorias",
  ctx_language: "Idioma de respuesta",
  ctx_task_management: "Gestión de tareas",

  ctx_plan_mode: "Planificación interactiva",
  ctx_build_walkthrough: "Resumen de cambios",
  runtime_agent_base: "Núcleo del agente",
  vision: "Prompt de visión",
};

export const PROMPT_DESCRIPTIONS: Record<PromptId, string> = {
  chat_title:
    "Genera títulos automáticos para los chats a partir del primer mensaje del usuario.",
  app_title_short: "Genera títulos cortos y atractivos para las apps.",
  app_name_pro: "Genera nombres funcionales y descriptivos al crear apps.",
  auto_commit_message:
    "Genera mensajes de commit automáticos en formato Conventional Commits.",
  memory_synthesis:
    "Instrucciones del Synthesizer: decide qué extraer de cada conversación y genera operaciones (add/update/merge).",
  memory_selection:
    "Instrucciones del Router: selecciona qué memorias inyectar según el prompt del usuario.",
  memory_onboarding:
    "Instrucciones del Bootstrap: analiza archivos de configuración del proyecto para generar memorias fundacionales.",
  ctx_language:
    "Fuerza al agente a responder siempre en el idioma seleccionado. Usa {{LANGUAGE}} como placeholder.",
  ctx_task_management:
    "Cuándo debe el agente usar todowrite para organizar tareas complejas.",
  ctx_plan_mode:
    "Instrucciones para el modo de planificación interactiva (preguntar antes de planificar).",
  ctx_build_walkthrough:
    "Instrucciones para generar un resumen de cambios en la carpeta .vibes/ al finalizar tareas complejas en modo build.",
  runtime_agent_base:
    "Núcleo del agente: reglas de uso de herramientas que el modelo recibe en cada sesión. La carcasa lo compone; el runtime lo ejecuta.",
  vision:
    "Procesa las imágenes adjuntas en descripciones textuales hiperdetalladas para modelos que no pueden ver.",
};

/**
 * Jerarquía a 2 niveles de los prompts del sistema (card #195).
 *
 * Es METADATO DE CÓDIGO, no filas de DB: no hay DDL ni tabla de grupos.
 * El handler `list` (prompt_handlers.ts) expone el `groupKey` de cada prompt
 * en el DTO y la UI renderiza las sub-secciones con el orden de esta constante.
 *
 * Regla de oro (test en prompts/index.test.ts): cada PromptId de
 * DEFAULT_PROMPTS debe aparecer EXACTAMENTE UNA vez en algún grupo.
 */
export interface SystemPromptGroup {
  /** Clave estable (i18n: prompts.groups.<groupKey>). */
  groupKey: "core" | "titles" | "git" | "memory" | "vision";
  /** Ids de prompts que pertenecen al grupo (orden de render). */
  promptIds: PromptId[];
}

export const SYSTEM_PROMPT_GROUPS: readonly SystemPromptGroup[] = [
  {
    groupKey: "core",
    promptIds: [
      "runtime_agent_base",
      "ctx_language",
      "ctx_task_management",
      "ctx_plan_mode",
      "ctx_build_walkthrough",
    ],
  },
  {
    groupKey: "titles",
    promptIds: ["chat_title", "app_title_short", "app_name_pro"],
  },
  {
    groupKey: "git",
    promptIds: ["auto_commit_message"],
  },
  {
    groupKey: "memory",
    promptIds: ["memory_synthesis", "memory_selection", "memory_onboarding"],
  },
  {
    groupKey: "vision",
    promptIds: ["vision"],
  },
] as const;

/** Índice derivado: systemId → groupKey (O(1) en el handler/UI). */
export const SYSTEM_PROMPT_GROUP_BY_ID: ReadonlyMap<PromptId, SystemPromptGroup["groupKey"]> =
  new Map(
    SYSTEM_PROMPT_GROUPS.flatMap((g) => g.promptIds.map((id) => [id, g.groupKey])),
  );
