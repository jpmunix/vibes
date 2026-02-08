import { UserSettings } from "@/lib/schemas";
import {
  THINKING_PROMPT,
  BUILD_SYSTEM_PREFIX,
  BUILD_SYSTEM_POSTFIX,
  AGENT_MODE_SYSTEM_PROMPT,
} from "./system_prompt";
import { SUMMARIZE_CHAT_SYSTEM_PROMPT } from "./summarize_chat_system_prompt";

export type PromptId =
  | "thinking_prompt"
  | "build_system_prefix"
  | "build_system_postfix"
  | "summarize_chat_system"
  | "turbo_edit_system"
  | "app_title_short"
  | "app_name_pro"
  | "todo_analysis"
  | "todo_refinement"
  | "agent_mode_system";

export const DEFAULT_PROMPTS: Record<PromptId, string> = {
  thinking_prompt: THINKING_PROMPT,
  build_system_prefix: BUILD_SYSTEM_PREFIX,
  build_system_postfix: BUILD_SYSTEM_POSTFIX,
  summarize_chat_system: SUMMARIZE_CHAT_SYSTEM_PROMPT,
  agent_mode_system: AGENT_MODE_SYSTEM_PROMPT,
  turbo_edit_system: [
    "You are a precise code-editing assistant.",
    "Apply the requested edit to the original file content.",
    "Return the full updated file content only.",
    "Preserve unchanged content exactly.",
    'The edit snippet may contain "// ... existing code ..." markers that represent unchanged sections.',
    "Do not include explanations or code fences.",
  ].join(" "),
  app_title_short:
    "You are a helpful assistant that generates short and attractive app titles in English. Return ONLY the title, no quotes, no additional text. Maximum 30 characters.",
  app_name_pro:
    "You are a helpful assistant that generates descriptive and professional app names in English. The name should clearly reflect the app's purpose and functionality. Return ONLY the app name, no quotes, no extra text. Maximum 40 characters. Be strictly functional and deterministic. Do not use marketing adjectives like 'Ultimate', 'Best', 'Simple', 'Super', 'Pro'. Just describe what it does (e.g., 'Todo Manager', 'Invoice Generator').",
  todo_analysis: [
    "Analiza el contenido proporcionado (Fotos, Word, PDF, TXT o Markdown) y extrae una lista de tareas de desarrollo con precisión extrema.",
    "Tu misión es realizar una ingeniería inversa del contenido para generar un backlog de tareas accionables.",
    "",
    "ANÁLISIS MULTIMODAL (Imágenes/Capturas/CMS):",
    "- Sé MEGA PRECISO: Si es una captura de pantalla de un software (CMS, Dashboard, Web):",
    "  - Detecta la FUNDACIÓN: Identifica qué sistema es (ej: 'CMS de gestión de contenidos', 'Panel de administración de usuarios') y su arquitectura base.",
    "  - Identifica TODOS los elementos: botones, inputs, modales, tablas, menús, estados, validaciones.",
    "  - Transforma cada componente visual en una tarea técnica (ej: 'Replicar tabla de estadísticas con ordenación', 'Implementar logout en sidebar').",
    "  - No dejes nada fuera: si aparece en la imagen, es un requerimiento potencial.",
    "",
    "INSTRUCCIONES DE EXTRACCIÓN:",
    "1. Identificación de tareas:",
    "- Ítems con checkboxes [ ] o [x], listas de 'Tareas', subtareas, y acciones implícitas ejecutables.",
    "- Elementos de UI: Convierte cada widget o funcionalidad detectada en una tarea.",
    "- Ignora: Texto descriptivo sin carga funcional o técnica.",
    "",
    "2. Estado de la tarea:",
    "- 'completed: true' si tiene [x], tachado, o visualmente indica 'hecho'.",
    "- 'completed: false' si tiene [ ] o no hay indicador de progreso.",
    "",
    "3. Normalización y Estructura:",
    "- Frases claras, cortas y PROFESIONALES. Elimina redundancias.",
    "- Si una tarea depende claramente de una fase o módulo, inclúyelo entre paréntesis: '(Auth) Añadir recuperación de contraseña'.",
    "",
    "4. Criterios Editoriales:",
    "- Mega precisión: No resumas, transporta la información técnica íntegra.",
    "- No añadas tareas fuera de contexto, pero sí deduce las subtareas lógicas para completar una acción principal detectada.",
    "- Respuesta en español técnico puro.",
    "",
    "5. Formato de salida (OBLIGATORIO):",
    "Responde ÚNICAMENTE en JSON con esta estructura (sin bloques de código):",
    '{ "listTitle": "Título (ej: Arquitectura CMS / Plan de Proyecto)", "tasks": [ { "content": "Tarea", "description": "Detalles técnicos exhaustivos extraídos", "completed": true|false } ] }',
  ].join("\n"),
  todo_refinement: [
    "Eres un experto en ingeniería de prompts.",
    "Genera un prompt de desarrollo detallado, técnico y accionable para la tarea proporcionada.",
    "Responde ÚNICAMENTE con el prompt generado.",
    "No incluyas introducciones ('Claro, aquí tienes...'), explicaciones, opiniones, ni bloques de código markdown.",
    "Tu respuesta debe empezar directamente con el contenido del prompt.",
  ].join(" "),
};

export function getEffectivePrompt(
  id: PromptId,
  settings?: UserSettings,
): string {
  if (settings?.customPrompts?.[id]) {
    return settings.customPrompts[id];
  }
  return DEFAULT_PROMPTS[id];
}

export const PROMPT_LABELS: Record<PromptId, string> = {
  thinking_prompt: "Thinking Process (Razonamiento)",
  build_system_prefix: "Build System Prefix (Rol Principal)",
  build_system_postfix: "Build System Postfix (Formato y Reglas)",
  summarize_chat_system: "Resumen de Chat",
  agent_mode_system: "Modo Agente (Análisis)",
  turbo_edit_system: "Turbo Edit (Edición Precisa)",
  app_title_short: "Generador de Títulos Cortos",
  app_name_pro: "Generador de Nombres Profesionales",
  todo_analysis: "Analizador de Tareas (Smart Import)",
  todo_refinement: "Refinador de Prompts de Tareas",
};

export const PROMPT_DESCRIPTIONS: Record<PromptId, string> = {
  thinking_prompt:
    "Instrucciones sobre cómo la IA debe 'pensar' antes de responder.",
  build_system_prefix:
    "Define la personalidad y el rol básico de Dyad en modo construcción.",
  build_system_postfix:
    "Reglas críticas sobre el formato de salida y etiquetas <dyad-write>.",
  summarize_chat_system:
    "Instrucciones para generar el resumen técnico de la conversación.",
  agent_mode_system:
    "Cómo debe comportarse el agente al analizar herramientas externas.",
  turbo_edit_system:
    "Instrucciones para el modelo rápido de edición de archivos.",
  app_title_short:
    "Prompt usado para generar títulos atractivos en el selector.",
  app_name_pro: "Prompt usado para generar nombres funcionales al crear apps.",
  todo_analysis:
    "Instrucciones para extraer tareas a partir de archivos (PDF, Word, imágenes, etc.).",
  todo_refinement:
    "Instrucciones para convertir una tarea simple en un prompt de desarrollo detallado.",
};
