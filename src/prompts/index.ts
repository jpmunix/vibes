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
  | "ctx_no_run_locally"
  | "ctx_context7_docs"
  | "ctx_efficiency_triage"
  | "ctx_task_management"
  | "ctx_plan_mode"
  | "ctx_build_walkthrough";





export const PROMPT_LABELS: Record<PromptId, string> = {
  chat_title: "Títulos de Chat",
  app_title_short: "Títulos de App",
  app_name_pro: "Nombres de App",
  auto_commit_message: "Mensaje de Commit",
  memory_synthesis: "Generación de Memorias",
  memory_selection: "Selección de Memorias",
  memory_onboarding: "Bootstrap de Memorias",
  ctx_language: "Idioma de respuesta",
  ctx_no_run_locally: "No mostrar ejecución",
  ctx_context7_docs: "Documentación Context7",
  ctx_efficiency_triage: "Eficiencia y triaje",
  ctx_task_management: "Gestión de tareas",

  ctx_plan_mode: "Planificación interactiva",
  ctx_build_walkthrough: "Resumen de tareas (Walkthrough)",
};

export const PROMPT_DESCRIPTIONS: Record<PromptId, string> = {
  chat_title:
    "Genera títulos automáticos para los chats a partir del primer mensaje del usuario.",
  app_title_short:
    "Genera títulos cortos y atractivos para las apps.",
  app_name_pro: "Genera nombres funcionales y descriptivos al crear apps.",
  auto_commit_message: "Genera mensajes de commit automáticos en formato Conventional Commits.",
  memory_synthesis: "Instrucciones del Synthesizer: decide qué extraer de cada conversación y genera operaciones (add/update/merge).",
  memory_selection: "Instrucciones del Router: selecciona qué memorias inyectar según el prompt del usuario.",
  memory_onboarding: "Instrucciones del Bootstrap: analiza archivos de configuración del proyecto para generar memorias fundacionales.",
  ctx_language: "Fuerza al agente a responder siempre en el idioma seleccionado. Usa {{LANGUAGE}} como placeholder.",
  ctx_no_run_locally: "Impide que el agente explique cómo ejecutar la app (npm run dev, etc.)",
  ctx_context7_docs: "Obliga al agente a consultar documentación fresca antes de integrar librerías.",
  ctx_efficiency_triage: "Criterios para que el agente clasifique tareas simples vs complejas y ajuste su esfuerzo.",
  ctx_task_management: "Cuándo debe el agente usar todowrite para organizar tareas complejas.",
  ctx_plan_mode: "Instrucciones para el modo de planificación interactiva (preguntar antes de planificar).",
  ctx_build_walkthrough: "Instrucciones para generar un Walkthrough en formato Markdown en la carpeta .vibes/ al finalizar tareas complejas en modo build.",
};
