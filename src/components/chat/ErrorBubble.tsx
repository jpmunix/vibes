/**
 * ErrorBubble.tsx
 *
 * Componente de error enriquecido para mensajes del asistente.
 * Muestra un mensaje amigable, botones de accion contextuales (segun si el
 * error es recuperable o irrecuperable), y una seccion colapsable con
 * detalles tecnicos.
 */

import React, { useState, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Settings,
  Bot,
  Plus,
} from "@/components/ui/icons";
import type { ErrorCode, ErrorAction } from "@/ipc/utils/error_classifier";

// ---------------------------------------------------------------------------
// Clasificacion local (frontend) — mirrors error_classifier.ts patterns
// ---------------------------------------------------------------------------

interface FrontendClassification {
  code: ErrorCode;
  userMessage: string;
  recoverable: boolean;
  actions: ErrorAction[];
}

/** Clasifica un string de error en el frontend para determinar UX. */
function classifyErrorFrontend(raw: string): FrontendClassification {
  const msg = raw
    .replace(/^Sorry, there was an error.*?:\s*/i, "")
    .replace(/^Session Error:\s*/i, "")
    .replace(/^\[req:[^\]]*\]\s*/i, "")
    .replace(/^Error de la IA:\s*/i, "")
    .replace(/^AI error:\s*/i, "")
    .replace(/^❌\s*(Error:?\s*)?/i, "")
    .trim();

  // Irrecuperables
  if (/insufficient.*(credit|fund|balance)|ExceededBudget|exceeded.*budget/i.test(msg)) {
    return {
      code: "credits_exhausted",
      recoverable: false,
      userMessage: "Parece que se agotaron los creditos de IA de tu cuenta.",
      actions: [
        { type: "open_external", label: "Recargar creditos", url: "https://openrouter.ai/credits" },
        { type: "navigate", label: "Cambiar modelo", route: "/settings" },
      ],
    };
  }
  if (/API key|unauthorized|authentication|forbidden|401|403/i.test(msg)) {
    return {
      code: "auth_invalid",
      recoverable: false,
      userMessage: "Parece que hay un problema con tu clave API. Revisala en ajustes.",
      actions: [{ type: "navigate", label: "Abrir Ajustes", route: "/settings" }],
    };
  }
  if (/model.*not.*found|does not exist|invalid.*model|No endpoints found/i.test(msg)) {
    return {
      code: "model_not_found",
      recoverable: false,
      userMessage: "Parece que el modelo seleccionado no esta disponible. Prueba con otro.",
      actions: [{ type: "navigate", label: "Cambiar modelo", route: "/settings" }],
    };
  }
  if (/context.*(too long|exceeded|limit)|max.*tokens|token.*limit|context_length/i.test(msg)) {
    return {
      code: "context_exceeded",
      recoverable: false,
      userMessage: "Parece que el chat es demasiado largo para el modelo. Abre un nuevo chat o cambia a un modelo con mayor ventana de contexto.",
      actions: [
        { type: "new_chat", label: "Nuevo chat" },
        { type: "navigate", label: "Cambiar modelo", route: "/settings" },
      ],
    };
  }
  if (/content.*filter|safety|blocked|moderation|content_policy/i.test(msg)) {
    return {
      code: "content_filtered",
      recoverable: false,
      userMessage: "Parece que el contenido fue bloqueado por los filtros de seguridad del modelo.",
      actions: [],
    };
  }
  if (/spawn.*ENOENT|opencode.*not found|binary not found/i.test(msg)) {
    return {
      code: "opencode_not_installed",
      recoverable: false,
      userMessage: "Parece que no se encontro el agente de IA. Reinicia Vibes para resolverlo.",
      actions: [],
    };
  }
  if (/ENOSPC|no space left/i.test(msg)) {
    return {
      code: "disk_full",
      recoverable: false,
      userMessage: "Parece que no queda espacio en disco. Libera espacio e intentalo de nuevo.",
      actions: [],
    };
  }

  // Recuperables
  if (/rate.?limit|resource.*(exhausted|exceeded)|too many requests|429/i.test(msg)) {
    return {
      code: "rate_limit",
      recoverable: true,
      userMessage: "Se ha superado el limite de solicitudes. Espera un momento e intentalo de nuevo.",
      actions: [{ type: "retry_delayed", label: "Reintentar en 10s", delayMs: 10_000 }],
    };
  }
  if (/timeout|timed?\s*out|APIConnectionTimeoutError/i.test(msg)) {
    return {
      code: "timeout",
      recoverable: true,
      userMessage: "La solicitud tardo demasiado. Intentalo de nuevo.",
      actions: [{ type: "retry", label: "Reintentar" }],
    };
  }
  if (/network|ECONNREFUSED|ETIMEDOUT|fetch failed|socket|APIConnectionError/i.test(msg)) {
    return {
      code: "network_error",
      recoverable: true,
      userMessage: "Error de conexion con el proveedor de IA. Comprueba tu conexion a internet.",
      actions: [{ type: "retry", label: "Reintentar" }],
    };
  }
  if (/server.*error|internal.*error|500|502|503/i.test(msg)) {
    return {
      code: "server_error",
      recoverable: true,
      userMessage: "Error del servidor de IA. Intentalo de nuevo en unos segundos.",
      actions: [{ type: "retry", label: "Reintentar" }],
    };
  }
  if (/session.*busy|SessionBusy/i.test(msg)) {
    return {
      code: "session_busy",
      recoverable: true,
      userMessage: "El agente esta ocupado con otra tarea. Espera a que termine.",
      actions: [{ type: "retry_delayed", label: "Reintentar en 3s", delayMs: 3_000 }],
    };
  }
  if (/session.*not.*found|Session creation returned no data/i.test(msg)) {
    return {
      code: "session_not_found",
      recoverable: true,
      userMessage: "No se pudo crear la sesion del agente. Intentalo de nuevo.",
      actions: [{ type: "retry", label: "Reintentar" }],
    };
  }
  if (/provider returned error/i.test(msg)) {
    return {
      code: "server_error",
      recoverable: true,
      userMessage: "El proveedor de IA devolvio un error. Intentalo de nuevo.",
      actions: [{ type: "retry", label: "Reintentar" }],
    };
  }
  if (/no.?output.?generated|empty.*response|zero.*tokens/i.test(msg)) {
    return {
      code: "server_error",
      recoverable: true,
      userMessage: "La IA no genero ninguna respuesta. Intentalo de nuevo.",
      actions: [{ type: "retry", label: "Reintentar" }],
    };
  }
  if (/cannot access.*before initialization|ReferenceError/i.test(msg)) {
    return {
      code: "server_crash",
      recoverable: true,
      userMessage: "Error interno de la aplicacion. Reinicia Vibes para resolverlo.",
      actions: [{ type: "retry", label: "Reintentar" }],
    };
  }

  // Fallback: recuperable
  return {
    code: "unknown",
    recoverable: true,
    userMessage: msg || "Ha ocurrido un error inesperado.",
    actions: [{ type: "retry", label: "Reintentar" }],
  };
}

// ---------------------------------------------------------------------------
// Icon resolver for actions
// ---------------------------------------------------------------------------

function getActionIcon(action: ErrorAction) {
  switch (action.type) {
    case "retry":
    case "retry_delayed":
      return RotateCcw;
    case "navigate":
      return action.route === "/settings" ? Settings : Bot;
    case "open_external":
      return ExternalLink;
    case "new_chat":
      return Plus;
    default:
      return RotateCcw;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ErrorBubbleProps {
  /** Texto del error crudo (del atom o persistido) */
  rawError: string;
  /** Callback para reintentar el stream (solo para errores recuperables) */
  onRetry?: () => void;
  /** Callback para crear un nuevo chat */
  onNewChat?: () => void;
}

export function ErrorBubble({ rawError, onRetry, onNewChat }: ErrorBubbleProps) {
  const navigate = useNavigate();
  const [showDetails, setShowDetails] = useState(false);
  const [retryCountdown, setRetryCountdown] = useState<number | null>(null);

  const classified = classifyErrorFrontend(rawError);

  const handleAction = useCallback(
    (action: ErrorAction) => {
      switch (action.type) {
        case "retry":
          onRetry?.();
          break;

        case "retry_delayed": {
          const delayMs = action.delayMs ?? 5000;
          const seconds = Math.ceil(delayMs / 1000);
          setRetryCountdown(seconds);
          const interval = setInterval(() => {
            setRetryCountdown((prev) => {
              if (prev === null || prev <= 1) {
                clearInterval(interval);
                onRetry?.();
                return null;
              }
              return prev - 1;
            });
          }, 1000);
          break;
        }

        case "navigate":
          if (action.route) {
            navigate({ to: action.route as any });
          }
          break;

        case "open_external":
          if (action.url) {
            window.open(action.url, "_blank");
          }
          break;

        case "new_chat":
          onNewChat?.();
          break;
      }
    },
    [navigate, onRetry, onNewChat],
  );

  return (
    <div className="space-y-2.5">
      {/* Mensaje principal */}
      <div className="flex items-start gap-2 text-rose-600 dark:text-rose-400">
        <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
        <span className="typo-label leading-relaxed">{classified.userMessage}</span>
      </div>

      {/* Botones de accion */}
      {classified.actions.length > 0 && (
        <div className="flex flex-wrap gap-2 ml-6">
          {classified.actions.map((action, i) => {
            const Icon = getActionIcon(action);
            const isCountingDown =
              action.type === "retry_delayed" && retryCountdown !== null;
            const label = isCountingDown
              ? `Reintentando en ${retryCountdown}s...`
              : action.label;

            return (
              <button
                key={i}
                onClick={() => handleAction(action)}
                disabled={isCountingDown}
                className={`
                  inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5
                  text-xs font-medium transition-colors cursor-pointer
                  ${isCountingDown
                    ? "bg-muted text-muted-foreground cursor-wait"
                    : "bg-secondary text-secondary-foreground hover:bg-secondary/80 shadow-xs"
                  }
                `}
              >
                <Icon
                  size={13}
                  className={isCountingDown ? "animate-spin" : ""}
                />
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* Seccion colapsable con detalles tecnicos */}
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="flex items-center gap-1 ml-6 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        {showDetails ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        <span>Ver detalles</span>
      </button>

      {showDetails && (
        <div className="ml-6 px-3 py-2 rounded-md bg-muted/50 border border-border/30">
          <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap break-all font-mono leading-relaxed">
            {rawError}
          </pre>
        </div>
      )}
    </div>
  );
}
