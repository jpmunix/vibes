import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useTheme } from "../contexts/ThemeContext";
import {
  PrimaryColorPicker,
  DEFAULT_LIGHT_COLOR,
  DEFAULT_DARK_COLOR,
  getColorById,
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
  Sparkles,
  Search,
  X,
  Database,
  Download,
  Upload,
  Info,
  FileText,
  MoreHorizontal,
  RotateCcw,
  Volume2,
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
import { SkillsSettings } from "@/components/settings/SkillsSettings";
import { MemorySettings } from "@/components/settings/MemorySettings";
import { PromptsSection } from "@/components/settings/PromptsSection";

import { DefaultChatModeSelector } from "@/components/DefaultChatModeSelector";
import { useSetAtom } from "jotai";
import { activeSettingsSectionAtom } from "@/atoms/viewAtoms";
import { ChatLanguageSelector } from "@/components/ChatLanguageSelector";
import { CustomAgentsSection } from "@/components/settings/CustomAgentsSection";
import { ActiveLoader } from "@/components/chat/StreamingLoadingAnimation";

import { Input } from "@/components/ui/input";
import { ChatCompletionNotificationSwitch } from "@/components/ChatCompletionNotificationSwitch";
import { sendAppNotification } from "@/lib/notification-sound";
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
  // ─── General / Tema ───
  {
    id: "theme",
    label: "Apariencia",
    description: "Define el tema visual principal de la interfaz",
    keywords: [
      "tema", "mode", "dark", "light",
      // sub-values (pill labels)
      "claro", "oscuro",
      "apariencia", "color",
    ],
    section: "Tema",
    sectionId: "general-settings",
  },
  {
    id: "primary-color",
    label: "Color primario",
    description: "Elige el color de acento principal para modo claro y oscuro",
    keywords: ["color", "primario", "acento", "tema", "personalizar", "primary", "chroma"],
    section: "Tema",
    sectionId: "general-settings",
  },
  {
    id: "font",
    label: "Tipografía de la Interfaz",
    description: "Elige la fuente para toda la interfaz (menús, botones)",
    keywords: [
      "fuente", "tipografía", "font", "letra", "interfaz",
      // sub-values: font names
      ...FONT_OPTIONS.map((f) => f.name.toLowerCase()),
    ],
    section: "Tema",
    sectionId: "general-settings",
  },
  {
    id: "chat-font",
    label: "Tipografía del Chat",
    description: "Elige la fuente base para los mensajes del chat",
    keywords: [
      "fuente", "tipografía", "font", "chat", "mensajes",
      // sub-values: font names
      ...FONT_OPTIONS.map((f) => f.name.toLowerCase()),
    ],
    section: "Tema",
    sectionId: "general-settings",
  },
  {
    id: "font-scale",
    label: "Tamaño de fuente",
    description: "Ajusta el tamaño del texto por zona (interfaz, sidebar, chat)",
    keywords: [
      "tamaño", "fuente", "escala", "zoom", "scale",
      "interfaz", "sidebar", "chat",
      "ancho", "burbuja", "bubble", "width",
    ],
    section: "Tema",
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
    label: "Confirmar cambios en git",
    description: "Confirma automáticamente los cambios de la IA en git",
    keywords: ["aprobar", "automatico", "cambios", "codigo", "ejecutar", "git", "commit", "confirmar"],
    section: "Configuración del flujo de trabajo",
    sectionId: "workflow-settings",
  },
  {
    id: "auto-expand-preview",
    label: "Expandir vista previa",
    description: "Abre automáticamente el panel de vista previa lateral cuando el código cambia",
    keywords: [
      "expandir", "preview", "vista previa", "panel", "automatico",
      // sub-values
      "desactivado", "derecha", "izquierda",
    ],
    section: "Configuración del flujo de trabajo",
    sectionId: "workflow-settings",
  },
  {
    id: "chat-completion-notification",
    label: "Notificaciones de respuesta",
    description: "Muestra una notificación nativa del sistema cuando el chat termina de generar",
    keywords: ["notificacion", "respuesta", "completada", "chat", "alerta"],
    section: "Configuración del flujo de trabajo",
    sectionId: "workflow-settings",
  },
  {
    id: "notification-sound",
    label: "Reproducir sonido",
    description: "Reproduce un sonido al terminar la respuesta (útil en apps sin firmar en macOS)",
    keywords: ["sonido", "sound", "audio", "notificacion", "chime", "beep", "mac"],
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
  // ─── Agente ───
  {
    id: "chat-language",
    label: "Idioma del chat",
    description: "Seleccionar el idioma para las respuestas del agente",
    keywords: [
      "idioma", "language", "lenguaje",
      // sub-values
      "español", "english", "ingles",
    ],
    section: "Agente",
    sectionId: "ai-behavior",
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
    id: "chat-view",
    label: "Vista del chat",
    description: "Respuestas limpias mostrando solo lo esencial o todos los pasos intermedios",
    keywords: [
      "vista", "chat", "render", "modo", "view",
      // sub-values (pill labels)
      "completo", "flow", "zen",
      "ligero", "rapido", "limpio", "esencial",
    ],
    section: "Agente",
    sectionId: "ai-behavior",
  },
  {
    id: "standard-model",
    label: "Modelo para tareas internas",
    description: "Títulos, resúmenes y mantenimiento",
    keywords: [
      "modelo", "tareas", "internas", "titulos", "resumenes",
      "standard", "gemini", "flash", "lite",
    ],
    section: "Agente",
    sectionId: "ai-behavior",
  },
  {
    id: "agent-permissions",
    label: "Permisos del Agente",
    description: "Configurar qué herramientas puede usar el agente",
    keywords: [
      "permisos", "agente", "agent", "herramientas", "tools", "permissions",
      "seguridad",
      // sub-values: permission names
      "editar archivos", "terminal", "bash",
      "acceso web", "webfetch",
      "búsqueda web", "websearch",
      "diagnósticos", "lsp",
      // sub-values: permission levels
      "siempre", "preguntar", "nunca",
      // sub-values: granular rules
      "rm", "borrar", "git add", "git commit", "git push", "git reset",
      "git checkout", "git restore", "git clean", "git rebase",
    ],
    section: "Agente",
    sectionId: "ai-behavior",
  },
  // ─── Proveedores de IA ───
  {
    id: "ai-providers",
    label: "Proveedores de IA",
    description: "Configurar y cambiar entre proveedores de modelos de IA",
    keywords: ["proveedor", "provider", "proxy", "endpoint", "custom", "litellm", "openai", "compatible"],
    section: "Proveedores de IA",
    sectionId: "models-connectivity",
  },
  // ─── OpenRouter ───
  {
    id: "enabled-models",
    label: "Modelos habilitados",
    description: "Gestiona qué modelos aparecen en el selector del chat",
    keywords: ["modelos", "models", "habilitados", "enabled", "activar", "desactivar", "openrouter", "añadir"],
    section: "OpenRouter",
    sectionId: "models-connectivity",
  },
  {
    id: "provider-settings",
    label: "Configuración de OpenRouter",
    description: "Configurar clave API de OpenRouter y modelos",
    keywords: ["openrouter", "api", "key", "clave", "ia"],
    section: "OpenRouter",
    sectionId: "models-connectivity",
  },
  {
    id: "show-cost-display",
    label: "Mostrar gasto en chats",
    description: "Muestra el coste acumulado en la cabecera y el coste por mensaje",
    keywords: ["gasto", "coste", "cost", "precio", "dinero", "tokens", "openrouter", "mostrar", "ocultar"],
    section: "OpenRouter",
    sectionId: "models-connectivity",
  },
  // ─── Integraciones ───
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
      "neon", "database", "db", "postgres", "postgresql", "integracion",
    ],
    section: "Integraciones",
    sectionId: "integrations",
  },
  // ─── Herramientas MCP ───
  {
    id: "mcp-servers",
    label: "Servidores MCP",
    description: "Gestionar servidores Model Context Protocol para ampliar las herramientas del agente",
    keywords: ["mcp", "tools", "herramientas", "servidor", "protocolo", "context", "plugin"],
    section: "Herramientas MCP",
    sectionId: "tools-mcp",
  },
  {
    id: "skills-settings",
    label: "Skills del Proyecto",
    description: "Gestionar agentes de conocimiento y directivas personalizadas (.claude/skills)",
    keywords: ["skills", "opencode", "agentes", "conocimiento", "personalizar", "directivas", "markdown"],
    section: "Skills",
    sectionId: "tools-skills",
  },
  // ─── Otros ───
  {
    id: "reset-all",
    label: "Valores por defecto",
    description: "Restaurar toda la configuración a valores por defecto",
    keywords: [
      "reset", "resetear", "eliminar", "borrar", "todo", "defecto", "restaurar",
    ],
    section: "Tema",
    sectionId: "general-settings",
  },
  // ─── Agentes Personalizados ───
  {
    id: "custom-agents",
    label: "Agentes Personalizados",
    description: "Crea y administra tus propios agentes con instrucciones específicas y comandos slash personalizados",
    keywords: ["agentes", "personalizados", "custom", "agents", "system", "prompt", "slash", "comando", "additive", "replace"],
    section: "Agentes Personalizados",
    sectionId: "custom-agents-settings",
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
  const [agentPermissionsExpanded, setAgentPermissionsExpanded] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const { theme, intensity } = useTheme();
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

  // Track scroll position for sticky header fade
  useEffect(() => {
    const container = document.getElementById("settings-scroll-container");
    if (!container) return;
    const handleScroll = () => setIsScrolled(container.scrollTop > 8);
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  // Check if release notes file has content removed (now using static new documentation system)

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

  const handleRestartOpenCode = async () => {
    try {
      await ipc.system.restartOpenCodeServer();
      showSuccess("OpenCode reiniciado correctamente");
    } catch (err) {
      console.error("Error restarting OpenCode:", err);
      showError("No se pudo reiniciar OpenCode");
    }
  };

  return (
    <div
      id="settings-scroll-container"
      className="flex flex-col h-full w-full bg-muted/30 text-foreground overflow-y-auto"
    >
      {/* Header Pill — sticky */}
      <div className="sticky top-0 z-50 w-full pt-6 pb-4 pointer-events-none">
        
        {/* Solid background behind the pill */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute inset-0 bg-background" />
          <div className="absolute inset-0 bg-muted/30" />
        </div>

        {/* Aggressive fade overlay — only visible when scrolled */}
        <div 
          className="absolute left-0 right-0 -z-10 h-8"
          style={{ 
            top: '100%',
            opacity: isScrolled ? 1 : 0,
            background: 'linear-gradient(to bottom, var(--color-background), transparent)',
            maskImage: 'linear-gradient(to bottom, black 20%, transparent)',
          }}
        >
          <div className="absolute inset-0 bg-background" />
          <div className="absolute inset-0 bg-muted/30" />
        </div>

        <div className="relative w-full mx-auto px-8 pointer-events-auto">
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
                      
                      <div className="pt-3 border-t border-border/50">
                        <Button 
                          onClick={() => { 
                            ipc.system.openReleaseNotesWindow({
                              theme: theme as "light" | "dark" | "system",
                              themeIntensity: intensity,
                            });
                          }}
                          className="w-full cursor-pointer bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground transition-all rounded-lg"
                          variant="ghost"
                        >
                          <Sparkles className="h-4 w-4 mr-2" />
                          Novedades de la versión
                        </Button>
                      </div>
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
                  <DropdownMenuItem onClick={handleRestartOpenCode} className="cursor-pointer gap-2">
                    <RotateCcw className="h-4 w-4" />
                    Reiniciar OpenCode
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => sendAppNotification({ title: "Test", body: "Si escuchas esto, el sonido funciona correctamente", settings: settings ?? null })}
                    className="cursor-pointer gap-2"
                  >
                    <Volume2 className="h-4 w-4" />
                    Probar notificación
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setIsResetDialogOpen(true)}
                    disabled={isResetting}
                    className="cursor-pointer gap-2 text-destructive focus:text-destructive"
                  >
                    {isResetting ? "Reseteando..." : "Restablecer ajustes"}
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

      <div className="w-full mx-auto px-8 pt-4 pb-12 flex-1">
        <div className="space-y-12 pb-24">
          <GeneralSettings
            appVersion={appVersion}
            isHighlighted={highlightedSection === "general-settings"}
          />

          <ModelsAndConnectivity
            isHighlighted={highlightedSection === "models-connectivity"}
          />


          <AIBehaviorSettings
            isHighlighted={highlightedSection === "ai-behavior" || highlightedSection === "embeddings-settings"}
          />

          {/* Custom Agents Section */}
          <div
            id="custom-agents-settings"
            className={`bg-card rounded-2xl shadow-sm p-8 border border-border transition-[border-color,box-shadow] duration-300 ${highlightedSection === "custom-agents-settings"
              ? "ring-2 ring-primary ring-offset-4 ring-offset-muted/30"
              : ""
              }`}
          >
            <h2 className="typo-section-title mb-2">
              Agentes Personalizados
            </h2>
            <p className="typo-caption mb-8">
              Construye y administra tus propios agentes con instrucciones específicas. Puedes inyectar un system prompt aditivo o pisar completamente las instrucciones nativas.
            </p>
            <CustomAgentsSection />
          </div>

          {/* Prompts Section */}
          <div
            id="prompts-settings"
            className={`bg-card rounded-2xl shadow-sm p-8 border border-border transition-[border-color,box-shadow] duration-300 ${highlightedSection === "prompts-settings"
              ? "ring-2 ring-primary ring-offset-4 ring-offset-muted/30"
              : ""
              }`}
          >
            <h2 className="typo-section-title mb-2">
              Prompts
            </h2>
            <p className="typo-caption mb-8">
              Personaliza las instrucciones que reciben los modelos AI para tareas internas,
              generación de nombres y el sistema de directrices.
            </p>
            <PromptsSection />
          </div>

          <div
            id="memory-settings"
            className={`bg-card rounded-2xl shadow-sm p-8 border border-border transition-[border-color,box-shadow] duration-300 ${highlightedSection === "memory-settings"
              ? "ring-2 ring-primary ring-offset-4 ring-offset-muted/30"
              : ""
              }`}
          >
            <h2 className="typo-section-title mb-2">
              Directrices
            </h2>
            <p className="typo-caption mb-8">
              Define directrices que el agente recuerda entre sesiones para personalizar sus respuestas.
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

          <div
            id="tools-skills"
            className="bg-card rounded-2xl shadow-sm p-8 border border-border mt-8"
          >
            <h2 className="typo-section-title mb-2">
              Skills
            </h2>
            <p className="typo-caption mb-8">
              Instrucciones y guías de comportamiento personalizadas para el agente, aplicadas de forma global o específicas por proyecto.
            </p>
            <SkillsSettings />
          </div>
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
  const { theme, setTheme, applyPrimaryColors, applyFont, applyChatFont, applyFontScale, applyBubbleWidth, currentFontId, currentChatFontId, fontScales, bubbleWidthPct, themeFlavorDark, setThemeFlavorDark, themeFlavorLight, setThemeFlavorLight, isDarkMode } = useTheme();
  const [fontScaleExpanded, setFontScaleExpanded] = useState(false);
  const { settings, updateSettings } = useSettings();
  const activeColorId = isDarkMode
    ? (settings?.primaryColorDark || DEFAULT_DARK_COLOR)
    : (settings?.primaryColorLight || DEFAULT_LIGHT_COLOR);
  const activeColorHex = getColorById(activeColorId)?.[isDarkMode ? "dark" : "light"] || "#7c3aed";

  const renderLoaderIcon = (style: string, size: number = 18) => (
    <div className="w-8 h-8 rounded-lg bg-muted/40 border border-border/60 flex items-center justify-center shrink-0 ml-3 shadow-inner">
      <ActiveLoader style={style} color={activeColorHex} size={size} />
    </div>
  );

  useEffect(() => {
    if (
      settings?.theme !== undefined &&
      settings.theme !== theme
    ) {
      setTheme(settings.theme);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.theme, setTheme]);

  useEffect(() => {
    if (
      settings?.themeFlavorDark !== undefined &&
      settings.themeFlavorDark !== themeFlavorDark
    ) {
      setThemeFlavorDark(settings.themeFlavorDark);
    }
  }, [settings?.themeFlavorDark, setThemeFlavorDark, themeFlavorDark]);

  useEffect(() => {
    if (
      settings?.themeFlavorLight !== undefined &&
      settings.themeFlavorLight !== themeFlavorLight
    ) {
      setThemeFlavorLight(settings.themeFlavorLight);
    }
  }, [settings?.themeFlavorLight, setThemeFlavorLight, themeFlavorLight]);

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
    if (settings?.fontScaleBubbleWidth !== undefined && settings.fontScaleBubbleWidth !== bubbleWidthPct) {
      applyBubbleWidth(settings.fontScaleBubbleWidth);
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
          label="Apariencia"
          description="Define el tema visual principal de la interfaz"
          control={
            <div className="relative bg-muted/50 rounded-xl p-1 flex w-fit border border-border">
              {(["light", "dark"] as const).map((option) => (
                <button
                  key={option}
                  onClick={() => { setTheme(option); updateSettings({ theme: option }); }}
                  className={cn(
                    "px-4 py-1.5 typo-select !font-bold rounded-lg transition-colors duration-200 cursor-pointer",
                    (option === "dark" ? isDarkMode : !isDarkMode)
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "hover:bg-primary/10",
                  )}
                >
                  {option === "light" ? "Claro" : "Oscuro"}
                </button>
              ))}
            </div>
          }
        />

        {!isDarkMode ? (
          <SettingItem
            label="Variante del tema claro"
            description="Personaliza el tema claro con un esquema de color de autor"
            control={
              <UnifiedSelector
                value={themeFlavorLight || "default"}
                onChange={async (value) => {
                  setThemeFlavorLight(value);
                  await updateSettings({ themeFlavorLight: value }, { showToast: true });
                }}
                options={[
                  { value: "default", label: "Claro Clásico", description: "Esquema de colores claro estándar" },
                  { value: "github-light", label: "GitHub Light", description: "Estilo limpio al estilo de GitHub" },
                  { value: "solarized-light", label: "Solarized Light", description: "Tono crema cálido de alta legibilidad" },
                  { value: "gruvbox-light", label: "Gruvbox Light", description: "Esquema retro y cálido color crema/arena" },
                  { value: "nord-light", label: "Nord Light", description: "Diseño nórdico de tonos claros y fríos" },
                  { value: "cupcake", label: "Cupcake", description: "Paleta pastel dulce con tonos rosa y morado" },
                  { value: "one-light", label: "One Light", description: "El tema claro limpio de Atom One" },
                  { value: "forest-light", label: "Forest Light", description: "Fondo verde salvia muy relajante y suave" },
                  { value: "papercolor-light", label: "PaperColor Light", description: "Fondo blanco puro de alto contraste" },
                  { value: "catppuccin-latte", label: "Catppuccin Latte", description: "Paleta pastel moderna con tonos lavanda" },
                ]}
                triggerVariant="pill"
                triggerSize="md"
                popoverWidth="w-[280px]"
                data-testid="theme-flavor-light-selector"
              />
            }
          />
        ) : (
          <SettingItem
            label="Variante del tema oscuro"
            description="Personaliza el tema oscuro con un esquema de color de autor"
            control={
              <UnifiedSelector
                value={themeFlavorDark || "default"}
                onChange={async (value) => {
                  setThemeFlavorDark(value);
                  await updateSettings({ themeFlavorDark: value }, { showToast: true });
                }}
                options={[
                  { value: "default", label: "Oscuro Clásico", description: "Esquema de colores oscuro estándar" },
                  { value: "dracula", label: "Dracula", description: "Paleta violeta y gris oscuro de Dracula" },
                  { value: "one-dark", label: "One Dark", description: "Tema clásico de Atom One Dark" },
                  { value: "nord", label: "Nord Dark", description: "Tonos árticos azulados fríos y limpios" },
                  { value: "monokai", label: "Monokai", description: "Fondo gris cálido con acentos neon clásicos" },
                  { value: "solarized-dark", label: "Solarized Dark", description: "Fondo verde azulado profundo clásico" },
                  { value: "gruvbox-dark", label: "Gruvbox Dark", description: "Paleta retro en marrón oscuro y arena" },
                  { value: "synthwave84", label: "Synthwave '84", description: "Fondo morado y rosa neon de estética retro" },
                  { value: "night-owl", label: "Night Owl", description: "Diseño azul marino profundo para uso nocturno" },
                  { value: "tokyo-night", label: "Tokyo Night", description: "Paleta gris azulada elegante y limpia" },
                ]}
                triggerVariant="pill"
                triggerSize="md"
                popoverWidth="w-[280px]"
                data-testid="theme-flavor-dark-selector"
              />
            }
          />
        )}

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

        {/* Loader Style Selector */}
        <SettingItem
          label="Estilo de animación de carga"
          description="Personaliza la animación que se muestra mientras la IA piensa o procesa"
          control={
            <UnifiedSelector
              value={settings?.loaderStyle || "orbital"}
              onChange={async (value) => {
                await updateSettings({ loaderStyle: value }, { showToast: true });
              }}
              options={[
                {
                  value: "orbital",
                  label: "Orbital (Original)",
                  description: "Tres partículas luminosas en órbita con estela",
                  rightIcon: renderLoaderIcon("orbital")
                },
                {
                  value: "aurora",
                  label: "Aurora Pulse",
                  description: "Ondas circulares concéntricas y expansivas",
                  rightIcon: renderLoaderIcon("aurora")
                },
                {
                  value: "wave",
                  label: "Bouncing Wave",
                  description: "Cinco puntos rebotando en onda desfasada",
                  rightIcon: renderLoaderIcon("wave")
                },
                {
                  value: "jelly",
                  label: "Morphing Jelly",
                  description: "Gota fluida orgánica en deformación constante",
                  rightIcon: renderLoaderIcon("jelly")
                },
                {
                  value: "spark",
                  label: "Pulse Spark",
                  description: "Chispas brillantes que nacen y se expanden",
                  rightIcon: renderLoaderIcon("spark")
                },
                {
                  value: "equalizer",
                  label: "Bar Equalizer",
                  description: "Columnas de frecuencia que suben y bajan",
                  rightIcon: renderLoaderIcon("equalizer")
                },
                {
                  value: "infinity",
                  label: "Infinity Loop",
                  description: "Partícula que dibuja el símbolo de infinito",
                  rightIcon: renderLoaderIcon("infinity")
                },
                {
                  value: "grid",
                  label: "Pixel Grid",
                  description: "Cuadrícula retro de micro-píxeles secuenciales",
                  rightIcon: renderLoaderIcon("grid")
                },
                {
                  value: "brackets",
                  label: "Code Brackets",
                  description: "Corchetes de código en pulsación alternada",
                  rightIcon: renderLoaderIcon("brackets")
                },
                {
                  value: "terminal",
                  label: "Terminal Cursor",
                  description: "Cursor parpadeante de terminal de desarrollo",
                  rightIcon: renderLoaderIcon("terminal")
                },
                {
                  value: "server",
                  label: "Server Lights",
                  description: "Indicadores LED parpadeantes estilo rack de servidores",
                  rightIcon: renderLoaderIcon("server")
                },
                {
                  value: "morph",
                  label: "Morphing AI Core",
                  description: "Núcleo con rotación y cambio de forma geométrico",
                  rightIcon: renderLoaderIcon("morph")
                },
                {
                  value: "matrix",
                  label: "Matrix Rain",
                  description: "Flujo descendente de código binario estilo Matrix",
                  rightIcon: renderLoaderIcon("matrix")
                },
                {
                  value: "glow",
                  label: "Glowing Sphere",
                  description: "Esfera luminosa pulsante con brillo de neon",
                  rightIcon: renderLoaderIcon("glow")
                },
                {
                  value: "voice",
                  label: "AI Voice",
                  description: "Barras de espectro de voz de asistente de IA",
                  rightIcon: renderLoaderIcon("voice")
                },
                {
                  value: "packet",
                  label: "Network Packet",
                  description: "Envío de paquetes de datos a través de una red",
                  rightIcon: renderLoaderIcon("packet")
                },
                {
                  value: "sonar",
                  label: "Sonar Ripple",
                  description: "Ondas de radar concéntricas estilo sonar",
                  rightIcon: renderLoaderIcon("sonar")
                },
                {
                  value: "blocks",
                  label: "Data Blocks",
                  description: "Bloques de datos que se expanden secuencialmente",
                  rightIcon: renderLoaderIcon("blocks")
                },
                {
                  value: "nodes",
                  label: "Node Connection",
                  description: "Conexión de datos secuencial entre dos nodos",
                  rightIcon: renderLoaderIcon("nodes")
                },
                {
                  value: "glowring",
                  label: "Neon Glow Ring",
                  description: "Anillo neon giratorio de dos colores con brillo",
                  rightIcon: renderLoaderIcon("glowring")
                },
                {
                  value: "m-dots",
                  label: "Micro Dots",
                  description: "Tres puntitos de 2.5px parpadeantes",
                  rightIcon: renderLoaderIcon("m-dots")
                },
                {
                  value: "m-radar",
                  label: "Micro Radar",
                  description: "Círculo con barrido angular de barrido cónico",
                  rightIcon: renderLoaderIcon("m-radar")
                },
                {
                  value: "m-sine",
                  label: "Sine Line",
                  description: "Línea de frecuencia con escala horizontal",
                  rightIcon: renderLoaderIcon("m-sine")
                },
                {
                  value: "m-orbit",
                  label: "Orbit Dot",
                  description: "Punto central con satélite orbitando",
                  rightIcon: renderLoaderIcon("m-orbit")
                },
                {
                  value: "m-eq",
                  label: "Micro Equalizer",
                  description: "Tres barras finas verticales de frecuencia",
                  rightIcon: renderLoaderIcon("m-eq")
                },
                {
                  value: "m-pulse",
                  label: "Pulsing Core",
                  description: "Núcleo con latido nítido y expansión de halo",
                  rightIcon: renderLoaderIcon("m-pulse")
                },
                {
                  value: "m-cross",
                  label: "Cross Rotator",
                  description: "Mini aspa de cruz giratoria",
                  rightIcon: renderLoaderIcon("m-cross")
                },
                {
                  value: "m-flip",
                  label: "Flipping Square",
                  description: "Cubo 3D que gira y flipea en perspectiva",
                  rightIcon: renderLoaderIcon("m-flip")
                },
                {
                  value: "m-blink",
                  label: "Cursor Blink",
                  description: "Cursor parpadeante estilo terminal de desarrollo",
                  rightIcon: renderLoaderIcon("m-blink")
                },
                {
                  value: "m-breathe",
                  label: "Breathe Ring",
                  description: "Anillo en pulsación de escala y opacidad",
                  rightIcon: renderLoaderIcon("m-breathe")
                },
                {
                  value: "m-swap",
                  label: "Swapping Dots",
                  description: "Dos puntos cruzándose alternadamente",
                  rightIcon: renderLoaderIcon("m-swap")
                },
                {
                  value: "m-sonar",
                  label: "Sonar Ping",
                  description: "Punto con ondas concéntricas expansivas",
                  rightIcon: renderLoaderIcon("m-sonar")
                },
                {
                  value: "m-pie",
                  label: "Pie Fill",
                  description: "Relleno circular secuencial de 4 pasos",
                  rightIcon: renderLoaderIcon("m-pie")
                },
                {
                  value: "m-scan",
                  label: "Scan Line",
                  description: "Línea de escaneo láser horizontal en caja",
                  rightIcon: renderLoaderIcon("m-scan")
                },
                {
                  value: "m-hour",
                  label: "Micro Hourglass",
                  description: "Reloj de arena clásico giratorio",
                  rightIcon: renderLoaderIcon("m-hour")
                },
                {
                  value: "m-yin",
                  label: "Semicircle",
                  description: "Doble semicírculo giratorio",
                  rightIcon: renderLoaderIcon("m-yin")
                },
                {
                  value: "m-diamond",
                  label: "Diamond Pulse",
                  description: "Rombo giratorio con cambio de escala y relleno",
                  rightIcon: renderLoaderIcon("m-diamond")
                },
                {
                  value: "m-clock",
                  label: "Clock Hand",
                  description: "Aguja de reloj giratoria con anillo",
                  rightIcon: renderLoaderIcon("m-clock")
                },
                {
                  value: "m-expand",
                  label: "Bar Expand",
                  description: "Punto a línea con expansión horizontal simétrica",
                  rightIcon: renderLoaderIcon("m-expand")
                }
              ]}
              triggerVariant="pill"
              triggerSize="md"
              popoverWidth="w-[300px]"
              data-testid="loader-style-selector"
            />
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
                      { value: "0.9", label: "90%" },
                      { value: "0.95", label: "95%" },
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
                description="Porcentaje del contenedor (100% = ancho total)"
                control={
                  <UnifiedSelector
                    value={String(bubbleWidthPct)}
                    onChange={async (value) => {
                      const pct = parseFloat(value);
                      applyBubbleWidth(pct);
                      await updateSettings({ fontScaleBubbleWidth: pct });
                    }}
                    options={[
                      { value: "60", label: "60%" },
                      { value: "65", label: "65%" },
                      { value: "70", label: "70%" },
                      { value: "75", label: "75%" },
                      { value: "85", label: "85%" },
                      { value: "95", label: "95%" },
                      { value: "100", label: "100%" },
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
            label="Reproducir sonido"
            description="Reproduce un sonido al terminar la respuesta. Funciona en apps sin firmar en macOS donde las notificaciones nativas no están disponibles."
            onClick={() =>
              updateSettings({
                enableNotificationSound:
                  settings?.enableNotificationSound === false,
              })
            }
            control={
              <TogglePill
                checked={settings?.enableNotificationSound !== false}
                onCheckedChange={(checked) =>
                  updateSettings({ enableNotificationSound: checked })
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
