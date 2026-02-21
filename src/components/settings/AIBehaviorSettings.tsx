import React from "react";
import { useSettings } from "@/hooks/useSettings";
import { cn } from "@/lib/utils";

import { useNavigate } from "@tanstack/react-router";
import { StandardModeModelSelector } from "./StandardModeModelSelector";
import { ProModeModelSelector } from "./ProModeModelSelector";
import { ChevronRight } from "lucide-react";
import { AgentToolsSettings } from "./AgentToolsSettings";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MAX_CHAT_TURNS_IN_CONTEXT } from "@/constants/settings_constants";
import { EMBEDDING_MODELS } from "@/ipc/shared/embedding_model_constants";
import type { ChatLanguage } from "@/lib/schemas";
import { useState } from "react";


// ─── Reasoning effort options ───
const reasoningOptions = [
  { value: "none", label: "Ninguno" },
  { value: "minimal", label: "Mínimo" },
  { value: "low", label: "Bajo" },
  { value: "medium", label: "Medio" },
  { value: "high", label: "Alto" },
  { value: "xhigh", label: "Muy alto" },
];

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
  description?: string;
  control: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex justify-between gap-8 p-4 rounded-xl hover:bg-muted/50 transition-colors items-center",
      )}
    >
      <div className="flex-1 min-w-0">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">
          {label}
        </h3>
        {description && (
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            {description}
          </p>
        )}
      </div>
      <div className="shrink-0" onClick={(e) => e.stopPropagation()}>{control}</div>
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
  const [modelsExpanded, setModelsExpanded] = useState(false);
  const [permissionsExpanded, setPermissionsExpanded] = useState(false);

  // ─── Current values ───
  const currentEffort = settings?.reasoningEffort || "medium";
  const currentEffortLabel = reasoningOptions.find(o => o.value === currentEffort)?.label || "Medio";

  const currentTurnsRaw = settings?.maxChatTurnsInContext?.toString() || "default";
  const currentTurnsLabel = turnsOptions.find(o => o.value === currentTurnsRaw)?.label || `Por defecto (${MAX_CHAT_TURNS_IN_CONTEXT})`;

  const currentLang = settings?.chatLanguage || "es";

  const selectedEmbeddingModel = settings?.embeddingsModel ?? "openai/text-embedding-3-small";
  const currentEmbeddingLabel = EMBEDDING_MODELS.find(m => m.id === selectedEmbeddingModel)?.name || "text-embedding-3-small";

  return (
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
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Agente
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Personaliza cómo el agente procesa la información y se comunica contigo
        </p>
      </div>

      <div className="space-y-4">
        {/* Prompts — clickable row */}
        <div
          className="flex items-center justify-between cursor-pointer group p-4 rounded-xl border border-border hover:bg-muted/50 transition-colors gap-4"
          onClick={() => navigate({ to: "/settings/prompts" })}
        >
          <div className="flex-1">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Prompts personalizados</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Instrucciones adicionales que el agente seguirá en cada conversación
            </p>
          </div>
          <ChevronRight
            className="size-5 text-muted-foreground/50 group-hover:text-foreground transition-transform duration-200 shrink-0"
          />
        </div>

        {/* Idioma — two pills */}
        <SettingRow
          label="Idioma"
          description="Idioma en que el agente se comunicará contigo"
          control={
            <div className="relative bg-muted/50 rounded-xl p-1 flex w-fit border border-border">
              {languageOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => updateSettings({ chatLanguage: option.value })}
                  className={cn(
                    "px-4 py-1.5 text-sm font-bold rounded-lg transition-colors duration-200 cursor-pointer",
                    currentLang === option.value
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-primary hover:bg-primary/10",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          }
        />

        {/* Esfuerzo — pill that opens selector */}
        <SettingRow
          label="Esfuerzo de razonamiento"
          description="Controla cuánto análisis previo realiza el agente"
          control={
            <Select
              value={currentEffort}
              onValueChange={(value) =>
                updateSettings({
                  reasoningEffort: value as "none" | "minimal" | "low" | "medium" | "high" | "xhigh",
                })
              }
            >
              <SelectTrigger className="border-0 bg-primary dark:bg-primary text-primary-foreground dark:text-primary-foreground shadow-sm rounded-lg px-4 py-1.5 h-auto text-sm font-bold hover:brightness-110 dark:hover:bg-primary transition-all duration-200 w-auto gap-2 cursor-pointer [&_svg]:!text-current [&_svg]:!opacity-100">
                <SelectValue>{currentEffortLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {reasoningOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />

        {/* Turnos — pill that opens selector */}
        <SettingRow
          label="Turnos de contexto"
          description="Cuántos turnos previos del chat incluir como contexto"
          control={
            <Select
              value={currentTurnsRaw}
              onValueChange={(value) => {
                if (value === "default") {
                  updateSettings({ maxChatTurnsInContext: undefined });
                } else {
                  updateSettings({ maxChatTurnsInContext: parseInt(value, 10) });
                }
              }}
            >
              <SelectTrigger className="border-0 bg-primary dark:bg-primary text-primary-foreground dark:text-primary-foreground shadow-sm rounded-lg px-4 py-1.5 h-auto text-sm font-bold hover:brightness-110 dark:hover:bg-primary transition-all duration-200 w-auto gap-2 cursor-pointer [&_svg]:!text-current [&_svg]:!opacity-100">
                <SelectValue>{currentTurnsLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {turnsOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />

        {/* Búsqueda Semántica — pill showing model, click to select */}
        <SettingRow
          label="Búsqueda semántica"
          description="Modelo de embeddings para indexar y buscar código por significado"
          control={
            <Select
              value={selectedEmbeddingModel}
              onValueChange={(value) => updateSettings({ embeddingsModel: value })}
            >
              <SelectTrigger className="border-0 bg-primary dark:bg-primary text-primary-foreground dark:text-primary-foreground shadow-sm rounded-lg px-4 py-1.5 h-auto text-sm font-bold hover:brightness-110 dark:hover:bg-primary transition-all duration-200 w-auto gap-2 cursor-pointer [&_svg]:!text-current [&_svg]:!opacity-100">
                <SelectValue>{currentEmbeddingLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {EMBEDDING_MODELS.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    <div className="flex flex-col">
                      <span>{model.name}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {model.provider} · {model.dims} dims
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />

        {/* Model Categories Section — collapsible */}
        <div className="space-y-4">
          <div
            className="flex items-center justify-between cursor-pointer group p-4 rounded-xl border border-border hover:bg-muted/50 transition-colors gap-4"
            onClick={() => setModelsExpanded(e => !e)}
          >
            <div className="flex-1">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">Modelos por tarea</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Un modelo para cada modo: Estándar y Pro
              </p>
            </div>
            <ChevronRight
              className={cn(
                "size-5 text-muted-foreground/50 group-hover:text-foreground transition-transform duration-200 shrink-0",
                modelsExpanded && "rotate-90",
              )}
            />
          </div>
          {modelsExpanded && (
            <div className="space-y-4 pl-8">
              <SettingRow
                label="Modo Estándar"
                description="Títulos, resúmenes y análisis"
                control={<StandardModeModelSelector />}
              />
              <SettingRow
                label="Modo Pro"
                description="Debates, conocimientos y dossier"
                control={<ProModeModelSelector />}
              />
            </div>
          )}
        </div>

        {/* Permissions Section — collapsible */}
        <div className="space-y-4">
          <div
            className="flex items-center justify-between cursor-pointer group p-4 rounded-xl border border-border hover:bg-muted/50 transition-colors gap-4"
            onClick={() => setPermissionsExpanded(e => !e)}
          >
            <div className="flex-1">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">Permisos del agente</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Elige si cada herramienta se ejecuta siempre, te pregunta antes, o se bloquea
              </p>
            </div>
            <ChevronRight
              className={cn(
                "size-5 text-muted-foreground/50 group-hover:text-foreground transition-transform duration-200 shrink-0",
                permissionsExpanded && "rotate-90",
              )}
            />
          </div>
          {permissionsExpanded && (
            <div className="pl-8">
              <AgentToolsSettings />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
