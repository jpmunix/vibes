/**
 * UI message dictionary — Spanish (es).
 *
 * Central dictionary for user-facing strings of the shell (Vibes): settings,
 * chat, navigation and main-flow toasts. Tool labels/descriptions live in
 * tools.es.ts (P1: localized strings are the shell's business, never the
 * runtime's).
 *
 * Structure: namespaced keys (`settings.*`, `chat.*`, `nav.*`, `toast.*`).
 * Plural keys follow the `{one,many}` shape (es and en only have two count
 * forms; the plural helper picks via Intl.PluralRules).
 *
 * Adding a new string = add the key here AND in messages.en.ts (the parity
 * test fails otherwise). Adding a new language = new messages.<lang>.ts.
 */

export interface PluralMessage {
  one: string;
  many: string;
}

export type MessageValue = string | PluralMessage;

export interface Messages {
  [namespace: string]: Record<string, MessageValue>;
}

export const messagesEs: Messages = {
  nav: {
    home: "Inicio",
    library: "Biblioteca",
    settings: "Ajustes",
    workspace: "Espacio de trabajo",
    hub: "Hub",
    appDetails: "Detalles de la app",
  },
  settings: {
    title: "Ajustes",
    searchPlaceholder: "Buscar ajustes...",
    searchEmpty: "Sin resultados para \"{query}\"",
    general: "General",
    appearance: "Apariencia",
    theme: "Tema",
    language: "Idioma",
    languageDescription: "Idioma del interfaz",
    agent: "Agente",
    aiBehavior: "Comportamiento del agente",
    aiBehaviorDescription: "Esfuerzo, verbosidad y modelos",
    permissions: "Permisos",
    permissionsDescription: "Permisos de las herramientas del agente",
    effort: "Esfuerzo",
    effortDescription: "Nivel de esfuerzo del agente al resolver tareas",
    verbosity: "Verbosidad",
    verbosityDescription: "Cuánto detalle incluye el agente en sus respuestas",
    model: "Modelo",
    modelDescription: "Modelo que usa el agente para responder",
    saved: "Ajustes guardados",
  },
  chat: {
    thinking: "Pensando",
    searching: "Buscando...",
    processing: "Procesando...",
    loading: "Cargando...",
    codeSearch: "Búsqueda de Código",
    allow: "Permitir",
    deny: "Denegar",
    allowAlways: "Permitir siempre",
    denyAlways: "Denegar siempre",
    ask: "Preguntar",
    toolRequest: "La herramienta quiere acceso:",
    version: "Versión",
    versions: "Versiones",
  },
  toast: {
    settingsSaved: "Ajustes guardados",
    errorGeneric: "Algo salió mal",
    saved: "Guardado",
    deleted: "Eliminado",
    created: "Creado",
  },
  common: {
    yes: "Sí",
    no: "No",
    cancel: "Cancelar",
    confirm: "Confirmar",
    close: "Cerrar",
    save: "Guardar",
    delete: "Eliminar",
    edit: "Editar",
    add: "Añadir",
    remove: "Quitar",
    retry: "Reintentar",
    back: "Volver",
    next: "Siguiente",
    search: "Buscar",
    loading: "Cargando...",
    empty: "Sin contenido",
  },
  plural: {
    files: { one: "{count} archivo", many: "{count} archivos" },
    apps: { one: "{count} app", many: "{count} apps" },
    messages: { one: "{count} mensaje", many: "{count} mensajes" },
    minutes: { one: "hace {count} minuto", many: "hace {count} minutos" },
    seconds: { one: "hace {count} segundo", many: "hace {count} segundos" },
  },
};
