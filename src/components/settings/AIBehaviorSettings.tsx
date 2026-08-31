import React from "react";
import { systemClient } from "@/ipc/types/system";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useSettings } from "@/hooks/useSettings";
import { cn } from "@/lib/utils";

import { useNavigate } from "@tanstack/react-router";
import { StrategistModelSelector } from "./StrategistModelSelector";
import { ExecutorModelSelector } from "./ExecutorModelSelector";
import { VisionModelSelector } from "./VisionModelSelector";
import { AgentPermissionsSettings } from "./AgentPermissionsSettings";
import { FallbackModelSelector } from "./FallbackModelSelector";
import { CompactionModelSelector } from "./CompactionModelSelector";
import { Switch } from "@/components/ui/switch";

import { MAX_CHAT_TURNS_IN_CONTEXT } from "@/constants/settings_constants";
import { EMBEDDING_MODELS } from "@/ipc/shared/embedding_model_constants";
import { ReasoningEffortSelector } from "../ReasoningEffortSelector";
import { TextVerbositySelector } from "../TextVerbositySelector";
import { ChevronRight } from "@/components/ui/icons";
import { useI18n } from "@/lib/i18n";
import { UnifiedSelector } from "@/components/ui/UnifiedSelector";

// ─── Chat turns options ───
const getTurnsOptions = (
  t: (k: string, p?: Record<string, string | number>) => string,
) => [
  { value: "2", label: t("agentSection.turnsEconomical") },
  { value: "default", label: t("agentSection.turnsDefault", { max: MAX_CHAT_TURNS_IN_CONTEXT }) },
  { value: "5", label: t("agentSection.turnsPlus") },
  { value: "10", label: t("agentSection.turnsHigh") },
  { value: "100", label: t("agentSection.turnsMax") },
];

// ─── #165: límites del loop — presets ───
// Iteraciones máximas del agente por tarea (default runtime: 1000).
const iterationOptions = [
  { value: "100", label: "100" },
  { value: "1000", label: "1000" },
  { value: "5000", label: "5000" },
  { value: "20000", label: "20000" },
];
// Tiempo máximo de tarea, en minutos (default runtime: 240 = 4h).
const getWallClockOptions = (
  t: (k: string) => string,
) => [
  { value: "60", label: t("agentSection.wallClock1h") },
  { value: "240", label: t("agentSection.wallClock4h") },
  { value: "720", label: t("agentSection.wallClock12h") },
  { value: "1440", label: t("agentSection.wallClock24h") },
];
// Valor por defecto mostrado en la UI cuando no hay setting persistido.
const DEFAULT_AGENT_ITERATIONS = 1000;
const DEFAULT_AGENT_WALL_CLOCK_MIN = 240;

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

// ─── Collapsible agent models section (REMOVED — card #113) ───────────────
// agentModels[] se eliminó: el runtime (vibes-core) no maneja agentes, toda
// sesión usa el modelo principal del chat. Deuda anotada en card #211.

export function AIBehaviorSettings({
  isHighlighted,
}: {
  isHighlighted?: boolean;
}) {
  const { t } = useI18n();
  const { settings, updateSettings } = useSettings();
  const navigate = useNavigate();
  const isAdminUser = useIsAdmin();

  // ─── Current values ───

  const currentTurnsRaw =
    settings?.maxChatTurnsInContext?.toString() || "default";
  const currentTurnsLabel =
    getTurnsOptions(t).find((o) => o.value === currentTurnsRaw)?.label ||
    t("agentSection.turnsDefault", { max: MAX_CHAT_TURNS_IN_CONTEXT });

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
          <h2 className="typo-section-title">{t("agentSection.title")}</h2>
          <p className="typo-caption mt-1">
            {t("agentSection.desc")}
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

          {/* Idioma — se ha movido a la sección "General" (card #106). */}

          <SettingRow
            label={t("settingsItems.esfuerzo_de_razonamiento")}
            description={t("settingsItems.esfuerzo_de_razonamientoDesc")}
            control={<ReasoningEffortSelector variant="settings" />}
          />

          <SettingRow
            label={t("settingsItems.verbosidad")}
            description={t("settingsItems.verbosidadDesc")}
            control={<TextVerbositySelector variant="settings" />}
          />

          {/* Turnos de contexto — hidden: OpenCode manages context internally */}

          {/* #165: límites duros del loop — configurables, se aplican en caliente
              al runtime (Ajustes > Agente). Antes los defaults del runtime (30
              iter / 5 min) cortaban las tareas largas en silencio. */}
          <SettingRow
            label={t("settingsItems.max_iteraciones_del_agente")}
            description={t("settingsItems.max_iteraciones_del_agenteDesc")}
            control={
              <UnifiedSelector
                value={String(
                  settings?.agentMaxIterations ?? DEFAULT_AGENT_ITERATIONS,
                )}
                onChange={(value) =>
                  updateSettings({ agentMaxIterations: Number(value) })
                }
                options={iterationOptions}
                triggerVariant="pill"
                triggerSize="md"
                popoverWidth="w-[160px]"
                data-testid="agent-max-iterations-selector"
              />
            }
          />

          <SettingRow
            label={t("settingsItems.tiempo_maximo_de_tarea")}
            description={t("settingsItems.tiempo_maximo_de_tareaDesc")}
            control={
              <UnifiedSelector
                value={String(
                  settings?.agentMaxWallClockMinutes ??
                    DEFAULT_AGENT_WALL_CLOCK_MIN,
                )}
                onChange={(value) =>
                  updateSettings({ agentMaxWallClockMinutes: Number(value) })
                }
                options={getWallClockOptions(t)}
                triggerVariant="pill"
                triggerSize="md"
                popoverWidth="w-[160px]"
                data-testid="agent-max-wall-clock-selector"
              />
            }
          />

          {/* Búsqueda Semántica — hidden: embeddings retired (KB no longer used in agent mode) */}

          {/* ── Modelo Estratega ── */}
          <SettingRow
            label={t("settingsItems.modelo_estratega")}
            description={t("settingsItems.modelo_estrategaDesc")}
            control={<StrategistModelSelector />}
          />

          {/* #215: modelo de respaldo (fallbackModel) del loop — se activa al
              agotar retries del modelo principal. Configurable desde Ajustes > Agente. */}
          <SettingRow
            label={t("settingsItems.modelo_de_respaldo")}
            description={t("settingsItems.modelo_de_respaldoDesc")}
            control={<FallbackModelSelector />}
          />

          <SettingRow
            label={t("settingsItems.modelo_de_compactacion")}
            description={t("settingsItems.modelo_de_compactacionDesc")}
            control={<CompactionModelSelector />}
          />

          <SettingRow
            label={t("settingsItems.rondas_conservadas")}
            description={t("settingsItems.rondas_conservadasDesc")}
            control={
              <UnifiedSelector
                value={String(settings?.compactionMaxRoundsKept ?? 6)}
                onChange={(value) => updateSettings({ compactionMaxRoundsKept: Number(value) })}
                options={[
                  { value: "3", label: "3" },
                  { value: "6", label: "6" },
                  { value: "10", label: "10" },
                  { value: "20", label: "20" },
                ]}
                triggerVariant="pill"
                triggerSize="md"
                popoverWidth="w-[160px]"
                data-testid="agent-compaction-rounds-selector"
              />
            }
          />

          {/* ── Modelo Ejecutor ── */}
          <SettingRow
            label={t("settingsItems.modelo_ejecutor")}
            description={t("settingsItems.modelo_ejecutorDesc")}
            control={<ExecutorModelSelector />}
          />

          {/* ── Preprocesador de Visión ── */}
          <SettingRow
            label={t("settingsItems.preprocesador_de_vision")}
            description={t("settingsItems.preprocesador_de_visionDesc")}
            control={
              <div className="relative bg-muted/50 rounded-xl p-1 flex w-fit border border-border">
                {(
                  [
                    { value: false, label: t("common.disabled") },
                    { value: true, label: t("common.enabled") },
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
              label={t("settingsItems.modelo_de_vision")}
              description={t("settingsItems.modelo_de_visionDesc")}
              control={<VisionModelSelector />}
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
