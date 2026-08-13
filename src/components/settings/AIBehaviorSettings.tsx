import React, { useState } from "react";
import { systemClient } from "@/ipc/types/system";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useSettings } from "@/hooks/useSettings";
import { cn } from "@/lib/utils";

import { useNavigate } from "@tanstack/react-router";
import { StrategistModelSelector } from "./StrategistModelSelector";
import { ExecutorModelSelector } from "./ExecutorModelSelector";
import { VisionModelSelector } from "./VisionModelSelector";
import { AgentToolsSettings } from "./AgentToolsSettings";
import { AgentPermissionsSettings } from "./AgentPermissionsSettings";
import { Switch } from "@/components/ui/switch";

import { MAX_CHAT_TURNS_IN_CONTEXT } from "@/constants/settings_constants";
import { EMBEDDING_MODELS } from "@/ipc/shared/embedding_model_constants";
import type { ChatLanguage } from "@/lib/schemas";
import { ReasoningEffortSelector } from "../ReasoningEffortSelector";
import { TextVerbositySelector } from "../TextVerbositySelector";
import { AgentModelSelector } from "./AgentModelSelector";
import type { AgentId } from "./AgentModelSelector";
import { ChevronRight } from "@/components/ui/icons";
import { MODEL_SELECTOR_STATUS } from "./model_selector_status";

// ─── Chat turns options ───
const turnsOptions = [
  { value: "2", label: "Económico (2)" },
  { value: "default", label: `Por defecto (${MAX_CHAT_TURNS_IN_CONTEXT})` },
  { value: "5", label: "Plus (5)" },
  { value: "10", label: "Alto (10)" },
  { value: "100", label: "Máximo (100)" },
];

// ─── Language options ───
const languageOptions: { value: ChatLanguage; label: string }[] = [
  { value: "es", label: "Español" },
  { value: "en", label: "English" },
];

// ─── Reusable SettingItem ───
function SettingRow({
  label,
  description,
  control,
}: {
  label: string;
  description?: React.ReactNode;
  control: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex justify-between gap-8 p-4 rounded-xl hover:bg-muted/50 transition-colors items-center",
      )}
    >
      <div className="flex-1 min-w-0">
        <h3 className="typo-label">{label}</h3>
        {description && (
          <p className="typo-caption mt-1 leading-relaxed">{description}</p>
        )}
      </div>
      <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
        {control}
      </div>
    </div>
  );
}

// ─── Agent model definitions for the collapsible section ───
const AGENT_MODEL_ENTRIES: { id: AgentId; label: string; description: string }[] = [
  { id: "plan",       label: "Plan",        description: "Análisis y planificación" },
  { id: "explore",    label: "Explore",     description: "Exploración del codebase (solo lectura)" },
  { id: "general",    label: "General",     description: "Subagente multipropósito para tareas en paralelo" },
  { id: "compaction", label: "Compaction",  description: "Compactación automática de contexto largo" },
  { id: "title",      label: "Title",       description: "Generación de títulos de sesión" },
  { id: "summary",    label: "Summary",     description: "Resúmenes automáticos de sesión" },
  { id: "mockup",     label: "Mockup",      description: "Mockups y ediciones visuales rápidas (sin terminal)" },
];

// ─── Chip de deuda visual (card #115) ───
// Marca selectores configurables pero sin lectores en el runtime todavía.
function InactiveChip({ note }: { note?: string }) {
  return (
    <span
      title={note}
      className="ml-2 inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-red-100 text-red-800 dark:bg-red-800/20 dark:text-red-400 border border-red-200 dark:border-red-800/50 cursor-help"
    >
      Sin efecto aún
    </span>
  );
}

// ─── Collapsible agent models section ───
function AgentModelsSection() {
  const [expanded, setExpanded] = useState(false);
  const agentModelsStatus = MODEL_SELECTOR_STATUS.agentModels;

  return (
    <div className="space-y-4">
      <div
        className="flex items-center justify-between cursor-pointer group p-4 rounded-xl border border-border hover:bg-muted/50 transition-colors gap-4"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex-1">
          <h3 className="typo-label">
            Modelos por agente
            {!agentModelsStatus.active && (
              <InactiveChip note={agentModelsStatus.note} />
            )}
          </h3>
          <p className="typo-caption mt-1">
            Asigna un modelo distinto a cada agente interno para optimizar coste y rendimiento
            {!agentModelsStatus.active &&
              " — estos overrides aún no se aplican (se enchufarán con el nuevo runtime)"}
          </p>
        </div>
        <ChevronRight
          className={cn(
            "size-5 text-muted-foreground/50 group-hover:text-foreground transition-transform duration-200 shrink-0",
            expanded && "rotate-90",
          )}
        />
      </div>

      {expanded && (
        <div
          className={cn(
            "pl-4 space-y-0",
            !agentModelsStatus.active && "opacity-60",
          )}
        >
          {AGENT_MODEL_ENTRIES.map((entry) => (
            <SettingRow
              key={entry.id}
              label={entry.label}
              description={entry.description}
              control={<AgentModelSelector agentId={entry.id} />}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function AIBehaviorSettings({
  isHighlighted,
}: {
  isHighlighted?: boolean;
}) {
  const { settings, updateSettings } = useSettings();
  const navigate = useNavigate();
  const isAdminUser = useIsAdmin();

  // ─── Current values ───

  const currentTurnsRaw =
    settings?.maxChatTurnsInContext?.toString() || "default";
  const currentTurnsLabel =
    turnsOptions.find((o) => o.value === currentTurnsRaw)?.label ||
    `Por defecto (${MAX_CHAT_TURNS_IN_CONTEXT})`;

  const currentLang = settings?.chatLanguage || "es";

  const selectedEmbeddingModel =
    settings?.embeddingsModel ?? "openai/text-embedding-3-small";
  const currentEmbeddingLabel =
    EMBEDDING_MODELS.find((m) => m.id === selectedEmbeddingModel)?.name ||
    "text-embedding-3-small";

  return (
    <>
      <div
        id="ai-behavior"
        className={cn(
          "bg-card rounded-2xl shadow-sm p-8 border border-border transition-[border-color,box-shadow] duration-300",
          isHighlighted
            ? "ring-2 ring-primary ring-offset-4 ring-offset-muted/30"
            : "",
        )}
      >
        <div className="mb-8">
          <h2 className="typo-section-title">Agente</h2>
          <p className="typo-caption mt-1">
            Personaliza cómo los agentes procesan la información y los modelos
            que usan
          </p>
        </div>

        <div className="space-y-4">
          {/* Prompts — clickable row (hidden: feature not actively used, preserved for future) */}
          {/* <div
          className="flex items-center justify-between cursor-pointer group p-4 rounded-xl border border-border hover:bg-muted/50 transition-colors gap-4"
          onClick={() => navigate({ to: "/settings/prompts" })}
        >
          <div className="flex-1">
            <h3 className="typo-label">Prompts personalizados</h3>
            <p className="typo-caption mt-1">
              Instrucciones adicionales que el agente seguirá en cada conversación
            </p>
          </div>
          <ChevronRight
            className="size-5 text-muted-foreground/50 group-hover:text-foreground transition-transform duration-200 shrink-0"
          />
        </div> */}

          {/* Idioma — two pills */}
          <SettingRow
            label="Idioma"
            description="Idioma en que el agente se comunicará contigo"
            control={
              <div className="relative bg-muted/50 rounded-xl p-1 flex w-fit border border-border">
                {languageOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() =>
                      updateSettings({ chatLanguage: option.value })
                    }
                    className={cn(
                      "px-4 py-1.5 typo-select rounded-lg transition-colors duration-200 cursor-pointer",
                      currentLang === option.value
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "hover:bg-primary/10",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            }
          />

          <SettingRow
            label="Esfuerzo de razonamiento"
            description="Controla cuánto análisis previo realiza el agente"
            control={<ReasoningEffortSelector variant="settings" />}
          />

          <SettingRow
            label="Verbosidad"
            description="Controla cuánto detalle incluye el agente en sus respuestas"
            control={<TextVerbositySelector variant="settings" />}
          />

          {/* Vista del chat: Max / Flow / Zen */}
          <SettingRow
            label="Vista del chat"
            description={
              (settings?.chatRenderMode ?? "zen") === "zen"
                ? "Respuestas limpias mostrando solo lo esencial. Más ligero y rápido."
                : settings?.chatRenderMode === "flow"
                  ? "Como Zen, pero mostrando los pensamientos de la IA en tiempo real."
                  : "Muestra todos los pasos intermedios del agente con detalles expandibles."
            }
            control={
              <div className="relative bg-muted/50 rounded-xl p-1 flex w-fit border border-border">
                {[
                  { value: "full" as const, label: "Max" },
                  { value: "flow" as const, label: "Flow" },
                  { value: "zen" as const, label: "Zen" },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() =>
                      updateSettings({ chatRenderMode: option.value })
                    }
                    className={cn(
                      "px-4 py-1.5 typo-select rounded-lg transition-colors duration-200 cursor-pointer",
                      (settings?.chatRenderMode ?? "zen") === option.value
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "hover:bg-primary/10",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            }
          />

          {/* Turnos de contexto — hidden: OpenCode manages context internally */}

          {/* Búsqueda Semántica — hidden: embeddings retired (KB no longer used in agent mode) */}

          {/* ── Modelos por agente — collapsible section ── */}
          <AgentModelsSection />


          {/* ── Modelo Estratega ── */}
          <SettingRow
            label="Modelo estratega"
            description="Asistente de prompts, resúmenes de traspaso y compactación de memoria"
            control={<StrategistModelSelector />}
          />

          {/* ── Modelo Ejecutor ── */}
          <SettingRow
            label="Modelo ejecutor"
            description="Títulos de chats/apps, mensajes de commit en Git y agente rápido de mockups"
            control={<ExecutorModelSelector />}
          />

          {/* ── Preprocesador de Visión ── */}
          <SettingRow
            label="Preprocesador de Visión"
            description="Traduce imágenes a texto de forma transparente cuando usas un modelo sin capacidades de visión"
            control={
              <div className="relative bg-muted/50 rounded-xl p-1 flex w-fit border border-border">
                {(
                  [
                    { value: false, label: "Desactivado" },
                    { value: true, label: "Activado" },
                  ] as const
                ).map((option) => (
                  <button
                    key={String(option.value)}
                    onClick={() =>
                      updateSettings({
                        visionPreprocessorEnabled: option.value,
                      })
                    }
                    className={cn(
                      "px-4 py-1.5 typo-select rounded-lg transition-colors duration-200 cursor-pointer",
                      (settings?.visionPreprocessorEnabled ?? true) ===
                        option.value
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "hover:bg-primary/10",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            }
          />
          {settings?.visionPreprocessorEnabled !== false && (
            <SettingRow
              label="Modelo de Visión"
              description="El modelo encargado de analizar y describir las imágenes"
              control={<VisionModelSelector />}
            />
          )}

          {/* Morph Patch Engine — admin only */}
          {isAdminUser && (
            <SettingRow
              label="Morph Patch Engine"
              description="Ediciones de código ultrarrápidas vía Morph V3"
              control={
                <div className="relative bg-muted/50 rounded-xl p-1 flex w-fit border border-border">
                  {(
                    [
                      { value: false, label: "Desactivado" },
                      { value: true, label: "Activado" },
                    ] as const
                  ).map((option) => (
                    <button
                      key={String(option.value)}
                      onClick={() => {
                        updateSettings({
                          enableMorphPatchTool: option.value,
                        } as any);
                        // Restart OpenCode server so new tool state takes effect immediately
                        systemClient.restartOpenCodeServer().catch(() => {});
                      }}
                      className={cn(
                        "px-4 py-1.5 typo-select rounded-lg transition-colors duration-200 cursor-pointer",
                        ((settings as any)?.enableMorphPatchTool === true) ===
                          option.value
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "hover:bg-primary/10",
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              }
            />
          )}

          {/* Permisos del agente — collapsible inside Agente */}
          <div id="agent-permissions">
            <AgentPermissionsSettings />
          </div>
        </div>
      </div>
    </>
  );
}
