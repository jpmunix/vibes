/**
 * Settings search index — i18n-aware.
 *
 * The index structure (ids, section ids, keyword haystacks) is language
 * agnostic; only the *visible* strings (label/description/section) are
 * localized via the `search.*` namespace in messages.<lang>.ts.
 *
 * Keywords are intentionally a bilingual union (es + en): they are never
 * rendered, only matched, so an English user can type "dark mode" while the
 * UI is in Spanish and vice versa.
 */

import type { Language } from "./index";
import { t } from "./index";

export interface SettingsSearchItem {
  id: string;
  label: string;
  description: string;
  keywords: string[];
  section: string;
  sectionId: string;
}

/** Structural, language-agnostic index entry (keywords are bilingual). */
interface SearchEntry {
  id: string;
  /** i18n key suffix under `search.items.<suffix>.label/description`. */
  key: string;
  /** Bilingual keyword haystack (en + es) — never rendered. */
  keywords: string[];
  /** i18n key suffix under `search.sections.<suffix>`. */
  sectionKey: string;
  sectionId: string;
}

export const SETTINGS_SEARCH_ENTRIES: SearchEntry[] = [
  // ─── General / Tema ───
  {
    id: "theme",
    key: "theme",
    keywords: ["tema", "mode", "dark", "light", "claro", "oscuro", "apariencia", "color"],
    sectionKey: "general",
    sectionId: "general-settings",
  },
  {
    id: "primary-color",
    key: "primaryColor",
    keywords: ["color", "primario", "acento", "tema", "personalizar", "primary", "chroma"],
    sectionKey: "general",
    sectionId: "general-settings",
  },
  {
    id: "font",
    key: "font",
    keywords: ["fuente", "tipografía", "font", "letra", "interfaz", "ui", "typography", "interface"],
    sectionKey: "general",
    sectionId: "general-settings",
  },
  {
    id: "chat-font",
    key: "chatFont",
    keywords: ["fuente", "tipografía", "font", "chat", "mensajes", "messages", "typography"],
    sectionKey: "general",
    sectionId: "general-settings",
  },
  {
    id: "font-scale",
    key: "fontScale",
    keywords: [
      "tamaño",
      "fuente",
      "escala",
      "zoom",
      "scale",
      "size",
      "interfaz",
      "sidebar",
      "chat",
      "ancho",
      "burbuja",
      "bubble",
      "width",
    ],
    sectionKey: "general",
    sectionId: "general-settings",
  },
  // ─── Workflow ───
  {
    id: "chat-mode",
    key: "chatMode",
    keywords: ["modo", "chat", "predeterminado", "default", "mode"],
    sectionKey: "workflow",
    sectionId: "workflow-settings",
  },
  {
    id: "auto-approve",
    key: "autoApprove",
    keywords: [
      "aprobar",
      "automatico",
      "cambios",
      "codigo",
      "ejecutar",
      "git",
      "commit",
      "confirmar",
      "auto",
      "approve",
      "changes",
    ],
    sectionKey: "workflow",
    sectionId: "workflow-settings",
  },
  {
    id: "auto-expand-preview",
    key: "autoExpandPreview",
    keywords: [
      "expandir",
      "preview",
      "vista previa",
      "panel",
      "automatico",
      "desactivado",
      "derecha",
      "izquierda",
      "expand",
      "auto",
    ],
    sectionKey: "workflow",
    sectionId: "workflow-settings",
  },
  {
    id: "chat-completion-notification",
    key: "chatCompletionNotification",
    keywords: ["notificacion", "respuesta", "completada", "chat", "alerta", "notification", "sound"],
    sectionKey: "workflow",
    sectionId: "workflow-settings",
  },
  {
    id: "notification-sound",
    key: "notificationSound",
    keywords: ["sonido", "sound", "audio", "notificacion", "chime", "beep", "mac", "notification"],
    sectionKey: "workflow",
    sectionId: "workflow-settings",
  },
  {
    id: "web-search",
    key: "webSearch",
    keywords: ["web", "search", "busqueda", "internet", "buscar", "openrouter", "online", "web search"],
    sectionKey: "workflow",
    sectionId: "workflow-settings",
  },
  // ─── Agente ───
  {
    id: "chat-language",
    key: "chatLanguage",
    keywords: ["idioma", "language", "lenguaje", "interfaz", "español", "english", "ingles", "lang"],
    sectionKey: "general",
    sectionId: "general-settings",
  },
  {
    id: "reasoning-effort",
    key: "reasoningEffort",
    keywords: ["reasoning", "effort", "esfuerzo", "razonamiento", "thinking", "openrouter"],
    sectionKey: "agent",
    sectionId: "ai-behavior",
  },
  {
    id: "text-verbosity",
    key: "textVerbosity",
    keywords: ["verbosity", "verbosidad", "detalle", "conciso", "detallado", "detail"],
    sectionKey: "agent",
    sectionId: "ai-behavior",
  },
  {
    id: "agent-max-iterations",
    key: "agentMaxIterations",
    keywords: ["iteraciones", "iterations", "límite", "limit", "pasos", "tareas largas", "se corta", "max"],
    sectionKey: "agent",
    sectionId: "ai-behavior",
  },
  {
    id: "agent-max-wall-clock",
    key: "agentMaxWallClock",
    keywords: ["tiempo", "wall clock", "reloj", "hora", "horas", "tareas largas", "se corta", "límite", "time", "max"],
    sectionKey: "agent",
    sectionId: "ai-behavior",
  },
  {
    id: "chat-view",
    key: "chatView",
    keywords: [
      "vista",
      "chat",
      "render",
      "modo",
      "view",
      "completo",
      "flow",
      "zen",
      "ligero",
      "rapido",
      "limpio",
      "esencial",
    ],
    sectionKey: "agent",
    sectionId: "ai-behavior",
  },
  {
    id: "standard-model",
    key: "standardModel",
    keywords: ["modelo", "tareas", "internas", "titulos", "resumenes", "standard", "gemini", "flash", "lite", "model"],
    sectionKey: "agent",
    sectionId: "ai-behavior",
  },
  {
    id: "agent-permissions",
    key: "agentPermissions",
    keywords: [
      "permisos",
      "agente",
      "agent",
      "herramientas",
      "tools",
      "permissions",
      "seguridad",
      "editar archivos",
      "terminal",
      "bash",
      "acceso web",
      "webfetch",
      "búsqueda web",
      "websearch",
      "diagnósticos",
      "lsp",
      "siempre",
      "preguntar",
      "nunca",
      "rm",
      "borrar",
      "git add",
      "git commit",
      "git push",
      "git reset",
      "git checkout",
      "git restore",
      "git clean",
      "git rebase",
    ],
    sectionKey: "agent",
    sectionId: "ai-behavior",
  },
  // ─── Proveedores / OpenRouter ───
  {
    id: "ai-providers",
    key: "aiProviders",
    keywords: ["proveedor", "provider", "proxy", "endpoint", "custom", "litellm", "openai", "compatible", "models"],
    sectionKey: "providers",
    sectionId: "models-connectivity",
  },
  {
    id: "enabled-models",
    key: "enabledModels",
    keywords: ["modelos", "models", "habilitados", "enabled", "activar", "desactivar", "openrouter", "añadir", "add"],
    sectionKey: "openrouter",
    sectionId: "models-connectivity",
  },
  {
    id: "provider-settings",
    key: "providerSettings",
    keywords: ["openrouter", "api", "key", "clave", "ia", "settings", "config"],
    sectionKey: "openrouter",
    sectionId: "models-connectivity",
  },
  {
    id: "show-cost-display",
    key: "showCostDisplay",
    keywords: ["gasto", "coste", "cost", "precio", "dinero", "tokens", "openrouter", "mostrar", "ocultar", "show", "hide"],
    sectionKey: "openrouter",
    sectionId: "models-connectivity",
  },
  // ─── Integraciones ───
  {
    id: "github",
    key: "github",
    keywords: ["github", "git", "repositorio", "repo", "integracion", "integration"],
    sectionKey: "integrations",
    sectionId: "integrations",
  },
  {
    id: "vercel",
    key: "vercel",
    keywords: ["vercel", "deploy", "deployment", "despliegue", "integracion", "integration"],
    sectionKey: "integrations",
    sectionId: "integrations",
  },
  {
    id: "supabase",
    key: "supabase",
    keywords: ["supabase", "database", "db", "base de datos", "integracion", "integration"],
    sectionKey: "integrations",
    sectionId: "integrations",
  },
  {
    id: "neon",
    key: "neon",
    keywords: ["neon", "database", "db", "postgres", "postgresql", "integracion", "integration"],
    sectionKey: "integrations",
    sectionId: "integrations",
  },
  // ─── MCP / Skills ───
  {
    id: "mcp-servers",
    key: "mcpServers",
    keywords: ["mcp", "tools", "herramientas", "servidor", "protocolo", "context", "plugin", "servers", "model context"],
    sectionKey: "mcp",
    sectionId: "tools-mcp",
  },
  {
    id: "skills-settings",
    key: "skillsSettings",
    keywords: ["skills", "agentes", "conocimiento", "personalizar", "directivas", "markdown", "knowledge", "agents"],
    sectionKey: "skills",
    sectionId: "tools-skills",
  },
  // ─── Otros ───
  {
    id: "reset-all",
    key: "resetAll",
    keywords: ["reset", "resetear", "eliminar", "borrar", "todo", "defecto", "restaurar", "default", "restore"],
    sectionKey: "general",
    sectionId: "general-settings",
  },
  // ─── Agentes Personalizados ───
  {
    id: "custom-agents",
    key: "customAgents",
    keywords: [
      "agentes",
      "personalizados",
      "custom",
      "agents",
      "system",
      "prompt",
      "slash",
      "comando",
      "additive",
      "replace",
      "commands",
    ],
    sectionKey: "customAgents",
    sectionId: "custom-agents-settings",
  },
];

/**
 * Build the localized search index for a language.
 * The result is fully rendered (label/description/section localized), so the
 * UI can render it directly.
 */
export function buildSettingsSearchIndex(language: Language): SettingsSearchItem[] {
  return SETTINGS_SEARCH_ENTRIES.map((entry) => ({
    id: entry.id,
    label: t(`search.items.${entry.key}.label`, language),
    description: t(`search.items.${entry.key}.description`, language),
    keywords: entry.keywords,
    section: t(`search.sections.${entry.sectionKey}`, language),
    sectionId: entry.sectionId,
  }));
}
