/**
 * error_classifier.ts
 *
 * Modulo central de clasificacion de errores para OpenCode/Vibes.
 * Normaliza cualquier error (SDK, SSE, HTTP, generico) a una estructura tipada
 * con mensaje humano, acciones, y estrategia de auto-recovery.
 *
 * Usado tanto en el backend (opencode_adapter, chat_stream_handlers)
 * como referencia para el frontend (ErrorBubble).
 */

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type ErrorCode =
  | "rate_limit"
  | "auth_invalid"
  | "credits_exhausted"
  | "model_not_found"
  | "context_exceeded"
  | "content_filtered"
  | "network_error"
  | "server_crash"
  | "session_not_found"
  | "session_busy"
  | "timeout"
  | "server_error"
  | "opencode_not_installed"
  | "disk_full"
  | "unknown";

export type ErrorActionType =
  | "retry"
  | "retry_delayed"
  | "navigate"
  | "open_external"
  | "new_chat";

export interface ErrorAction {
  type: ErrorActionType;
  label: string;
  /** Solo para "retry_delayed" */
  delayMs?: number;
  /** Solo para "navigate" */
  route?: string;
  /** Solo para "open_external" */
  url?: string;
}

export type AutoFixStrategy =
  | "restart_opencode"
  | "recreate_session"
  | "abort_and_retry"
  | "retry_with_backoff";

export interface ClassifiedError {
  /** Codigo de error interno para routing de logica */
  code: ErrorCode;
  /** Mensaje humano en español */
  userMessage: string;
  /** Mensaje tecnico original (para "Ver detalles") */
  technicalDetail: string;
  /** Si el error es recuperable (reintentar puede funcionar) */
  recoverable: boolean;
  /** Acciones que puede tomar el usuario */
  actions: ErrorAction[];
  /** Si es auto-reparable, que estrategia usar (backend) */
  autoFix: AutoFixStrategy | null;
}

// ---------------------------------------------------------------------------
// Extraccion de mensaje legible
// ---------------------------------------------------------------------------

/**
 * Extrae un mensaje de error legible desde cualquier estructura de error.
 * Recorre la cadena: .error.message > .message > .error.error.message >
 * .statusText > truncated stringify.
 *
 * Nunca devuelve JSON crudo largo — trunca a 300 chars como maximo.
 */
export function extractReadableError(errorInput: unknown): string {
  if (typeof errorInput === "string") return errorInput;
  if (errorInput instanceof Error) return errorInput.message;
  if (!errorInput || typeof errorInput !== "object") return String(errorInput);

  const obj = errorInput as Record<string, any>;

  // OpenRouter nested: { error: { message: "..." } }
  if (obj.error?.message && typeof obj.error.message === "string") {
    return obj.error.message;
  }

  // Direct message
  if (obj.message && typeof obj.message === "string") {
    return obj.message;
  }

  // Double nested: { error: { error: { message: "..." } } }
  if (obj.error?.error?.message && typeof obj.error.error.message === "string") {
    return obj.error.error.message;
  }

  // HTTP status
  if (obj.status && obj.statusText) {
    return `${obj.status}: ${obj.statusText}`;
  }

  // SSE event props — common in OpenCode events
  if (obj.error && typeof obj.error === "string") {
    return obj.error;
  }

  // Last resort — stringify pero truncado y limpio
  try {
    const raw = JSON.stringify(obj, null, 0);
    return raw.length > 300 ? raw.slice(0, 300) + "..." : raw;
  } catch {
    return String(errorInput);
  }
}

// ---------------------------------------------------------------------------
// Tabla de clasificacion
// ---------------------------------------------------------------------------

interface ErrorPattern {
  test: RegExp;
  code: ErrorCode;
  recoverable: boolean;
  userMessage: string;
  actions: ErrorAction[];
  autoFix: AutoFixStrategy | null;
}

const ERROR_PATTERNS: ErrorPattern[] = [
  // --- Irrecuperables ---
  {
    test: /insufficient.*(credit|fund|balance)|ExceededBudget|exceeded.*budget/i,
    code: "credits_exhausted",
    recoverable: false,
    userMessage: "Parece que se agotaron los creditos de IA de tu cuenta.",
    actions: [
      { type: "open_external", label: "Recargar creditos", url: "https://openrouter.ai/credits" },
      { type: "navigate", label: "Cambiar modelo", route: "/settings" },
    ],
    autoFix: null,
  },
  {
    test: /API key|unauthorized|authentication|forbidden|401|403/i,
    code: "auth_invalid",
    recoverable: false,
    userMessage: "Parece que hay un problema con tu clave API. Revisala en ajustes.",
    actions: [
      { type: "navigate", label: "Abrir Ajustes", route: "/settings" },
    ],
    autoFix: null,
  },
  {
    test: /model.*not.*found|does not exist|invalid.*model|No endpoints found/i,
    code: "model_not_found",
    recoverable: false,
    userMessage: "Parece que el modelo seleccionado no esta disponible. Prueba con otro.",
    actions: [
      { type: "navigate", label: "Cambiar modelo", route: "/settings" },
    ],
    autoFix: null,
  },
  {
    test: /context.*(too long|exceeded|limit)|max.*tokens|token.*limit|context_length/i,
    code: "context_exceeded",
    recoverable: false,
    userMessage: "Parece que el chat es demasiado largo para el modelo. Abre un nuevo chat o cambia a un modelo con mayor ventana de contexto.",
    actions: [
      { type: "new_chat", label: "Nuevo chat" },
      { type: "navigate", label: "Cambiar modelo", route: "/settings" },
    ],
    autoFix: null,
  },
  {
    test: /content.*filter|safety|blocked|moderation|content_policy/i,
    code: "content_filtered",
    recoverable: false,
    userMessage: "Parece que el contenido fue bloqueado por los filtros de seguridad del modelo.",
    actions: [],
    autoFix: null,
  },
  {
    test: /spawn.*ENOENT|opencode.*not found|binary not found/i,
    code: "opencode_not_installed",
    recoverable: false,
    userMessage: "Parece que no se encontro el agente de IA. Reinicia Vibes para resolverlo.",
    actions: [],
    autoFix: null,
  },
  {
    test: /ENOSPC|no space left/i,
    code: "disk_full",
    recoverable: false,
    userMessage: "Parece que no queda espacio en disco. Libera espacio e intentalo de nuevo.",
    actions: [],
    autoFix: null,
  },

  // --- Recuperables ---
  {
    test: /rate.?limit|resource.*(exhausted|exceeded)|too many requests|429/i,
    code: "rate_limit",
    recoverable: true,
    userMessage: "Se ha superado el limite de solicitudes. Espera un momento e intentalo de nuevo.",
    actions: [
      { type: "retry_delayed", label: "Reintentar en 10s", delayMs: 10_000 },
    ],
    autoFix: "retry_with_backoff",
  },
  {
    test: /timeout|timed?\s*out|APIConnectionTimeoutError/i,
    code: "timeout",
    recoverable: true,
    userMessage: "La solicitud tardo demasiado. Intentalo de nuevo.",
    actions: [
      { type: "retry", label: "Reintentar" },
    ],
    autoFix: null,
  },
  {
    test: /network|ECONNREFUSED|ETIMEDOUT|fetch failed|socket|APIConnectionError/i,
    code: "network_error",
    recoverable: true,
    userMessage: "Error de conexion con el proveedor de IA. Comprueba tu conexion a internet.",
    actions: [
      { type: "retry", label: "Reintentar" },
    ],
    autoFix: "restart_opencode",
  },
  {
    test: /server.*error|internal.*error|500|502|503|InternalServerError/i,
    code: "server_error",
    recoverable: true,
    userMessage: "Error del servidor de IA. Intentalo de nuevo en unos segundos.",
    actions: [
      { type: "retry", label: "Reintentar" },
    ],
    autoFix: null,
  },
  {
    test: /session.*busy|SessionBusy/i,
    code: "session_busy",
    recoverable: true,
    userMessage: "El agente esta ocupado con otra tarea. Espera a que termine.",
    actions: [
      { type: "retry_delayed", label: "Reintentar en 3s", delayMs: 3_000 },
    ],
    autoFix: "abort_and_retry",
  },
  {
    test: /session.*not.*found|StorageNotFound|SessionNotFound|404.*session/i,
    code: "session_not_found",
    recoverable: true,
    userMessage: "La sesion del agente se perdio. Se creara una nueva automaticamente.",
    actions: [
      { type: "retry", label: "Reintentar" },
    ],
    autoFix: "recreate_session",
  },
  {
    test: /Session creation returned no data/i,
    code: "session_not_found",
    recoverable: true,
    userMessage: "No se pudo crear la sesion del agente. Intentalo de nuevo.",
    actions: [
      { type: "retry", label: "Reintentar" },
    ],
    autoFix: "recreate_session",
  },
  {
    test: /cannot access.*before initialization|ReferenceError/i,
    code: "server_crash",
    recoverable: true,
    userMessage: "Error interno de la aplicacion. Reinicia Vibes para resolverlo.",
    actions: [
      { type: "retry", label: "Reintentar" },
    ],
    autoFix: "restart_opencode",
  },
  {
    test: /provider returned error/i,
    code: "server_error",
    recoverable: true,
    userMessage: "El proveedor de IA devolvio un error. Intentalo de nuevo.",
    actions: [
      { type: "retry", label: "Reintentar" },
    ],
    autoFix: null,
  },
  {
    test: /no.?output.?generated|empty.*response|zero.*tokens/i,
    code: "server_error",
    recoverable: true,
    userMessage: "La IA no genero ninguna respuesta. Intentalo de nuevo.",
    actions: [
      { type: "retry", label: "Reintentar" },
    ],
    autoFix: null,
  },
];

// ---------------------------------------------------------------------------
// Clasificador principal
// ---------------------------------------------------------------------------

/**
 * Clasifica cualquier error en una estructura tipada con mensaje humano,
 * acciones del usuario, y estrategia de auto-recovery.
 */
export function classifyError(error: unknown): ClassifiedError {
  const technicalDetail = extractReadableError(error);

  // Limpiar prefijos conocidos para el matching
  const cleanMsg = technicalDetail
    .replace(/^Session Error:\s*/i, "")
    .replace(/^Sorry, there was an error.*?:\s*/i, "")
    .replace(/^Error de la IA:\s*/i, "")
    .replace(/^\[req:[^\]]*\]\s*/i, "")
    .replace(/^AI error:\s*/i, "")
    .replace(/^❌\s*(Error:?\s*)?/i, "")
    .trim();

  for (const pattern of ERROR_PATTERNS) {
    if (pattern.test.test(cleanMsg)) {
      return {
        code: pattern.code,
        userMessage: pattern.userMessage,
        technicalDetail,
        recoverable: pattern.recoverable,
        actions: pattern.actions,
        autoFix: pattern.autoFix,
      };
    }
  }

  // Fallback: error desconocido, asumimos recuperable
  return {
    code: "unknown",
    userMessage: cleanMsg || "Ha ocurrido un error inesperado.",
    technicalDetail,
    recoverable: true,
    actions: [
      { type: "retry", label: "Reintentar" },
    ],
    autoFix: null,
  };
}
