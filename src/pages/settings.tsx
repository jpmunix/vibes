import React, { useEffect, useState, useMemo } from "react";
import { useTheme } from "../contexts/ThemeContext";
import {
  PrimaryColorPicker,
  DEFAULT_LIGHT_COLOR,
  DEFAULT_DARK_COLOR,
} from "@/components/PrimaryColorPicker";
import { AIBehaviorSettings } from "@/components/settings/AIBehaviorSettings";
import { AutomationSettings } from "@/components/settings/AutomationSettings";
import { ModelsAndConnectivity } from "@/components/settings/ModelsAndConnectivity";
import { WebSearchSettings } from "@/components/settings/WebSearchSettings";
import ConfirmationDialog from "@/components/ConfirmationDialog";
import { ipc } from "@/ipc/types";
import { showSuccess, showError } from "@/lib/toast";
import { AutoApproveSwitch } from "@/components/AutoApproveSwitch";
import { MaxChatTurnsSelector } from "@/components/MaxChatTurnsSelector";
import { ThinkingBudgetSelector } from "@/components/ThinkingBudgetSelector";
import { useSettings } from "@/hooks/useSettings";
import { useAppVersion } from "@/hooks/useAppVersion";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  TrendingUp,
  Zap,
  Clock,
  Sparkles,
  Search,
  X,
  Database,
  Download,
  Upload,
} from "lucide-react";
import { useRouter, useNavigate } from "@tanstack/react-router";
import { GitHubIntegration } from "@/components/GitHubIntegration";
import { VercelIntegration } from "@/components/VercelIntegration";
import { SupabaseIntegration } from "@/components/SupabaseIntegration";
import { FirebaseIntegration } from "@/components/FirebaseIntegration";

import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { AutoExpandPreviewSwitch } from "@/components/AutoExpandPreviewSwitch";
import { NeonIntegration } from "@/components/NeonIntegration";
import { AgentToolsSettings } from "@/components/settings/AgentToolsSettings";
import { ZoomSelector } from "@/components/ZoomSelector";
import { DefaultChatModeSelector } from "@/components/DefaultChatModeSelector";
import { useSetAtom } from "jotai";
import { activeSettingsSectionAtom } from "@/atoms/viewAtoms";
import { ChatLanguageSelector } from "@/components/ChatLanguageSelector";
import { SerperApiKeySettings } from "@/components/SerperApiKeySettings";
import { Input } from "@/components/ui/input";
import { ChatCompletionNotificationSwitch } from "@/components/ChatCompletionNotificationSwitch";
import { tokenStatsClient } from "@/ipc/types";
import type { TokenStatEntry } from "@/ipc/types/token_stats";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmbeddingsPlayground } from "@/components/EmbeddingsPlayground";
import { AutoFixModelSelector } from "@/components/AutoFixModelSelector";
import Fuse from "fuse.js";
import { ReleaseNotesDialog } from "@/components/ReleaseNotesDialog";

import { cn } from "@/lib/utils";

// Settings search index
interface SearchSettingItem {
  id: string;
  label: string;
  description: string;
  keywords: string[];
  section: string;
  sectionId: string;
}

const SETTINGS_SEARCH_INDEX: SearchSettingItem[] = [
  // General Settings
  {
    id: "theme",
    label: "Tema",
    description: "Cambiar entre modo claro, oscuro o sistema",
    keywords: [
      "tema",
      "dark",
      "light",
      "oscuro",
      "claro",
      "apariencia",
      "color",
    ],
    section: "Ajustes generales",
    sectionId: "general-settings",
  },
  {
    id: "zoom",
    label: "Zoom",
    description: "Ajustar el nivel de zoom de la aplicación",
    keywords: ["zoom", "tamaño", "escala", "agrandar", "achicar"],
    section: "Ajustes generales",
    sectionId: "general-settings",
  },
  {
    id: "primary-color",
    label: "Color primario",
    description: "Elige el color de acento principal para modo claro y oscuro",
    keywords: ["color", "primario", "acento", "tema", "personalizar", "primary"],
    section: "Ajustes generales",
    sectionId: "general-settings",
  },
  // Workflow Settings
  {
    id: "chat-mode",
    label: "Modo de chat predeterminado",
    description: "Seleccionar el modo de chat que se usa por defecto",
    keywords: ["modo", "chat", "predeterminado", "default"],
    section: "Configuración del flujo de trabajo",
    sectionId: "workflow-settings",
  },
  {
    id: "auto-approve",
    label: "Auto-aprobar cambios",
    description: "Aprobar automáticamente los cambios de código y ejecutarlos",
    keywords: ["aprobar", "automatico", "cambios", "codigo", "ejecutar"],
    section: "Configuración del flujo de trabajo",
    sectionId: "workflow-settings",
  },
  {
    id: "background-autofix",
    label: "Auto-fix de problemas en segundo plano",
    description:
      "Arreglar automáticamente problemas detectados mientras trabajas",
    keywords: [
      "autofix",
      "auto",
      "fix",
      "arreglar",
      "problemas",
      "segundo plano",
      "background",
    ],
    section: "Automatización",
    sectionId: "automation-settings",
  },
  {
    id: "autofix-model",
    label: "Modelo para auto-fix",
    description: "Seleccionar qué modelo usar para auto-fix en segundo plano",
    keywords: ["modelo", "autofix", "ia", "ai"],
    section: "Automatización",
    sectionId: "automation-settings",
  },
  {
    id: "autofix-duration",
    label: "Tiempo máximo auto-fix",
    description: "Tiempo máximo en milisegundos para auto-fix",
    keywords: ["tiempo", "duracion", "limite", "ms", "milisegundos", "autofix"],
    section: "Automatización",
    sectionId: "automation-settings",
  },
  {
    id: "autofix-attempts",
    label: "Intentos máximos auto-fix",
    description: "Número máximo de intentos para auto-fix",
    keywords: ["intentos", "reintentos", "attempts", "autofix"],
    section: "Automatización",
    sectionId: "automation-settings",
  },
  {
    id: "autofix-issues",
    label: "Número máximo de issues para auto-fix",
    description: "Cantidad máxima de problemas a arreglar automáticamente",
    keywords: ["issues", "problemas", "cantidad", "maximo", "autofix"],
    section: "Automatización",
    sectionId: "automation-settings",
  },
  {
    id: "auto-expand-preview",
    label: "Expandir vista previa automáticamente",
    description: "Expandir el panel de vista previa cuando se hacen cambios",
    keywords: ["expandir", "preview", "vista previa", "panel", "automatico"],
    section: "Configuración del flujo de trabajo",
    sectionId: "workflow-settings",
  },
  {
    id: "chat-completion-notification",
    label: "Notificación de respuesta completada",
    description: "Mostrar notificación cuando termine una respuesta del chat",
    keywords: ["notificacion", "respuesta", "completada", "chat", "alerta"],
    section: "Configuración del flujo de trabajo",
    sectionId: "workflow-settings",
  },
  // AI Settings
  {
    id: "thinking-budget",
    label: "Presupuesto de pensamiento",
    description: "Configurar el presupuesto de tokens para el modo thinking",
    keywords: ["thinking", "pensamiento", "presupuesto", "tokens", "budget"],
    section: "Configuración Asistente",
    sectionId: "ai-behavior",
  },
  {
    id: "turbo-edits",
    label: "Turbo Edits (v2)",
    description: "Modo de búsqueda y reemplazo automático para ediciones",
    keywords: [
      "turbo",
      "edits",
      "ediciones",
      "rapido",
      "busqueda",
      "reemplazo",
    ],
    section: "Automatización",
    sectionId: "automation-settings",
  },
  {
    id: "max-chat-turns",
    label: "Turnos máximos de chat",
    description: "Número máximo de intercambios en una conversación",
    keywords: ["turnos", "chat", "maximo", "conversacion", "limite"],
    section: "Configuración Asistente",
    sectionId: "ai-behavior",
  },
  {
    id: "chat-language",
    label: "Idioma del chat",
    description: "Seleccionar el idioma para las respuestas del asistente",
    keywords: ["idioma", "language", "lenguaje", "español", "ingles"],
    section: "Configuración Asistente",
    sectionId: "ai-behavior",
  },
  {
    id: "serper-api",
    label: "Clave API de Serper",
    description: "Configurar la clave API para búsquedas web con Serper",
    keywords: ["serper", "api", "key", "clave", "busqueda", "web", "search"],
    section: "Búsqueda Web e Información",
    sectionId: "serper-settings",
  },
  {
    id: "smart-context",
    label: "Smart Context local",
    description: "Ranking local de archivos sin backend",
    keywords: [
      "smart",
      "context",
      "local",
      "ranking",
      "archivos",
      "relevantes",
    ],
    section: "Configuración Asistente",
    sectionId: "ai-behavior",
  },
  {
    id: "token-stats",
    label: "Guardar métricas de tokens",
    description: "Guardar uso de tokens para logs y gráficas",
    keywords: ["tokens", "metricas", "estadisticas", "stats", "uso"],
    section: "Configuración Asistente",
    sectionId: "ai-behavior",
  },
  {
    id: "verbose-logs",
    label: "Logs verbosos de chat",
    description: "Registrar información detallada del chat para debugging",
    keywords: ["logs", "verboso", "debug", "debugging", "detallado", "chat"],
    section: "Configuración Asistente",
    sectionId: "ai-behavior",
  },
  // Stats
  {
    id: "stats",
    label: "Estadísticas globales",
    description: "Ver uso de tokens y estadísticas del sistema",
    keywords: [
      "estadisticas",
      "stats",
      "tokens",
      "uso",
      "graficas",
      "metricas",
    ],
    section: "Estadísticas Globales",
    sectionId: "stats-settings",
  },
  // Provider Settings
  {
    id: "provider-settings",
    label: "Configuración de OpenRouter",
    description: "Configurar clave API de OpenRouter y modelos",
    keywords: ["openrouter", "api", "key", "clave", "ia"],
    section: "Modelos e IA",
    sectionId: "openrouter-settings",
  },
  // Integrations
  {
    id: "github",
    label: "GitHub",
    description: "Integración con GitHub",
    keywords: ["github", "git", "repositorio", "repo", "integracion"],
    section: "Integraciones",
    sectionId: "integrations",
  },
  {
    id: "vercel",
    label: "Vercel",
    description: "Integración con Vercel para deploy",
    keywords: ["vercel", "deploy", "deployment", "despliegue", "integracion"],
    section: "Integraciones",
    sectionId: "integrations",
  },
  {
    id: "supabase",
    label: "Supabase",
    description: "Integración con Supabase",
    keywords: ["supabase", "database", "db", "base de datos", "integracion"],
    section: "Integraciones",
    sectionId: "integrations",
  },
  {
    id: "neon",
    label: "Neon",
    description: "Integración con Neon Database",
    keywords: [
      "neon",
      "database",
      "db",
      "postgres",
      "postgresql",
      "integracion",
    ],
    section: "Integraciones",
    sectionId: "integrations",
  },
  {
    id: "firebase",
    label: "Firebase",
    description: "Integración con Firebase (Google)",
    keywords: ["firebase", "google", "database", "db", "firestore", "integracion"],
    section: "Integraciones",
    sectionId: "integrations",
  },
  // Agent Permissions
  {
    id: "agent-permissions",
    label: "Permisos del Agente",
    description: "Configurar qué herramientas puede usar el agente",
    keywords: [
      "permisos",
      "agente",
      "agent",
      "herramientas",
      "tools",
      "permissions",
    ],
    section: "Permisos del Agente",
    sectionId: "agent-permissions",
  },
  // Experiments
  {
    id: "native-git",
    label: "Git nativo",
    description: "Usar implementación de Git nativa sin instalación externa",
    keywords: ["git", "nativo", "native", "experimento", "experiment"],
    section: "Experimentos",
    sectionId: "experiments",
  },
  {
    id: "embeddings-playground",
    label: "Playground de Embeddings",
    description: "Probar el modelo MiniLM para búsqueda semántica",
    keywords: [
      "embeddings",
      "playground",
      "minilm",
      "busqueda",
      "semantica",
      "semantic",
    ],
    section: "Experimentos",
    sectionId: "experiments",
  },
  // Danger Zone
  {
    id: "reset-all",
    label: "Resetear todo",
    description: "Eliminar todas las aplicaciones, chats y configuraciones",
    keywords: [
      "reset",
      "resetear",
      "eliminar",
      "borrar",
      "todo",
      "danger",
      "peligro",
    ],
    section: "Zona peligrosa",
    sectionId: "danger-zone",
  },
  {
    id: "prompts",
    label: "Prompts",
    description: "Configurar instrucciones del sistema y plantillas de IA",
    keywords: [
      "prompts",
      "sistema",
      "instrucciones",
      "plantillas",
      "ia",
      "custom",
    ],
    section: "Configuración Asistente",
    sectionId: "ai-behavior",
  },
];

function SettingItem({
  label,
  description,
  control,
  onClick,
}: {
  label: string;
  description: string;
  control: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "flex items-start justify-between gap-8 p-4 rounded-xl hover:bg-muted/50 transition-colors border border-transparent hover:border-border",
        onClick ? "cursor-pointer" : "",
      )}
    >
      <div className="flex-1">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">
          {label}
        </h3>
        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
          {description}
        </p>
      </div>
      <div onClick={(e) => e.stopPropagation()}>{control}</div>
    </div>
  );
}

export default function SettingsPage() {
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isEmbeddingsPlaygroundOpen, setIsEmbeddingsPlaygroundOpen] =
    useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedSection, setHighlightedSection] = useState<string | null>(
    null,
  );
  const [releaseNotesOpen, setReleaseNotesOpen] = useState(false);
  const appVersion = useAppVersion();
  const { settings, updateSettings } = useSettings();
  const router = useRouter();
  const setActiveSettingsSection = useSetAtom(activeSettingsSectionAtom);

  useEffect(() => {
    setActiveSettingsSection("general-settings");
  }, [setActiveSettingsSection]);

  // Fuse.js search configuration
  const fuse = useMemo(
    () =>
      new Fuse(SETTINGS_SEARCH_INDEX, {
        keys: [
          { name: "label", weight: 2 },
          { name: "description", weight: 1 },
          { name: "keywords", weight: 1.5 },
          { name: "section", weight: 0.5 },
        ],
        threshold: 0.4,
        includeScore: true,
      }),
    [],
  );

  // Search results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return fuse.search(searchQuery).map((result) => result.item);
  }, [searchQuery, fuse]);

  // Handle search result click
  const handleSearchResultClick = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
      setHighlightedSection(sectionId);
      setTimeout(() => setHighlightedSection(null), 2000);
    }
  };

  // Clear search
  const clearSearch = () => {
    setSearchQuery("");
  };

  const handleResetEverything = async () => {
    setIsResetting(true);
    try {
      await ipc.system.resetAll();
      showSuccess(
        "Se ha reseteado todo correctamente. Reinicia la aplicación.",
      );
    } catch (error) {
      console.error("Error resetting:", error);
      showError(
        error instanceof Error ? error.message : "Ocurrió un error desconocido",
      );
    } finally {
      setIsResetting(false);
      setIsResetDialogOpen(false);
    }
  };

  const handleExportSettings = () => {
    try {
      if (!settings) {
        showError("No hay configuración para exportar");
        return;
      }

      const dataToExport = {
        settings: settings,
        exportedAt: new Date().toISOString(),
        version: "1.0",
      };

      const blob = new Blob([JSON.stringify(dataToExport, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `vibes-settings-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showSuccess("Configuración exportada correctamente");
    } catch (err) {
      console.error("Export error:", err);
      showError("Error al exportar la configuración");
    }
  };

  const handleImportSettings = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";

    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text);

        // Validate the imported data
        if (!data.settings || typeof data.settings !== "object") {
          showError("Formato de archivo inválido");
          return;
        }

        // Update all settings
        await updateSettings(data.settings);

        showSuccess("Configuración importada correctamente. Recarga la página para ver todos los cambios.");
      } catch (err) {
        console.error("Import error:", err);
        showError("Error al importar la configuración. Verifica el formato del archivo.");
      }
    };

    input.click();
  };

  return (
    <div
      id="settings-scroll-container"
      className="flex flex-col h-full bg-muted/30 text-foreground overflow-y-auto"
    >
      <div className="w-full mx-auto px-8 pt-12 pb-12">
        <div className="flex justify-between items-center mb-12 gap-4">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
            Ajustes
          </h1>

          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Buscar ajustes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-10 bg-card/50 border-none shadow-sm focus-visible:ring-1 focus-visible:ring-primary/20"
            />
            {searchQuery && (
              <button
                onClick={clearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Export/Import Buttons */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handleExportSettings}
            >
              <Download className="w-4 h-4" />
              Exportar
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handleImportSettings}
            >
              <Upload className="w-4 h-4" />
              Importar
            </Button>
          </div>
        </div>

        {/* Search Results Dropdown */}
        {searchQuery && (
          <div className="mb-12 bg-card rounded-2xl shadow-xl border border-border overflow-hidden">
            {searchResults.length > 0 ? (
              <div className="p-2">
                {searchResults.map((result) => (
                  <button
                    key={result.id}
                    onClick={() => {
                      handleSearchResultClick(result.sectionId);
                      clearSearch();
                    }}
                    className="w-full text-left p-4 rounded-xl hover:bg-muted transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="text-base font-medium text-gray-900 dark:text-white">
                          {result.label}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          {result.description}
                        </div>
                      </div>
                      <div className="text-xs font-semibold uppercase tracking-wider text-primary/60 whitespace-nowrap">
                        {result.section}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-12 text-center">
                <Search className="h-16 w-16 text-muted-foreground/20 mx-auto mb-4" />
                <p className="text-lg font-medium text-gray-900 dark:text-white">
                  No se encontraron ajustes
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Intenta con otros términos de búsqueda
                </p>
              </div>
            )}
          </div>
        )}

        <div className="space-y-12 pb-24">
          <GeneralSettings
            appVersion={appVersion}
            isHighlighted={highlightedSection === "general-settings"}
            onShowReleaseNotes={() => setReleaseNotesOpen(true)}
          />

          <ReleaseNotesDialog
            isOpen={releaseNotesOpen}
            onOpenChange={setReleaseNotesOpen}
          />

          <ModelsAndConnectivity
            isHighlighted={highlightedSection === "models-connectivity"}
          />

          <WebSearchSettings
            isHighlighted={highlightedSection === "serper-settings"}
          />

          <AIBehaviorSettings
            isHighlighted={highlightedSection === "ai-behavior"}
          />

          <AutomationSettings
            isHighlighted={highlightedSection === "automation-settings"}
          />

          <WorkflowSettings
            isHighlighted={highlightedSection === "workflow-settings"}
          />

          {/* Integrations Section */}
          <div
            id="integrations"
            className={`bg-card rounded-2xl shadow-sm p-8 border border-border transition-[border-color,box-shadow] duration-300 ${highlightedSection === "integrations"
              ? "ring-2 ring-primary ring-offset-4 ring-offset-muted/30"
              : ""
              }`}
          >
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Integraciones
            </h2>
            <p className="text-sm text-muted-foreground mb-8">
              Conecta servicios externos para automatizar despliegues y bases de
              datos.
            </p>
            <div className="space-y-6">
              <GitHubIntegration />
              <VercelIntegration />
              <SupabaseIntegration />
              <NeonIntegration />
              <FirebaseIntegration />
            </div>
          </div>

          {/* Agent v2 Permissions */}
          <div
            id="agent-permissions"
            className={`bg-card rounded-2xl shadow-sm p-8 border border-border transition-[border-color,box-shadow] duration-300 ${highlightedSection === "agent-permissions"
              ? "ring-2 ring-primary ring-offset-4 ring-offset-muted/30"
              : ""
              }`}
          >
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Seguridad y Permisos del Agente
            </h2>
            <p className="text-sm text-muted-foreground mb-8">
              Controla los permisos de lectura y escritura para las herramientas
              que usa el asistente.
            </p>
            <AgentToolsSettings />
          </div>

          <StatsSettings
            isHighlighted={highlightedSection === "stats-settings"}
          />

          {/* Experiments Section */}
          <div
            id="experiments"
            className={`bg-card rounded-2xl shadow-sm p-8 border border-border transition-[border-color,box-shadow] duration-300 ${highlightedSection === "experiments"
              ? "ring-2 ring-primary ring-offset-4 ring-offset-muted/30"
              : ""
              }`}
          >
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Laboratorio y Experimentos
            </h2>
            <p className="text-sm text-muted-foreground mb-8">
              Funcionalidades en fase de prueba que pueden cambiar o
              desaparecer.
            </p>
            <div className="space-y-8">
              <SettingItem
                label="Playground de Embeddings"
                description="Prueba el modelo MiniLM para búsqueda semántica local de archivos en tu codebase"
                control={
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEmbeddingsPlaygroundOpen(true)}
                    className="h-10 px-4 font-bold border-border hover:bg-muted rounded-xl"
                  >
                    Abrir Playground
                  </Button>
                }
              />
            </div>
          </div>

          {/* Danger Zone */}
          <div
            id="danger-zone"
            className={`bg-card rounded-2xl shadow-sm p-8 border border-red-200 dark:border-red-900/50 transition-[border-color,box-shadow] duration-300 ${highlightedSection === "danger-zone"
              ? "ring-2 ring-red-500 ring-offset-4 ring-offset-muted/30"
              : ""
              }`}
          >
            <h2 className="text-2xl font-bold text-red-600 dark:text-red-400 mb-8">
              Zona peligrosa
            </h2>

            <div className="space-y-6">
              <div className="flex items-start justify-between flex-col sm:flex-row sm:items-center gap-6 p-6 rounded-2xl bg-red-50/50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Revertir todo
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Esto eliminará todas tus aplicaciones, chats y
                    configuraciones. Esta acción no se puede deshacer.
                  </p>
                </div>
                <Button
                  onClick={() => setIsResetDialogOpen(true)}
                  disabled={isResetting}
                  variant="outline"
                  className="rounded-xl h-11 px-8 text-sm font-bold border-destructive/20 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors active:scale-95 whitespace-nowrap"
                >
                  {isResetting ? "Reseteando..." : "Resetear todo"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ConfirmationDialog
        isOpen={isResetDialogOpen}
        title="Resetear todo"
        message="¿Estás seguro de que quieres resetear todo? Esto eliminará todas tus aplicaciones, chats y configuraciones. Esta acción no se puede deshacer."
        confirmText="Resetear todo"
        cancelText="Cancelar"
        onConfirm={handleResetEverything}
        onCancel={() => setIsResetDialogOpen(false)}
      />

      {/* Embeddings Playground Dialog */}
      <EmbeddingsPlayground
        open={isEmbeddingsPlaygroundOpen}
        onOpenChange={setIsEmbeddingsPlaygroundOpen}
      />
    </div>
  );
}

export function GeneralSettings({
  appVersion,
  isHighlighted,
  onShowReleaseNotes,
}: {
  appVersion: string | null;
  isHighlighted?: boolean;
  onShowReleaseNotes?: () => void;
}) {
  const { theme, setTheme, intensity, setIntensity, applyPrimaryColors } = useTheme();
  const { settings, updateSettings } = useSettings();

  useEffect(() => {
    if (
      settings?.themeIntensity !== undefined &&
      settings.themeIntensity !== intensity
    ) {
      setIntensity(settings.themeIntensity);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.themeIntensity, setIntensity]);

  // Apply primary colors from settings on load
  useEffect(() => {
    if (settings) {
      applyPrimaryColors(settings.primaryColorLight, settings.primaryColorDark);
    }
  }, [settings?.primaryColorLight, settings?.primaryColorDark, applyPrimaryColors]);

  return (
    <div
      id="general-settings"
      className={cn(
        "bg-card rounded-2xl shadow-sm p-8 border border-border transition-[border-color,box-shadow] duration-300",
        isHighlighted
          ? "ring-2 ring-primary ring-offset-4 ring-offset-muted/30"
          : "",
      )}
    >
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-8">
        Ajustes generales
      </h2>

      <div className="space-y-12">
        <div className="space-y-4">
          <Label className="text-lg font-semibold text-gray-900 dark:text-white">
            Tema
          </Label>
          <div className="relative bg-muted/50 rounded-2xl p-1 flex w-fit border border-border">
            {(["system", "light", "dark"] as const).map((option) => (
              <button
                key={option}
                onClick={() => setTheme(option)}
                className={cn(
                  "px-6 py-2.5 text-sm font-bold rounded-xl transition-colors duration-200",
                  theme === option
                    ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm ring-1 ring-black/5"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/50 dark:hover:bg-gray-700/50",
                )}
              >
                {option === "system"
                  ? "Sistema"
                  : option === "light"
                    ? "Claro"
                    : "Oscuro"}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-6 pt-6 border-t border-border">
          <SettingItem
            label="Novedades"
            description={`Estás en la versión v${appVersion}. Mira qué hay de nuevo en esta actualización.`}
            control={
              <Button
                variant="outline"
                size="sm"
                onClick={onShowReleaseNotes}
                className="h-10 px-4 font-bold border-border hover:bg-muted rounded-xl"
              >
                Ver novedades
              </Button>
            }
          />
        </div>

        <div className="space-y-6 pt-6 border-t border-border">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <Label className="text-lg font-semibold text-gray-900 dark:text-white">
                Intensidad del tema
              </Label>
              <p className="text-base text-muted-foreground mt-1">
                Ajusta la luminosidad de los colores base para cada tema
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setIntensity(0.58);
                updateSettings({ themeIntensity: 0.58 });
              }}
              className="h-9 px-4 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-xl border border-transparent hover:border-primary/20"
            >
              Restablecer
            </Button>
          </div>
          <div className="flex items-center gap-6 p-6 rounded-2xl bg-muted/30 border border-border group">
            <span className="text-[10px] uppercase tracking-widest font-black text-muted-foreground/40 w-14 text-center">
              Claro
            </span>
            <div className="relative flex-1 flex items-center">
              <input
                type="range"
                min="-1"
                max="1"
                step="0.01"
                value={intensity}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setIntensity(val);
                }}
                onPointerUp={(e) => {
                  const val = parseFloat((e.target as HTMLInputElement).value);
                  updateSettings({ themeIntensity: val });
                }}
                onKeyUp={(e) => {
                  if (e.key.startsWith("Arrow")) {
                    const val = parseFloat(
                      (e.target as HTMLInputElement).value,
                    );
                    updateSettings({ themeIntensity: val });
                  }
                }}
                className="w-full h-2 bg-muted rounded-full appearance-none cursor-pointer accent-primary group-hover:accent-primary/80"
              />
              <div
                className="absolute left-1/2 -translate-x-1/2 w-1 h-4 bg-foreground/10 pointer-events-none rounded-full"
                style={{ opacity: intensity === 0 ? 0 : 1 }}
              />
            </div>
            <span className="text-[10px] uppercase tracking-widest font-black text-muted-foreground/40 w-14 text-center">
              Oscuro
            </span>
          </div>
        </div>

        {/* Primary Color Picker */}
        <div className="space-y-6 pt-6 border-t border-border">
          <div className="flex-1">
            <Label className="text-lg font-semibold text-gray-900 dark:text-white">
              Color primario
            </Label>
            <p className="text-base text-muted-foreground mt-1">
              Elige el color de acento principal para cada modo de tema
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-5 rounded-2xl bg-white border border-border space-y-3">
              <PrimaryColorPicker
                label="Tema claro"
                selectedColor={settings?.primaryColorLight || DEFAULT_LIGHT_COLOR}
                onColorSelect={async (colorId) => {
                  await updateSettings({ primaryColorLight: colorId }, { showToast: true });
                  applyPrimaryColors(colorId, settings?.primaryColorDark);
                }}
              />
            </div>
            <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-700 space-y-3">
              <PrimaryColorPicker
                label="Tema oscuro"
                selectedColor={settings?.primaryColorDark || DEFAULT_DARK_COLOR}
                onColorSelect={async (colorId) => {
                  await updateSettings({ primaryColorDark: colorId }, { showToast: true });
                  applyPrimaryColors(settings?.primaryColorLight, colorId);
                }}
              />
            </div>
          </div>
        </div>

        <div className="pt-8 border-t border-border">
          <ZoomSelector />
        </div>
      </div>
    </div>
  );
}

export function WorkflowSettings({
  isHighlighted,
}: {
  isHighlighted?: boolean;
}) {
  const { settings, updateSettings } = useSettings();

  return (
    <div
      id="workflow-settings"
      className={cn(
        "bg-card rounded-2xl shadow-sm p-8 border border-border transition-[border-color,box-shadow] duration-300",
        isHighlighted
          ? "ring-2 ring-primary ring-offset-4 ring-offset-muted/30"
          : "",
      )}
    >
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
        Flujo de Trabajo
      </h2>
      <p className="text-sm text-muted-foreground mb-8">
        Configura cómo interactúas con la aplicación y el comportamiento de las
        herramientas de desarrollo.
      </p>

      <div className="space-y-12">
        <div className="space-y-4">
          <Label className="text-lg font-semibold text-gray-900 dark:text-white">
            Modo de chat predeterminado
          </Label>
          <div className="p-5 rounded-2xl bg-muted/30 border border-border w-fit">
            <DefaultChatModeSelector />
          </div>
        </div>

        <div className="space-y-4 pt-8 border-t border-border">
          <SettingItem
            label="Git nativo"
            description="Usa una implementación de Git integrada para mayor velocidad y menos dependencias externas."
            onClick={() =>
              updateSettings({ enableNativeGit: !settings?.enableNativeGit })
            }
            control={
              <Switch
                checked={!!settings?.enableNativeGit}
                onCheckedChange={(checked) =>
                  updateSettings({ enableNativeGit: checked })
                }
              />
            }
          />

          <SettingItem
            label="Auto-aprobar cambios"
            description="Aprobará automáticamente los cambios de código sugeridos por la IA sin pedir confirmación."
            onClick={() =>
              updateSettings({
                autoApproveChanges: !settings?.autoApproveChanges,
              })
            }
            control={
              <Switch
                checked={!!settings?.autoApproveChanges}
                onCheckedChange={(checked) =>
                  updateSettings({ autoApproveChanges: checked })
                }
              />
            }
          />

          <SettingItem
            label="Expandir vista previa"
            description="Abre automáticamente el panel de vista previa lateral cuando el código cambia."
            onClick={() =>
              updateSettings({
                autoExpandPreviewPanel: !settings?.autoExpandPreviewPanel,
              })
            }
            control={
              <Switch
                checked={!!settings?.autoExpandPreviewPanel}
                onCheckedChange={(checked) =>
                  updateSettings({ autoExpandPreviewPanel: checked })
                }
              />
            }
          />

          <SettingItem
            label="Notificaciones de respuesta"
            description="Muestra una notificación nativa del sistema cuando el chat termina de generar."
            onClick={() =>
              updateSettings({
                enableChatCompletionNotifications:
                  !settings?.enableChatCompletionNotifications,
              })
            }
            control={
              <Switch
                checked={!!settings?.enableChatCompletionNotifications}
                onCheckedChange={(checked) =>
                  updateSettings({ enableChatCompletionNotifications: checked })
                }
              />
            }
          />
        </div>
      </div>
    </div>
  );
}

function StatsSettings({ isHighlighted }: { isHighlighted?: boolean }) {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<TokenStatEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<TokenStatEntry | null>(
    null,
  );

  const load = async () => {
    setLoading(true);
    try {
      const data = await tokenStatsClient.getTokenStats();
      setEntries(data || []);
    } catch (error) {
      console.error("Failed to load token stats", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  // Calculate total stats
  const totalStats = entries.reduce(
    (acc, entry) => ({
      total: acc.total + entry.totalTokens,
      input: acc.input + (entry.promptTokens ?? 0),
      output: acc.output + (entry.completionTokens ?? 0),
    }),
    { total: 0, input: 0, output: 0 },
  );

  // Group by hour
  const hourlyStats = (() => {
    const stats = new Map<string, { tokens: number; count: number }>();
    entries.forEach((entry) => {
      const date = new Date(entry.timestamp);
      const hourKey = `${date.getHours()}:00`;
      if (!stats.has(hourKey)) {
        stats.set(hourKey, { tokens: 0, count: 0 });
      }
      const s = stats.get(hourKey)!;
      s.tokens += entry.totalTokens;
      s.count += 1;
    });
    return Array.from(stats.entries())
      .map(([hour, data]) => ({ hour, ...data }))
      .sort((a, b) => parseInt(a.hour) - parseInt(b.hour));
  })();

  const maxHourlyTokens = Math.max(...hourlyStats.map((h) => h.tokens), 1);

  // Group by model
  const modelStats = (() => {
    const stats = new Map<string, number>();
    entries.forEach((entry) => {
      const model = entry.model || "unknown";
      stats.set(model, (stats.get(model) || 0) + entry.totalTokens);
    });
    return Array.from(stats.entries())
      .map(([model, tokens]) => ({ model, tokens }))
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 5);
  })();

  const maxModelTokens = Math.max(...modelStats.map((m) => m.tokens), 1);

  return (
    <div
      id="stats-settings"
      className={cn(
        "bg-card rounded-2xl shadow-sm p-8 border border-border transition-[border-color,box-shadow] duration-300",
        isHighlighted
          ? "ring-2 ring-primary ring-offset-4 ring-offset-muted/30"
          : "",
      )}
    >
      <div className="flex items-center justify-between mb-12">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Estadísticas Globales
          </h2>
          <p className="text-base text-muted-foreground mt-1">
            Uso de tokens en todos los chats registrados
          </p>
        </div>
        <div className="flex gap-4">
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl h-10 px-4 font-bold border-border hover:bg-muted"
            onClick={() => {
              const header = [
                "timestamp",
                "chatId",
                "messageId",
                "totalTokens",
                "promptTokens",
                "completionTokens",
                "model",
                "filesSent",
                "toolsUsed",
              ].join(",");
              const lines = entries.map((e) =>
                [
                  new Date(e.timestamp).toISOString(),
                  e.chatId,
                  e.messageId,
                  e.totalTokens,
                  e.promptTokens ?? "",
                  e.completionTokens ?? "",
                  e.model ?? "",
                  (e.filesSent || []).join("|"),
                  (e.toolsUsed || []).join("|"),
                ].join(","),
              );
              const csv = [header, ...lines].join("\n");
              const blob = new Blob([csv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "token-stats.csv";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Exportar CSV
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="rounded-xl h-10 px-4 font-bold text-primary hover:text-primary hover:bg-primary/5 border border-primary/20"
            onClick={() => navigate({ to: "/settings/ai-query-logs" })}
          >
            <Database className="mr-2 h-4 w-4" />
            Inspeccionar Logs de IA
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={load}
            disabled={loading}
            className="rounded-xl h-10 px-4 font-bold border-border hover:bg-muted"
          >
            {loading ? "Cargando..." : "Refrescar"}
          </Button>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <TrendingUp className="text-muted-foreground/20 mb-6" size={64} />
          <p className="text-xl font-semibold text-gray-900 dark:text-white">
            Aún no hay datos
          </p>
          <p className="text-base text-muted-foreground mt-2">
            Envía un mensaje para registrar tus estadísticas de uso
          </p>
        </div>
      ) : (
        <div className="space-y-12">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-muted/30 rounded-2xl p-6 border border-border">
              <div className="flex items-center gap-3 mb-4">
                <Zap className="text-primary" size={20} />
                <span className="text-sm font-bold uppercase tracking-widest text-muted-foreground/60">
                  Total
                </span>
              </div>
              <p className="text-4xl font-black text-gray-900 dark:text-white">
                {totalStats.total.toLocaleString()}
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                tokens en {entries.length} mensajes
              </p>
            </div>

            <div className="bg-muted/30 rounded-2xl p-6 border border-border">
              <div className="flex items-center gap-3 mb-4">
                <TrendingUp className="text-primary" size={20} />
                <span className="text-sm font-bold uppercase tracking-widest text-muted-foreground/60">
                  Entrada
                </span>
              </div>
              <p className="text-4xl font-black text-gray-900 dark:text-white">
                {totalStats.input.toLocaleString()}
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                tokens de prompt (contexto)
              </p>
            </div>

            <div className="bg-muted/30 rounded-2xl p-6 border border-border">
              <div className="flex items-center gap-3 mb-4">
                <TrendingUp className="text-primary" size={20} />
                <span className="text-sm font-bold uppercase tracking-widest text-muted-foreground/60">
                  Salida
                </span>
              </div>
              <p className="text-4xl font-black text-gray-900 dark:text-white">
                {totalStats.output.toLocaleString()}
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                tokens generados por la IA
              </p>
            </div>
          </div>

          {/* Hourly Chart */}
          {hourlyStats.length > 0 && (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <Clock className="text-muted-foreground/60" size={20} />
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                  Uso por Hora
                </h3>
              </div>
              <div className="space-y-4 p-8 rounded-2xl bg-muted/30 border border-border">
                {hourlyStats.map((stat) => (
                  <div key={stat.hour} className="flex items-center gap-6">
                    <span className="text-sm font-mono font-bold text-muted-foreground w-16">
                      {stat.hour}
                    </span>
                    <div className="flex-1 h-8 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-[width] duration-300 flex items-center justify-end pr-4"
                        style={{
                          width: `${(stat.tokens / maxHourlyTokens) * 100}%`,
                        }}
                      >
                        {stat.tokens > maxHourlyTokens * 0.3 && (
                          <span className="text-[10px] font-black text-primary-foreground uppercase tracking-widest">
                            {stat.tokens.toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                    {stat.tokens <= maxHourlyTokens * 0.3 && (
                      <span className="text-sm font-bold text-foreground w-24">
                        {stat.tokens.toLocaleString()}
                      </span>
                    )}
                    <span className="text-xs font-bold text-muted-foreground/40 w-24 text-right">
                      {stat.count} msgs
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top Models and Recent Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Top Models */}
            <div className="space-y-6 flex flex-col h-full">
              <div className="flex items-center gap-3">
                <Sparkles className="text-muted-foreground/60" size={20} />
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                  Top Modelos
                </h3>
              </div>
              <div className="space-y-6 p-6 rounded-2xl bg-muted/30 border border-border h-full overflow-hidden">
                {modelStats.map((stat, idx) => (
                  <div key={stat.model} className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="text-xs font-black text-muted-foreground/30 uppercase tracking-widest flex-shrink-0">
                          #{idx + 1}
                        </span>
                        <div className="text-sm font-bold text-gray-900 dark:text-white truncate">
                          {stat.model}
                        </div>
                      </div>
                      <span className="text-sm font-black text-primary/80 flex-shrink-0">
                        {stat.tokens.toLocaleString()}
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-[width] duration-300"
                        style={{
                          width: `${(stat.tokens / maxModelTokens) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Activity */}
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <TrendingUp className="text-muted-foreground/60" size={20} />
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                  Actividad Reciente
                </h3>
              </div>
              <div className="space-y-3 p-4 rounded-2xl bg-muted/30 border border-border max-h-[460px] overflow-y-auto">
                {entries.slice(0, 10).map((entry) => (
                  <button
                    key={`${entry.timestamp}-${entry.messageId}`}
                    onClick={() => setSelectedEntry(entry)}
                    className="w-full text-left p-4 rounded-xl hover:bg-white dark:hover:bg-gray-800 transition-colors border border-transparent hover:border-border group shadow-none hover:shadow-sm"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest">
                        Chat #{entry.chatId} · {entry.model || "IA"}
                      </span>
                      <span className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest">
                        {formatDistanceToNow(new Date(entry.timestamp), {
                          addSuffix: true,
                          locale: es,
                        })}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary transition-[width]"
                          style={{
                            width: `${(entry.totalTokens / Math.max(...entries.map((e) => e.totalTokens))) * 100}%`,
                          }}
                        />
                      </div>
                      <span className="text-sm font-black text-gray-900 dark:text-white">
                        {entry.totalTokens.toLocaleString()}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Details Dialog */}
      <Dialog
        open={!!selectedEntry}
        onOpenChange={() => setSelectedEntry(null)}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalles del Token Stat</DialogTitle>
          </DialogHeader>
          {selectedEntry && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Chat ID
                  </label>
                  <p className="text-sm text-gray-900 dark:text-gray-100 mt-1">
                    #{selectedEntry.chatId}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Message ID
                  </label>
                  <p className="text-sm text-gray-900 dark:text-gray-100 mt-1">
                    {selectedEntry.messageId}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Total Tokens
                  </label>
                  <p className="text-2xl font-bold text-primary mt-1">
                    {selectedEntry.totalTokens.toLocaleString()}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Input Tokens
                  </label>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
                    {selectedEntry.promptTokens?.toLocaleString() ?? "?"}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Output Tokens
                  </label>
                  <p className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-1">
                    {selectedEntry.completionTokens?.toLocaleString() ?? "?"}
                  </p>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Modelo
                </label>
                <p className="text-sm text-gray-900 dark:text-gray-100 mt-1">
                  {selectedEntry.model || "unknown"}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Timestamp
                </label>
                <p className="text-sm text-gray-900 dark:text-gray-100 mt-1">
                  {new Date(selectedEntry.timestamp).toLocaleString()}
                </p>
              </div>
              {selectedEntry.filesSent &&
                selectedEntry.filesSent.length > 0 && (
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Archivos Enviados ({selectedEntry.filesSent.length})
                    </label>
                    <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-3 rounded mt-2 overflow-x-auto max-h-40">
                      {selectedEntry.filesSent.join("\n")}
                    </pre>
                  </div>
                )}
              {selectedEntry.toolsUsed &&
                selectedEntry.toolsUsed.length > 0 && (
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Herramientas Usadas
                    </label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {selectedEntry.toolsUsed.map((tool) => (
                        <span
                          key={tool}
                          className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                        >
                          {tool}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
