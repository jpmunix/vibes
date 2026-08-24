/**
 * ErrorBubble.tsx
 *
 * Componente de error enriquecido para mensajes del asistente.
 * Muestra un mensaje amigable, botones de accion contextuales (segun si el
 * error es recuperable o irrecuperable), y una seccion colapsable con
 * detalles tecnicos.
 *
 * P1: los strings visibles viven en el diccionario i18n (namespace `errors.*`),
 * la clasificacion devuelve claves y el componente resuelve con useI18n().
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
import type { ErrorCode, ErrorActionType } from "@/ipc/utils/error_classifier";
import { useI18n } from "@/lib/i18n";

// ---------------------------------------------------------------------------
// Clasificacion local (frontend) — mirrors error_classifier.ts patterns
// ---------------------------------------------------------------------------

interface FrontendAction {
  type: ErrorActionType;
  /** i18n key under `errors.action.*` */
  labelKey: string;
  delayMs?: number;
  route?: string;
  url?: string;
}

interface FrontendClassification {
  code: ErrorCode;
  /** i18n key under `errors.userMessage.*` */
  userMessageKey: string;
  recoverable: boolean;
  actions: FrontendAction[];
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
  if (
    /insufficient.*(credit|fund|balance)|ExceededBudget|exceeded.*budget/i.test(
      msg,
    )
  ) {
    return {
      code: "credits_exhausted",
      recoverable: false,
      userMessageKey: "errors.userMessage.creditsExhausted",
      actions: [
        {
          type: "open_external",
          labelKey: "errors.action.reloadCredits",
          url: "https://openrouter.ai/credits",
        },
        { type: "navigate", labelKey: "errors.action.changeModel", route: "/settings" },
      ],
    };
  }
  if (/API key|unauthorized|authentication|forbidden|401|403/i.test(msg)) {
    return {
      code: "auth_invalid",
      recoverable: false,
      userMessageKey: "errors.userMessage.authInvalid",
      actions: [
        { type: "navigate", labelKey: "errors.action.openSettings", route: "/settings" },
      ],
    };
  }
  if (
    /model.*not.*found|does not exist|invalid.*model|No endpoints found/i.test(
      msg,
    )
  ) {
    return {
      code: "model_not_found",
      recoverable: false,
      userMessageKey: "errors.userMessage.modelNotFound",
      actions: [
        { type: "navigate", labelKey: "errors.action.changeModel", route: "/settings" },
      ],
    };
  }
  if (
    /context.*(too long|exceeded|limit)|max.*tokens|token.*limit|context_length/i.test(
      msg,
    )
  ) {
    return {
      code: "context_exceeded",
      recoverable: false,
      userMessageKey: "errors.userMessage.contextExceeded",
      actions: [
        { type: "new_chat", labelKey: "errors.action.newChat" },
        { type: "navigate", labelKey: "errors.action.changeModel", route: "/settings" },
      ],
    };
  }
  if (/content.*filter|safety|blocked|moderation|content_policy/i.test(msg)) {
    return {
      code: "content_filtered",
      recoverable: false,
      userMessageKey: "errors.userMessage.contentFiltered",
      actions: [],
    };
  }
  if (/spawn.*ENOENT|opencode.*not found|binary not found/i.test(msg)) {
    return {
      code: "opencode_not_installed",
      recoverable: false,
      userMessageKey: "errors.userMessage.opencodeNotInstalled",
      actions: [],
    };
  }
  if (/ENOSPC|no space left/i.test(msg)) {
    return {
      code: "disk_full",
      recoverable: false,
      userMessageKey: "errors.userMessage.diskFull",
      actions: [],
    };
  }

  // Recuperables
  if (
    /rate.?limit|resource.*(exhausted|exceeded)|too many requests|429/i.test(
      msg,
    )
  ) {
    return {
      code: "rate_limit",
      recoverable: true,
      userMessageKey: "errors.userMessage.rateLimit",
      actions: [
        { type: "retry_delayed", labelKey: "errors.action.retryIn10s", delayMs: 10_000 },
      ],
    };
  }
  if (/timeout|timed?\s*out|APIConnectionTimeoutError/i.test(msg)) {
    return {
      code: "timeout",
      recoverable: true,
      userMessageKey: "errors.userMessage.timeout",
      actions: [{ type: "retry", labelKey: "errors.action.retry" }],
    };
  }
  if (
    /network|ECONNREFUSED|ETIMEDOUT|fetch failed|socket|APIConnectionError/i.test(
      msg,
    )
  ) {
    return {
      code: "network_error",
      recoverable: true,
      userMessageKey: "errors.userMessage.networkError",
      actions: [{ type: "retry", labelKey: "errors.action.retry" }],
    };
  }
  if (/server.*error|internal.*error|500|502|503/i.test(msg)) {
    return {
      code: "server_error",
      recoverable: true,
      userMessageKey: "errors.userMessage.serverError",
      actions: [{ type: "retry", labelKey: "errors.action.retry" }],
    };
  }
  if (/session.*busy|SessionBusy/i.test(msg)) {
    return {
      code: "session_busy",
      recoverable: true,
      userMessageKey: "errors.userMessage.sessionBusy",
      actions: [
        { type: "retry_delayed", labelKey: "errors.action.retryIn3s", delayMs: 3_000 },
      ],
    };
  }
  if (/session.*not.*found|Session creation returned no data/i.test(msg)) {
    return {
      code: "session_not_found",
      recoverable: true,
      userMessageKey: "errors.userMessage.sessionNotFound",
      actions: [{ type: "retry", labelKey: "errors.action.retry" }],
    };
  }
  if (/provider returned error/i.test(msg)) {
    return {
      code: "server_error",
      recoverable: true,
      userMessageKey: "errors.userMessage.providerError",
      actions: [{ type: "retry", labelKey: "errors.action.retry" }],
    };
  }
  if (/no.?output.?generated|empty.*response|zero.*tokens/i.test(msg)) {
    return {
      code: "server_error",
      recoverable: true,
      userMessageKey: "errors.userMessage.noOutput",
      actions: [{ type: "retry", labelKey: "errors.action.retry" }],
    };
  }
  if (/cannot access.*before initialization|ReferenceError/i.test(msg)) {
    return {
      code: "server_crash",
      recoverable: true,
      userMessageKey: "errors.userMessage.serverCrash",
      actions: [{ type: "retry", labelKey: "errors.action.retry" }],
    };
  }

  // Fallback: recuperable
  return {
    code: "unknown",
    recoverable: true,
    userMessageKey: "errors.fallback",
    actions: [{ type: "retry", labelKey: "errors.action.retry" }],
  };
}

// ---------------------------------------------------------------------------
// Icon resolver for actions
// ---------------------------------------------------------------------------

function getActionIcon(action: FrontendAction) {
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

export function ErrorBubble({
  rawError,
  onRetry,
  onNewChat,
}: ErrorBubbleProps) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [showDetails, setShowDetails] = useState(false);
  const [retryCountdown, setRetryCountdown] = useState<number | null>(null);

  const classified = classifyErrorFrontend(rawError);

  const handleAction = useCallback(
    (action: FrontendAction) => {
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
        <span className="typo-label leading-relaxed">
          {t(classified.userMessageKey)}
        </span>
      </div>

      {/* Botones de accion */}
      {classified.actions.length > 0 && (
        <div className="flex flex-wrap gap-2 ml-6">
          {classified.actions.map((action, i) => {
            const Icon = getActionIcon(action);
            const isCountingDown =
              action.type === "retry_delayed" && retryCountdown !== null;
            const label = isCountingDown
              ? t("errors.retryingIn", { seconds: retryCountdown ?? 0 })
              : t(action.labelKey);

            return (
              <button
                key={i}
                onClick={() => handleAction(action)}
                disabled={isCountingDown}
                className={`
                  inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5
                  text-xs font-medium transition-colors cursor-pointer
                  ${
                    isCountingDown
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
        <span>{t("errors.showDetails")}</span>
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
