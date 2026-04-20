import React, { useRef } from "react";
import { useSettings } from "@/hooks/useSettings";
import { cn } from "@/lib/utils";

import { useNavigate } from "@tanstack/react-router";
import { StandardModeModelSelector } from "./StandardModeModelSelector";
import { ChevronRight, RefreshCw, Loader2 } from "@/components/ui/icons";
import { AgentToolsSettings } from "./AgentToolsSettings";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ipc } from "@/ipc/types";


import { MAX_CHAT_TURNS_IN_CONTEXT } from "@/constants/settings_constants";
import { EMBEDDING_MODELS } from "@/ipc/shared/embedding_model_constants";
import type { ChatLanguage } from "@/lib/schemas";
import { ReasoningEffortSelector } from "../ReasoningEffortSelector";
import { TextVerbositySelector } from "../TextVerbositySelector";

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
        <h3 className="typo-label">
          {label}
        </h3>
        {description && (
          <p className="typo-caption mt-1 leading-relaxed">
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
  const [showRestartDialog, setShowRestartDialog] = useState(false);
  const [isRestarting, setIsRestarting] = useState(false);
  // Track the LSP value that was active when this component mounted
  // (i.e., the value the running server was started with)
  const mountedLspValue = useRef(settings?.enableOpenCodeLsp !== false);
  const currentLspValue = settings?.enableOpenCodeLsp !== false;
  const lspChanged = currentLspValue !== mountedLspValue.current;

  // ─── Current values ───

  const currentTurnsRaw = settings?.maxChatTurnsInContext?.toString() || "default";
  const currentTurnsLabel = turnsOptions.find(o => o.value === currentTurnsRaw)?.label || `Por defecto (${MAX_CHAT_TURNS_IN_CONTEXT})`;

  const currentLang = settings?.chatLanguage || "es";

  const selectedEmbeddingModel = settings?.embeddingsModel ?? "openai/text-embedding-3-small";
  const currentEmbeddingLabel = EMBEDDING_MODELS.find(m => m.id === selectedEmbeddingModel)?.name || "text-embedding-3-small";

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
        <h2 className="typo-section-title">
          Agente
        </h2>
        <p className="typo-caption mt-1">
          Personaliza cómo el agente procesa la información y se comunica contigo
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
                  onClick={() => updateSettings({ chatLanguage: option.value })}
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

        {/* Vista del chat: Completo / Zen */}
        <SettingRow
          label="Vista del chat"
          description={
            (settings?.chatRenderMode ?? "full") === "zen"
              ? "Respuestas limpias mostrando solo lo esencial. Más ligero y rápido."
              : "Muestra todos los pasos intermedios del agente con detalles expandibles."
          }
          control={
            <div className="relative bg-muted/50 rounded-xl p-1 flex w-fit border border-border">
              {([
                { value: "full" as const, label: "Completo" },
                { value: "zen" as const, label: "Zen" },
              ]).map((option) => (
                <button
                  key={option.value}
                  onClick={() => updateSettings({ chatRenderMode: option.value })}
                  className={cn(
                      "px-4 py-1.5 typo-select rounded-lg transition-colors duration-200 cursor-pointer",
                    (settings?.chatRenderMode ?? "full") === option.value
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

        {/* Modelo para tareas internas */}
        <SettingRow
          label="Modelo para tareas internas"
          description="Títulos, resúmenes y mantenimiento"
          control={<StandardModeModelSelector />}
        />



        {/* Diagnósticos LSP por archivo */}
        <SettingRow
          label="Diagnósticos LSP por archivo"
          description={
            currentLspValue
              ? "El agente recibe errores de TypeScript tras cada escritura y los autocorrige inline."
              : "Sin LSP: el agente ejecuta tsc al final. Menos interrupciones entre escrituras."
          }
          control={
            <div className="flex items-center gap-3">
              {/* Restart button — only visible when value differs from server's active config */}
              {lspChanged && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowRestartDialog(true)}
                  className="flex items-center gap-1.5 typo-caption"
                >
                  <RefreshCw size={13} />
                  Reiniciar OpenCode
                </Button>
              )}
              <div className="relative bg-muted/50 rounded-xl p-1 flex w-fit border border-border">
                {([{ value: true, label: "Activo" }, { value: false, label: "Desactivado" }] as const).map((option) => (
                  <button
                    key={String(option.value)}
                    onClick={() => updateSettings({ enableOpenCodeLsp: option.value })}
                    className={cn(
                        "px-4 py-1.5 typo-select rounded-lg transition-colors duration-200 cursor-pointer",
                      currentLspValue === option.value
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "hover:bg-primary/10",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          }
        />

      </div>
    </div>

    {/* Restart OpenCode confirmation dialog */}
    <Dialog open={showRestartDialog} onOpenChange={setShowRestartDialog}>
      <DialogContent className="max-w-sm p-4">
        <DialogHeader className="pb-2">
          <DialogTitle>¿Reiniciar servidor OpenCode?</DialogTitle>
          <DialogDescription>
            Esto detendrá cualquier tarea del agente que esté en ejecución ahora mismo.
            La nueva configuración de LSP se aplicará en el siguiente chat.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex justify-end gap-2 pt-2">
          <Button
            variant="outline"
            onClick={() => setShowRestartDialog(false)}
            disabled={isRestarting}
            size="sm"
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={isRestarting}
            size="sm"
            className="flex items-center gap-1"
            onClick={async () => {
              setIsRestarting(true);
              try {
                await ipc.system.restartOpenCodeServer();
                // Update the "mounted" reference so the badge disappears
                mountedLspValue.current = currentLspValue;
                setShowRestartDialog(false);
              } finally {
                setIsRestarting(false);
              }
            }}
          >
            {isRestarting ? (
              <><Loader2 className="h-3 w-3 animate-spin" /> Reiniciando...</>
            ) : (
              <><RefreshCw size={13} /> Reiniciar</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
