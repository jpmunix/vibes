import React from "react";
import { MessageCircleQuestion, CheckCircle2 } from "@/components/ui/icons";

interface VibesQuestionCardProps {
  question?: string;
  answer?: string;
  durationMs?: string | number;
}

/**
 * Tarjeta plasmada en el chat para la tool `question` (post-migración runtime).
 *
 * Muestra la pregunta que hizo el agente y la respuesta que dio el usuario
 * con la estética teal/violeta consistente con el resto de componentes de
 * preguntas y confirmaciones de Vibes.
 */
export const VibesQuestionCard: React.FC<VibesQuestionCardProps> = ({
  question,
  answer,
  durationMs,
}) => {
  const displayQuestion = question?.trim() || "";
  const displayAnswer = answer?.trim() || "(sin respuesta)";

  // Si no hay pregunta ni respuesta discernible, no renderizar nada
  if (!displayQuestion && !answer) {
    return null;
  }

  // Parsear duración si existe
  const durNum =
    typeof durationMs === "number"
      ? durationMs
      : durationMs
        ? Number(durationMs)
        : undefined;
  const durText =
    durNum && !Number.isNaN(durNum)
      ? `${(durNum / 1000).toFixed(1)}s`
      : undefined;

  return (
    <div
      data-testid="vibes-question-card"
      className="my-2 rounded-xl overflow-hidden"
      style={{
        background:
          "linear-gradient(135deg, var(--accent-teal-gradient-start), var(--accent-teal-gradient-end))",
        border: "1px solid var(--accent-teal-border)",
        boxShadow:
          "0 4px 24px var(--accent-teal-shadow), inset 0 1px 0 oklch(1 0 0 / 0.03)",
      }}
    >
      {/* Header bar */}
      <div
        className="flex items-center gap-2.5 px-4 py-2.5"
        style={{ borderBottom: "1px solid var(--accent-teal-header-divider)" }}
      >
        <div
          className="flex items-center justify-center w-6 h-6 rounded-md"
          style={{ background: "var(--accent-teal-icon-bg)" }}
        >
          <MessageCircleQuestion
            size={14}
            style={{ color: "var(--accent-teal-icon)" }}
          />
        </div>
        <span
          className="text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--accent-teal-label)" }}
        >
          Pregunta del agente
        </span>

        {/* Status indicator: Respondido */}
        <div className="ml-auto flex items-center gap-1.5">
          <CheckCircle2
            size={13}
            style={{ color: "var(--accent-teal-selected-icon)" }}
          />
          <span
            className="text-[10px] font-medium"
            style={{ color: "var(--accent-teal-status-text)" }}
          >
            Respondido
          </span>
          {durText && (
            <span
              className="text-[10px] opacity-60 ml-1 font-mono"
              style={{ color: "var(--accent-teal-status-text)" }}
            >
              · {durText}
            </span>
          )}
        </div>
      </div>

      {/* Body: Pregunta + Respuesta plasmada */}
      <div className="px-4 py-3 space-y-3">
        {displayQuestion ? (
          <div>
            <p className="text-[13px] leading-relaxed text-foreground/90 font-medium">
              {displayQuestion}
            </p>
          </div>
        ) : null}

        {/* Respuesta del usuario destacada */}
        <div>
          <div
            className="text-[10px] font-semibold uppercase tracking-wider mb-1.5"
            style={{ color: "var(--accent-teal-context-text)" }}
          >
            Tu respuesta
          </div>
          <div
            className="flex items-start gap-2.5 px-3 py-2 rounded-lg"
            style={{
              background: "var(--accent-teal-selected-bg)",
              border: "1px solid var(--accent-teal-selected-border)",
              boxShadow: "0 0 12px var(--accent-teal-glow)",
            }}
          >
            <div className="pt-0.5">
              <CheckCircle2
                size={14}
                style={{ color: "var(--accent-teal-selected-icon)" }}
              />
            </div>
            <div
              className="text-[13px] leading-snug whitespace-pre-wrap flex-1"
              style={{ color: "var(--accent-teal-selected-text)" }}
            >
              {displayAnswer}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
