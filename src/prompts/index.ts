import { UserSettings } from "@/lib/schemas";
import { THINKING_PROMPT, BUILD_SYSTEM_PREFIX, BUILD_SYSTEM_POSTFIX, AGENT_MODE_SYSTEM_PROMPT } from "./system_prompt";
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
    app_title_short: "You are a helpful assistant that generates short and attractive app titles in English. Return ONLY the title, no quotes, no additional text. Maximum 30 characters.",
    app_name_pro: "You are a helpful assistant that generates descriptive and professional app names in English. The name should clearly reflect the app's purpose and functionality. Return ONLY the app name, no quotes, no extra text. Maximum 40 characters. Be strictly functional and deterministic. Do not use marketing adjectives like 'Ultimate', 'Best', 'Simple', 'Super', 'Pro'. Just describe what it does (e.g., 'Todo Manager', 'Invoice Generator').",
    todo_analysis: [
        "Analiza el contenido proporcionado (texto o imágenes) y extrae una lista de tareas accionables.",
        "Genera un título corto para la lista (máximo 30 caracteres) y una lista de tareas.",
        "Responde EXCLUSIVAMENTE en formato JSON con la siguiente estructura:",
        '{ "listTitle": "Título de la lista", "tasks": [ { "content": "Contenido de la tarea", "description": "Descripción opcional o null" } ] }',
        "No incluyas explicaciones ni bloques de código markdown.",
    ].join(" "),
};

export function getEffectivePrompt(id: PromptId, settings?: UserSettings): string {
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
};

export const PROMPT_DESCRIPTIONS: Record<PromptId, string> = {
    thinking_prompt: "Instrucciones sobre cómo la IA debe 'pensar' antes de responder.",
    build_system_prefix: "Define la personalidad y el rol básico de Dyad en modo construcción.",
    build_system_postfix: "Reglas críticas sobre el formato de salida y etiquetas <dyad-write>.",
    summarize_chat_system: "Instrucciones para generar el resumen técnico de la conversación.",
    agent_mode_system: "Cómo debe comportarse el agente al analizar herramientas externas.",
    turbo_edit_system: "Instrucciones para el modelo rápido de edición de archivos.",
    app_title_short: "Prompt usado para generar títulos atractivos en el selector.",
    app_name_pro: "Prompt usado para generar nombres funcionales al crear apps.",
    todo_analysis: "Instrucciones para extraer tareas a partir de archivos (PDF, Word, imágenes, etc.).",
};
