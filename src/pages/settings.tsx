import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useTheme } from "../contexts/ThemeContext";
import {
  PrimaryColorPicker,
  DEFAULT_LIGHT_COLOR,
  DEFAULT_DARK_COLOR,
} from "@/components/PrimaryColorPicker";
import { AIBehaviorSettings } from "@/components/settings/AIBehaviorSettings";
import { FONT_OPTIONS } from "@/shared/fonts";

import { ModelsAndConnectivity } from "@/components/settings/ModelsAndConnectivity";


import ConfirmationDialog from "@/components/ConfirmationDialog";
import { ipc } from "@/ipc/types";
import { showSuccess, showError } from "@/lib/toast";
import { AutoApproveSwitch } from "@/components/AutoApproveSwitch";
import { MaxChatTurnsSelector } from "@/components/MaxChatTurnsSelector";

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
  Info,
  FileText,
  MoreHorizontal,
} from "@/components/ui/icons";
import { ChevronRight } from "@/components/ui/icons";
import { useRouter, useNavigate } from "@tanstack/react-router";
import { GitHubIntegration } from "@/components/GitHubIntegration";
import { VercelIntegration } from "@/components/VercelIntegration";
import { SupabaseIntegration } from "@/components/SupabaseIntegration";
// Firebase hidden - not mature yet
// import { FirebaseIntegration } from "@/components/FirebaseIntegration";

import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { AutoExpandPreviewSwitch } from "@/components/AutoExpandPreviewSwitch";
import { NeonIntegration } from "@/components/NeonIntegration";
import { AgentToolsSettings } from "@/components/settings/AgentToolsSettings";
import { McpServersSettings } from "@/components/settings/McpServersSettings";
import { MemorySettings } from "@/components/settings/MemorySettings";

import { DefaultChatModeSelector } from "@/components/DefaultChatModeSelector";
import { useSetAtom } from "jotai";
import { activeSettingsSectionAtom } from "@/atoms/viewAtoms";
import { ChatLanguageSelector } from "@/components/ChatLanguageSelector";

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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "@/components/ui/icons";


import Fuse from "fuse.js";
import { ReleaseNotesDialog } from "@/components/ReleaseNotesDialog";

import { cn } from "@/lib/utils";
import { UnifiedSelector } from "@/components/ui/UnifiedSelector";

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
      "fuente",
      "tipografía",
      "dark",
      "light",
      "oscuro",
      "claro",
      "apariencia",
      "color",
    ],
    section: "Tema",
    sectionId: "general-settings",
  },

  {
    id: "primary-color",
    label: "Color primario",
    description: "Elige el color de acento principal para modo claro y oscuro",
    keywords: ["color", "primario", "acento", "tema", "personalizar", "primary"],
    section: "Tema",
    sectionId: "general-settings",
  },
  {
    id: "font",
    label: "Tipografía",
    description: "Elige la fuente para toda la interfaz",
    keywords: ["fuente", "tipografía", "font", "geist", "inter", "roboto", "letra"],
    section: "Tema",
    sectionId: "general-settings",
  },
  /*
  {
    id: "icon-library",
    label: "Librería de Iconos",
    description: "Cambiar entre Lucide e Iconoir para la interfaz",
    keywords: ["iconos", "icons", "lucide", "iconoir", "tema", "interfaz", "apariencia"],
    section: "Tema",
    sectionId: "general-settings",
  },
  */
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
  {
    id: "web-search",
    label: "Búsqueda web",
    description: "Permite al modelo buscar en internet cuando necesite información actualizada",
    keywords: ["web", "search", "busqueda", "internet", "buscar", "openrouter", "online"],
    section: "Configuración del flujo de trabajo",
    sectionId: "workflow-settings",
  },
  // Embeddings Settings (now inside Agente)
  {
    id: "embeddings",
    label: "Búsqueda Semántica",
    description: "Mejorar la comprensión del código usando vectores semánticos",
    keywords: ["embeddings", "semantica", "busqueda", "vectores", "ia", "contexto"],
    section: "Agente",
    sectionId: "ai-behavior",
  },
  {
    id: "embeddings-model",
    label: "Modelo de Embeddings",
    description: "Configurar el modelo usado para la búsqueda semántica",
    keywords: ["modelo", "embeddings", "openrouter", "dimensiones", "coste"],
    section: "Agente",
    sectionId: "ai-behavior",
  },
  // AI Settings
  {
    id: "enabled-models",
    label: "Modelos habilitados",
    description: "Gestiona qué modelos aparecen en el selector del chat",
    keywords: ["modelos", "models", "habilitados", "enabled", "activar", "desactivar", "openrouter", "añadir"],
    section: "OpenRouter",
    sectionId: "models-connectivity",
  },
  {
    id: "reasoning-effort",
    label: "Esfuerzo de razonamiento",
    description: "Controla cuánto razonamiento usa el modelo antes de responder",
    keywords: ["reasoning", "effort", "esfuerzo", "razonamiento", "thinking", "openrouter"],
    section: "Agente",
    sectionId: "ai-behavior",
  },
  {
    id: "text-verbosity",
    label: "Verbosidad",
    description: "Controla cuánto detalle incluye el agente en sus respuestas",
    keywords: ["verbosity", "verbosidad", "detalle", "conciso", "detallado"],
    section: "Agente",
    sectionId: "ai-behavior",
  },
  {
    id: "max-chat-turns",
    label: "Turnos máximos de chat",
    description: "Número máximo de intercambios en una conversación",
    keywords: ["turnos", "chat", "maximo", "conversacion", "limite"],
    section: "Agente",
    sectionId: "ai-behavior",
  },
  {
    id: "chat-language",
    label: "Idioma del chat",
    description: "Seleccionar el idioma para las respuestas del agente",
    keywords: ["idioma", "language", "lenguaje", "español", "ingles"],
    section: "Agente",
    sectionId: "ai-behavior",
  },
  {
    id: "agent-max-steps",
    label: "Pasos del agente (Orquestación)",
    description: "Limita el número de iteraciones del agente por petición — menos pasos es más rápido",
    keywords: ["pasos", "steps", "iteraciones", "ligero", "rapido", "orquestacion", "agent", "limite", "velocidad"],
    section: "Agente",
    sectionId: "ai-behavior",
  },

  {
    id: "token-stats",
    label: "Guardar métricas de tokens",
    description: "Guardar uso de tokens para logs y gráficas",
    keywords: ["tokens", "metricas", "estadisticas", "stats", "uso"],
    section: "Estadísticas",
    sectionId: "stats-settings",
  },
  {
    id: "verbose-logs",
    label: "Logs verbosos de chat",
    description: "Registrar información detallada del chat para debugging",
    keywords: ["logs", "verboso", "debug", "debugging", "detallado", "chat"],
    section: "Estadísticas",
    sectionId: "stats-settings",
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
    section: "OpenRouter",
    sectionId: "models-connectivity",
  },
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
  // Firebase hidden - not mature yet
  // {
  //   id: "firebase",
  //   label: "Firebase",
  //   description: "Integración con Firebase (Google)",
  //   keywords: ["firebase", "google", "database", "db", "firestore", "integracion"],
  //   section: "Integraciones",
  //   sectionId: "integrations",
  // },
  {
    id: "mcp-servers",
    label: "Servidores MCP",
    description: "Gestionar servidores Model Context Protocol para ampliar las herramientas del agente",
    keywords: ["mcp", "tools", "herramientas", "servidor", "protocolo", "context", "plugin"],
    section: "Herramientas MCP",
    sectionId: "tools-mcp",
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
      "bash",
      "terminal",
      "seguridad",
      "edit",
      "editar",
      "lsp",
      "webfetch",
      "websearch",
    ],
    section: "Agente",
    sectionId: "ai-behavior",
  },
  // Reset
  {
    id: "reset-all",
    label: "Valores por defecto",
    description: "Restaurar toda la configuración a valores por defecto",
    keywords: [
      "reset",
      "resetear",
      "eliminar",
      "borrar",
      "todo",
      "defecto",
      "restaurar",
    ],
    section: "Tema",
    sectionId: "general-settings",
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
    section: "Agente",
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
  description?: string;
  control: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "flex justify-between gap-8 p-4 rounded-xl hover:bg-muted/50 transition-colors items-center",
        onClick ? "cursor-pointer" : "",
      )}
    >
      <div className="flex-1">
        <h3 className="typo-label">
          {label}
        </h3>
        {description && (
          <p className="typo-caption mt-1">
            {description}
          </p>
        )}
      </div>
      <div onClick={(e) => e.stopPropagation()}>{control}</div>
    </div>
  );
}

function TogglePill({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  return (
    <div className="relative bg-muted/50 rounded-xl p-1 flex w-fit border border-border">
      {([false, true] as const).map((value) => (
        <button
          key={String(value)}
          onClick={() => onCheckedChange(value)}
          className={cn(
            "px-4 py-1.5 typo-select !font-bold rounded-lg transition-colors duration-200 cursor-pointer",
            checked === value
              ? "bg-primary text-primary-foreground shadow-sm"
              : "hover:bg-primary/10",
          )}
        >
          {value ? "Activado" : "Desactivado"}
        </button>
      ))}
    </div>
  );
}

export default function SettingsPage() {
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedSection, setHighlightedSection] = useState<string | null>(
    null,
  );
  const [releaseNotesOpen, setReleaseNotesOpen] = useState(false);
  const [hasReleaseNotes, setHasReleaseNotes] = useState(false);
  const [agentPermissionsExpanded, setAgentPermissionsExpanded] = useState(false);
  const appVersion = useAppVersion();
  const { settings, updateSettings } = useSettings();
  const router = useRouter();
  const navigate = useNavigate();
  const setActiveSettingsSection = useSetAtom(activeSettingsSectionAtom);

  // Version info for popover
  const [versionInfo, setVersionInfo] = useState<{
    vibes: string;
    opencode: string | null;
    node: string;
    electron: string;
    platform: string;
    arch: string;
  } | null>(null);

  const fetchVersionInfo = useCallback(async () => {
    try {
      const info = await ipc.system.getVersionInfo();
      setVersionInfo(info);
    } catch { /* ignore */ }
  }, []);

  // Pre-fetch version info on mount (backend returns cached data instantly)
  useEffect(() => {
    fetchVersionInfo();
  }, [fetchVersionInfo]);

  useEffect(() => {
    setActiveSettingsSection("general-settings");
  }, [setActiveSettingsSection]);

  // Check if release notes file has content
  useEffect(() => {
    if (appVersion) {
      ipc.system.doesReleaseNoteExist({ version: appVersion }).then((result) => {
        setHasReleaseNotes(result.exists);
      }).catch(() => setHasReleaseNotes(false));
    }
  }, [appVersion]);

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

  const handleOpenLogs = async () => {
    try {
      const logPath = await ipc.system.getLogFilePath();
      await ipc.system.showItemInFolder(logPath);
    } catch (err) {
      console.error("Error opening logs:", err);
      showError("No se pudo abrir el archivo de logs");
    }
  };

  return (
    <div
      id="settings-scroll-container"
      className="flex flex-col h-full w-full bg-muted/30 text-foreground overflow-y-auto"
    >
      {/* Header Pill */}
      <div className="w-full mx-auto px-8 pt-6">
        <div className="w-full mx-auto">
          <div className="flex justify-between items-center gap-4 bg-card border border-border rounded-2xl p-4 shadow-sm transition-[border-color,box-shadow] duration-300">
            
            {/* Search Input */}
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
              <Input
                type="text"
                placeholder="Buscar ajustes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-10 h-10 bg-muted/50 border border-border shadow-none focus-visible:ring-1 focus-visible:ring-primary/30 rounded-xl typo-input transition-colors hover:bg-muted/70"
              />
              {searchQuery && (
                <button
                  onClick={clearSearch}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1.5 pr-1">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-10 px-4 cursor-pointer text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors rounded-xl"
                  >
                    <Info className="h-4 w-4 mr-2 opacity-70" />
                    {appVersion ? `v${appVersion}` : "Info"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-[300px] p-4 rounded-xl border border-border shadow-2xl bg-card">
                  {versionInfo ? (
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col gap-2.5 px-1">
                        <h4 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Sistema</h4>
                        <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
                          <span className="text-muted-foreground">Vibes</span>
                          <span className="font-mono font-medium text-primary">v{versionInfo.vibes}</span>
                          <span className="text-muted-foreground">OpenCode</span>
                          <span className="font-mono">{versionInfo.opencode ? `v${versionInfo.opencode}` : "N/A"}</span>
                          <div className="col-span-2 h-px bg-border/50 my-1" />
                          <span className="text-muted-foreground">Node.js</span>
                          <span className="font-mono opacity-80">v{versionInfo.node}</span>
                          <span className="text-muted-foreground">Electron</span>
                          <span className="font-mono opacity-80">v{versionInfo.electron}</span>
                          <span className="text-muted-foreground">Arquitectura</span>
                          <span className="font-mono opacity-80">{versionInfo.platform}/{versionInfo.arch}</span>
                        </div>
                      </div>
                      
                      {hasReleaseNotes && (
                        <div className="pt-3 border-t border-border/50">
                          <Button 
                            onClick={() => { setReleaseNotesOpen(true); }}
                            className="w-full cursor-pointer bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground transition-all rounded-lg"
                            variant="ghost"
                          >
                            <Sparkles className="h-4 w-4 mr-2" />
                            Novedades de la versión
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="py-6 flex justify-center text-sm text-muted-foreground">Cargando...</div>
                  )}
                </PopoverContent>
              </Popover>

              <div className="w-px h-5 bg-border/60 mx-1" />

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-10 px-3 cursor-pointer text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors rounded-xl"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem onClick={handleImportSettings} className="cursor-pointer gap-2">
                    <Download className="h-4 w-4" />
                    Importar
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportSettings} className="cursor-pointer gap-2">
                    <Upload className="h-4 w-4" />
                    Exportar
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleOpenLogs} className="cursor-pointer gap-2">
                    <FileText className="h-4 w-4" />
                    Ver logs
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setIsResetDialogOpen(true)}
                    disabled={isResetting}
                    className="cursor-pointer gap-2 text-destructive focus:text-destructive"
                  >
                    {isResetting ? "Reseteando..." : "Restablecer"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Search Results Dropdown */}
          {searchQuery && (
            <div className="mt-4 bg-card rounded-2xl shadow-xl border border-border overflow-hidden">
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
                          <div className="text-base font-medium text-foreground">
                            {result.label}
                          </div>
                          <div className="typo-caption mt-1">
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
                  <p className="typo-subsection-title">
                    No se encontraron ajustes
                  </p>
                  <p className="typo-caption mt-1">
                    Intenta con otros términos de búsqueda
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="w-full mx-auto px-8 pt-8 pb-12">
        <div className="space-y-12 pb-24">
          <GeneralSettings
            appVersion={appVersion}
            isHighlighted={highlightedSection === "general-settings"}
          />

          {hasReleaseNotes && (
            <ReleaseNotesDialog
              isOpen={releaseNotesOpen}
              onOpenChange={setReleaseNotesOpen}
            />
          )}

          <ModelsAndConnectivity
            isHighlighted={highlightedSection === "models-connectivity"}
          />


          <AIBehaviorSettings
            isHighlighted={highlightedSection === "ai-behavior" || highlightedSection === "embeddings-settings"}
          />

          {/* Memory System Section */}
          <div
            id="memory-settings"
            className={`bg-card rounded-2xl shadow-sm p-8 border border-border transition-[border-color,box-shadow] duration-300 ${highlightedSection === "memory-settings"
              ? "ring-2 ring-primary ring-offset-4 ring-offset-muted/30"
              : ""
              }`}
          >
            <h2 className="typo-section-title mb-2">
              Memoria
            </h2>
            <p className="typo-caption mb-8">
              Configura la memoria persistente del agente: el sistema recuerda hechos,
              preferencias y decisiones entre sesiones.
            </p>
            <MemorySettings />
          </div>



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
            <h2 className="typo-section-title mb-2">
              Integraciones
            </h2>
            <p className="typo-caption mb-8">
              Conecta servicios externos para automatizar despliegues y bases de
              datos.
            </p>
            <div className="space-y-6">
              <GitHubIntegration />
              <VercelIntegration />
              <SupabaseIntegration />
              <NeonIntegration />
              {/* Firebase hidden - not mature yet */}
              {/* <FirebaseIntegration /> */}
            </div>
          </div>

          {/* MCP Tools Section */}
          <div
            id="tools-mcp"
            className={`bg-card rounded-2xl shadow-sm p-8 border border-border transition-[border-color,box-shadow] duration-300 ${highlightedSection === "tools-mcp"
              ? "ring-2 ring-primary ring-offset-4 ring-offset-muted/30"
              : ""
              }`}
          >
            <h2 className="typo-section-title mb-6">
              Herramientas MCP
            </h2>
            <McpServersSettings />
          </div>


          {/* StatsSettings — retired: logging system removed */}
        </div>
      </div>

      <ConfirmationDialog
        isOpen={isResetDialogOpen}
        title="Valores por defecto"
        message="¿Estás seguro de que quieres restaurar los valores por defecto? Esto eliminará todas tus aplicaciones, chats y configuraciones. Esta acción no se puede deshacer."
        confirmText="Restaurar valores por defecto"
        cancelText="Cancelar"
        onConfirm={handleResetEverything}
        onCancel={() => setIsResetDialogOpen(false)}
      />


    </div>
  );
}

export function GeneralSettings({
  appVersion,
  isHighlighted,
}: {
  appVersion: string | null;
  isHighlighted?: boolean;
}) {
  const { theme, setTheme, intensity, setIntensity, applyPrimaryColors, applyFont, applyChatFont, applyFontScale, currentFontId, currentChatFontId, fontScales } = useTheme();
  const [fontScaleExpanded, setFontScaleExpanded] = useState(false);
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
      applyPrimaryColors(settings.primaryColorLight, settings.primaryColorDark, settings.primaryChromaLight, settings.primaryChromaDark);
    }
  }, [settings?.primaryColorLight, settings?.primaryColorDark, settings?.primaryChromaLight, settings?.primaryChromaDark, applyPrimaryColors]);

  // Apply fonts from settings on load
  useEffect(() => {
    if (settings?.selectedFont && settings.selectedFont !== currentFontId) {
      applyFont(settings.selectedFont);
    }
    if (settings?.selectedChatFont && settings.selectedChatFont !== currentChatFontId) {
      applyChatFont(settings.selectedChatFont);
    }
  }, [settings?.selectedFont, settings?.selectedChatFont]); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply font scales from settings on load
  useEffect(() => {
    if (settings?.fontScaleUI !== undefined && settings.fontScaleUI !== fontScales.ui) {
      applyFontScale("ui", settings.fontScaleUI);
    }
    if (settings?.fontScaleSidebar !== undefined && settings.fontScaleSidebar !== fontScales.sidebar) {
      applyFontScale("sidebar", settings.fontScaleSidebar);
    }
    if (settings?.fontScaleChat !== undefined && settings.fontScaleChat !== fontScales.chat) {
      applyFontScale("chat", settings.fontScaleChat);
    }
    if (settings?.fontScaleBubbleWidth !== undefined && settings.fontScaleBubbleWidth !== fontScales["bubble-width"]) {
      applyFontScale("bubble-width", settings.fontScaleBubbleWidth);
    }
  }, [settings?.fontScaleUI, settings?.fontScaleSidebar, settings?.fontScaleChat, settings?.fontScaleBubbleWidth]); // eslint-disable-line react-hooks/exhaustive-deps

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
      <h2 className="typo-section-title mb-8">
        Tema
      </h2>

      <div className="space-y-4">
        <SettingItem
          label="Modo"
          description="Elige entre claro, oscuro o sincronizado con el sistema"
          control={
            <div className="relative bg-muted/50 rounded-xl p-1 flex w-fit border border-border">
              {(["system", "light", "dark"] as const).map((option) => (
                <button
                  key={option}
                  onClick={() => setTheme(option)}
                  className={cn(
                    "px-4 py-1.5 typo-select !font-bold rounded-lg transition-colors duration-200 cursor-pointer",
                    theme === option
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "hover:bg-primary/10",
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
          }
        />

        {/* Primary Color Picker */}
        <SettingItem
          label="Color primario"
          description="Elige el color de acento para cada modo de tema"
          control={
            <div className="flex w-fit">
              <PrimaryColorPicker
                label="Claro"
                pillPosition="first"
                defaultColor={DEFAULT_LIGHT_COLOR}
                selectedColor={settings?.primaryColorLight || DEFAULT_LIGHT_COLOR}
                chroma={settings?.primaryChromaLight ?? 100}
                onColorSelect={async (colorId) => {
                  await updateSettings({ primaryColorLight: colorId }, { showToast: true });
                  applyPrimaryColors(colorId, settings?.primaryColorDark, settings?.primaryChromaLight, settings?.primaryChromaDark);
                }}
                onChromaChange={async (value) => {
                  await updateSettings({ primaryChromaLight: value });
                  applyPrimaryColors(settings?.primaryColorLight, settings?.primaryColorDark, value, settings?.primaryChromaDark);
                }}
              />
              <PrimaryColorPicker
                label="Oscuro"
                variant="dark"
                pillPosition="last"
                defaultColor={DEFAULT_DARK_COLOR}
                selectedColor={settings?.primaryColorDark || DEFAULT_DARK_COLOR}
                chroma={settings?.primaryChromaDark ?? 100}
                onColorSelect={async (colorId) => {
                  await updateSettings({ primaryColorDark: colorId }, { showToast: true });
                  applyPrimaryColors(settings?.primaryColorLight, colorId, settings?.primaryChromaLight, settings?.primaryChromaDark);
                }}
                onChromaChange={async (value) => {
                  await updateSettings({ primaryChromaDark: value });
                  applyPrimaryColors(settings?.primaryColorLight, settings?.primaryColorDark, settings?.primaryChromaLight, value);
                }}
              />
            </div>
          }
        />

        <SettingItem
          label="Intensidad"
          description="Ajusta la luminosidad de los colores base"
          control={
            <div className="relative bg-muted/50 rounded-xl p-1 flex w-fit border border-border">
              <button
                onClick={() => {
                  setIntensity(0.58);
                  updateSettings({ themeIntensity: 0.58 });
                }}
                className={cn(
                  "px-4 py-1.5 typo-select !font-bold rounded-lg transition-colors duration-200 cursor-pointer",
                  intensity === 0.58
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "hover:bg-primary/10",
                )}
              >
                Por defecto
              </button>
              <button
                onClick={() => {
                  setIntensity(0);
                  updateSettings({ themeIntensity: 0 });
                }}
                className={cn(
                  "px-4 py-1.5 typo-select !font-bold rounded-lg transition-colors duration-200 cursor-pointer",
                  intensity === 0
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "hover:bg-primary/10",
                )}
              >
                Más claro
              </button>
            </div>
          }
        />

        {/* Font Selector */}
        <SettingItem
          label="Tipografía de la Interfaz"
          description="Elige la fuente para toda la interfaz (menús, botones)"
          control={
            <UnifiedSelector
              value={currentFontId}
              onChange={async (value) => {
                applyFont(value);
                await updateSettings({ selectedFont: value });
              }}
              options={FONT_OPTIONS.map((font) => ({
                value: font.id,
                label: font.name,
              }))}
              triggerVariant="pill"
              triggerSize="md"
              popoverWidth="w-[200px]"
              itemLayout="compact"
              data-testid="font-selector"
            />
          }
        />
        
        {/* Chat Font Selector */}
        <SettingItem
          label="Tipografía del Chat"
          description="Elige la fuente base para los mensajes del chat"
          control={
            <UnifiedSelector
              value={currentChatFontId}
              onChange={async (value) => {
                applyChatFont(value);
                await updateSettings({ selectedChatFont: value });
              }}
              options={FONT_OPTIONS.map((font) => ({
                value: font.id,
                label: font.name,
              }))}
              triggerVariant="pill"
              triggerSize="md"
              popoverWidth="w-[200px]"
              itemLayout="compact"
              data-testid="chat-font-selector"
            />
          }
        />

        {/* Font Scale — collapsible */}
        <div className="space-y-0">
          <div
            className="flex items-center justify-between cursor-pointer group p-4 rounded-xl border border-border hover:bg-muted/50 transition-colors gap-4"
            onClick={() => setFontScaleExpanded((e) => !e)}
          >
            <div className="flex-1">
              <h3 className="typo-label">Tamaño de fuente</h3>
              <p className="typo-caption mt-1">
                Ajusta el tamaño del texto por zona
              </p>
            </div>
            <ChevronRight
              className={cn(
                "size-5 text-muted-foreground/50 group-hover:text-foreground transition-transform duration-200 shrink-0",
                fontScaleExpanded && "rotate-90",
              )}
            />
          </div>

          {fontScaleExpanded && (
            <div className="pl-4 space-y-0">
              <SettingItem
                label="Interfaz"
                description="Títulos, botones, labels, badges y controles"
                control={
                  <UnifiedSelector
                    value={String(fontScales.ui)}
                    onChange={async (value) => {
                      const scale = parseFloat(value);
                      applyFontScale("ui", scale);
                      await updateSettings({ fontScaleUI: scale });
                    }}
                    options={[
                      { value: "1", label: "100%" },
                      { value: "1.05", label: "105%" },
                      { value: "1.1", label: "110%" },
                      { value: "1.15", label: "115%" },
                      { value: "1.2", label: "120%" },
                      { value: "1.25", label: "125%" },
                      { value: "1.3", label: "130%" },
                    ]}
                    triggerVariant="pill"
                    triggerSize="md"
                    popoverWidth="w-[140px]"
                    itemLayout="compact"
                    data-testid="font-scale-ui-selector"
                  />
                }
              />
              <SettingItem
                label="Sidebar"
                description="Menús, apps y chats de la barra lateral"
                control={
                  <UnifiedSelector
                    value={String(fontScales.sidebar)}
                    onChange={async (value) => {
                      const scale = parseFloat(value);
                      applyFontScale("sidebar", scale);
                      await updateSettings({ fontScaleSidebar: scale });
                    }}
                    options={[
                      { value: "1", label: "100%" },
                      { value: "1.05", label: "105%" },
                      { value: "1.1", label: "110%" },
                      { value: "1.15", label: "115%" },
                      { value: "1.2", label: "120%" },
                      { value: "1.25", label: "125%" },
                      { value: "1.3", label: "130%" },
                    ]}
                    triggerVariant="pill"
                    triggerSize="md"
                    popoverWidth="w-[140px]"
                    itemLayout="compact"
                    data-testid="font-scale-sidebar-selector"
                  />
                }
              />
              <SettingItem
                label="Chat"
                description="Mensajes y contenido del chat"
                control={
                  <UnifiedSelector
                    value={String(fontScales.chat)}
                    onChange={async (value) => {
                      const scale = parseFloat(value);
                      applyFontScale("chat", scale);
                      await updateSettings({ fontScaleChat: scale });
                    }}
                    options={[
                      { value: "1", label: "100%" },
                      { value: "1.05", label: "105%" },
                      { value: "1.1", label: "110%" },
                      { value: "1.15", label: "115%" },
                      { value: "1.2", label: "120%" },
                      { value: "1.25", label: "125%" },
                      { value: "1.3", label: "130%" },
                    ]}
                    triggerVariant="pill"
                    triggerSize="md"
                    popoverWidth="w-[140px]"
                    itemLayout="compact"
                    data-testid="font-scale-chat-selector"
                  />
                }
              />
              <SettingItem
                label="Ancho de burbuja"
                description="Ancho máximo de las burbujas de chat"
                control={
                  <UnifiedSelector
                    value={String(fontScales["bubble-width"])}
                    onChange={async (value) => {
                      const scale = parseFloat(value);
                      applyFontScale("bubble-width", scale);
                      await updateSettings({ fontScaleBubbleWidth: scale });
                    }}
                    options={[
                      { value: "1", label: "100%" },
                      { value: "1.05", label: "105%" },
                      { value: "1.1", label: "110%" },
                      { value: "1.15", label: "115%" },
                      { value: "1.2", label: "120%" },
                      { value: "1.25", label: "125%" },
                      { value: "1.3", label: "130%" },
                      { value: "1.35", label: "135%" },
                      { value: "1.4", label: "140%" },
                      { value: "1.45", label: "145%" },
                      { value: "1.5", label: "150%" },
                    ]}
                    triggerVariant="pill"
                    triggerSize="md"
                    popoverWidth="w-[140px]"
                    itemLayout="compact"
                    data-testid="font-scale-bubble-width-selector"
                  />
                }
              />
            </div>
          )}
        </div>

        {/* Icon Library Selector (Hidden - Experimental)
        <SettingItem
          label="Librería de Iconos"
          description="Selecciona el paquete de iconos para la interfaz"
          control={
            <div className="relative bg-muted/50 rounded-xl p-1 flex w-fit border border-border">
              {(["lucide", "iconoir"] as const).map((option) => (
                <button
                  key={option}
                  onClick={async () => {
                    await updateSettings({ iconLibrary: option });
                  }}
                  className={cn(
                    "px-4 py-1.5 typo-select !font-bold rounded-lg transition-colors duration-200 cursor-pointer",
                    (settings?.iconLibrary || "lucide") === option
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "hover:bg-primary/10",
                  )}
                >
                  {option === "lucide" ? "Lucide" : "Iconoir"}
                </button>
              ))}
            </div>
          }
        />
        */}

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
      <h2 className="typo-section-title mb-2">
        Flujo de Trabajo
      </h2>
      <p className="typo-caption mb-8">
        Configura cómo interactúas con la aplicación y el comportamiento de las
        herramientas de desarrollo.
      </p>

      <div className="space-y-12">
        <div className="space-y-4">
          <SettingItem
            label="Modo de chat predeterminado"
            description="El modo de chat usado para crear nuevos chats"
            control={<DefaultChatModeSelector />}
          />

          {/* Git nativo — hardcoded to always enabled */}

          <SettingItem
            label="Confirmar cambios en git"
            description="Confirma automáticamente los cambios de la IA en git. Si se desactiva, los cambios quedan pendientes."
            onClick={() =>
              updateSettings({
                autoApproveChanges: !settings?.autoApproveChanges,
              })
            }
            control={
              <TogglePill
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
            control={
              <div className="relative bg-muted/50 rounded-xl p-1 flex w-fit border border-border">
                {(["off", "right", "left"] as const).map((option) => {
                  const isActive =
                    option === "off"
                      ? !settings?.autoExpandPreviewPanel
                      : !!settings?.autoExpandPreviewPanel &&
                      (settings?.previewPosition ?? "right") === option;
                  return (
                    <button
                      key={option}
                      onClick={() => {
                        if (option === "off") {
                          updateSettings({ autoExpandPreviewPanel: false });
                        } else {
                          updateSettings({
                            autoExpandPreviewPanel: true,
                            previewPosition: option,
                          });
                        }
                      }}
                      className={cn(
                        "px-4 py-1.5 typo-select !font-bold rounded-lg transition-colors duration-200 cursor-pointer",
                        isActive
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "hover:bg-primary/10",
                      )}
                    >
                      {option === "off"
                        ? "Desactivado"
                        : option === "right"
                          ? "Derecha"
                          : "Izquierda"}
                    </button>
                  );
                })}
              </div>
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
              <TogglePill
                checked={!!settings?.enableChatCompletionNotifications}
                onCheckedChange={(checked) =>
                  updateSettings({ enableChatCompletionNotifications: checked })
                }
              />
            }
          />

          <SettingItem
            label="Búsqueda web"
            description="Permite al modelo buscar en internet cuando necesite información actualizada. OpenRouter ejecuta la búsqueda automáticamente."
            onClick={() =>
              updateSettings({
                enableWebSearch: !settings?.enableWebSearch,
              })
            }
            control={
              <TogglePill
                checked={settings?.enableWebSearch !== false}
                onCheckedChange={(checked) =>
                  updateSettings({ enableWebSearch: checked })
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
  const { settings, updateSettings } = useSettings();
  const [entries, setEntries] = useState<TokenStatEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<TokenStatEntry | null>(
    null,
  );

  const allStatsEnabled = !!settings?.enableAllStatsAndLogs;

  const load = async () => {
    if (!allStatsEnabled) return;
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
    if (allStatsEnabled) {
      void load();
    } else {
      setEntries([]);
    }
  }, [allStatsEnabled]);

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

  const handleToggleMaster = async (checked: boolean) => {
    await updateSettings({ enableAllStatsAndLogs: checked } as any, { showToast: true });
  };

  const handleToggleSubSetting = async (
    field: "enableTokenStats" | "enableVerboseChatLogs",
    value: boolean,
  ) => {
    await updateSettings({ [field]: value } as any, { showToast: true });
  };

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
      {/* Header with master switch on the right */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="typo-section-title">
            Estadísticas y Logs
          </h2>
          <p className="typo-caption mt-1">
            Controla el registro de métricas, estadísticas y logs de la aplicación.
          </p>
        </div>
        <TogglePill
          checked={allStatsEnabled}
          onCheckedChange={handleToggleMaster}
        />
      </div>

      {/* Everything below only shows when master switch is ON */}
      {allStatsEnabled && (
        <div className="mt-8 space-y-12">
          {/* Sub-setting toggles (moved from AI Behavior) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 rounded-2xl bg-muted/30 border border-border flex flex-col justify-between gap-4">
              <div>
                <Label className="text-base font-bold text-foreground">
                  Métricas de tokens
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Guarda el historial de consumo para las estadísticas.
                </p>
              </div>
              <TogglePill
                checked={settings?.enableTokenStats !== false}
                onCheckedChange={(checked) =>
                  handleToggleSubSetting("enableTokenStats", checked)
                }
              />
            </div>

            <div className="p-6 rounded-2xl bg-muted/30 border border-border flex flex-col justify-between gap-4">
              <div>
                <Label className="text-base font-bold text-foreground">
                  Logs verbosos
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Información técnica detallada en el panel de chat.
                </p>
              </div>
              <TogglePill
                checked={!!settings?.enableVerboseChatLogs}
                onCheckedChange={(checked) =>
                  handleToggleSubSetting("enableVerboseChatLogs", checked)
                }
              />
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-4 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              className="cursor-pointer font-bold hover:bg-primary/10 hover:text-primary hover:border-primary/20 transition-colors"
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
              variant="outline"
              size="sm"
              className="cursor-pointer font-bold hover:bg-primary/10 hover:text-primary hover:border-primary/20 transition-colors"
              onClick={() => navigate({ to: "/settings/ai-query-logs" })}
            >
              Inspeccionar Logs de IA
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={load}
              disabled={loading}
              className="cursor-pointer font-bold hover:bg-primary/10 hover:text-primary hover:border-primary/20 transition-colors"
            >
              {loading ? "Cargando..." : "Refrescar"}
            </Button>
          </div>

          {entries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <TrendingUp className="text-muted-foreground/20 mb-6" size={64} />
              <p className="text-xl font-semibold text-foreground">
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
                  <p className="text-4xl font-black text-foreground">
                    {totalStats.total.toLocaleString()}
                  </p>
                  <p className="typo-caption mt-2">
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
                  <p className="text-4xl font-black text-foreground">
                    {totalStats.input.toLocaleString()}
                  </p>
                  <p className="typo-caption mt-2">
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
                  <p className="text-4xl font-black text-foreground">
                    {totalStats.output.toLocaleString()}
                  </p>
                  <p className="typo-caption mt-2">
                    tokens generados por la IA
                  </p>
                </div>
              </div>

              {/* Hourly Chart */}
              {hourlyStats.length > 0 && (
                <div className="space-y-6">
                  <div className="flex items-center gap-3">
                    <Clock className="text-muted-foreground/60" size={20} />
                    <h3 className="typo-subsection-title">
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
                              <span className="text-xs font-black text-primary-foreground uppercase tracking-widest">
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
                    <h3 className="typo-subsection-title">
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
                            <div className="text-sm font-bold text-foreground truncate">
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
                    <h3 className="typo-subsection-title">
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
                          <span className="text-xs font-bold text-muted-foreground/60 uppercase tracking-widest">
                            Chat #{entry.chatId} · {entry.model || "IA"}
                          </span>
                          <span className="text-xs font-bold text-muted-foreground/40 uppercase tracking-widest">
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
                          <span className="text-sm font-black text-foreground">
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
                      <label className="text-sm font-medium text-foreground">
                        Chat ID
                      </label>
                      <p className="text-sm text-foreground mt-1">
                        #{selectedEntry.chatId}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground">
                        Message ID
                      </label>
                      <p className="text-sm text-foreground mt-1">
                        {selectedEntry.messageId}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="text-sm font-medium text-foreground">
                        Total Tokens
                      </label>
                      <p className="text-2xl font-bold text-primary mt-1">
                        {selectedEntry.totalTokens.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground">
                        Input Tokens
                      </label>
                      <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
                        {selectedEntry.promptTokens?.toLocaleString() ?? "?"}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground">
                        Output Tokens
                      </label>
                      <p className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-1">
                        {selectedEntry.completionTokens?.toLocaleString() ?? "?"}
                      </p>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground">
                      Modelo
                    </label>
                    <p className="text-sm text-foreground mt-1">
                      {selectedEntry.model || "unknown"}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-foreground">
                      Timestamp
                    </label>
                    <p className="text-sm text-foreground mt-1">
                      {new Date(selectedEntry.timestamp).toLocaleString()}
                    </p>
                  </div>
                  {selectedEntry.filesSent &&
                    selectedEntry.filesSent.length > 0 && (
                      <div>
                        <label className="text-sm font-medium text-foreground">
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
                        <label className="text-sm font-medium text-foreground">
                          Herramientas Usadas
                        </label>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {selectedEntry.toolsUsed.map((tool) => (
                            <span
                              key={tool}
                              className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-foreground"
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
      )}
    </div>
  );
}
