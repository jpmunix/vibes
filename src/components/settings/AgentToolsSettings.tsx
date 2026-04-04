import React from "react";
import {
  useAgentTools,
  type AgentTool,
} from "@/hooks/useAgentTools";
import { Loader2 } from "lucide-react";
import { AgentToolConsent } from "@/lib/schemas";
import { cn } from "@/lib/utils";


// ============================================================================
// Human-readable names & descriptions for tools
// ============================================================================

const TOOL_LABELS: Record<string, { label: string; description: string }> = {
  file_editor: {
    label: "Editar archivos",
    description:
      "Modificar el contenido de archivos existentes en tu proyecto",
  },
  delete_file: {
    label: "Eliminar archivos",
    description:
      "Borrar archivos de tu proyecto de forma permanente",
  },
  rename_file: {
    label: "Renombrar archivos",
    description:
      "Cambiar el nombre o mover archivos dentro de tu proyecto",
  },
  add_dependency: {
    label: "Instalar dependencias",
    description:
      "Añadir paquetes o librerías al proyecto",
  },
  execute_sql: {
    label: "Ejecutar consultas SQL",
    description:
      "Ejecutar consultas en tu base de datos conectada",
  },
  explore_codebase: {
    label: "Explorar el código",
    description:
      "Analizar la estructura de archivos y carpetas del proyecto",
  },
  run_command: {
    label: "Ejecutar comandos",
    description:
      "Ejecutar comandos en la terminal de tu equipo",
  },
  start_process: {
    label: "Iniciar procesos",
    description:
      "Arrancar servicios o servidores en segundo plano",
  },
  stop_process: {
    label: "Detener procesos",
    description:
      "Parar servicios o servidores en ejecución",
  },
  list_processes: {
    label: "Listar procesos activos",
    description:
      "Consultar qué servicios o servidores están activos",
  },
  wait_for_http: {
    label: "Esperar disponibilidad web",
    description:
      "Esperar a que un servidor esté listo para responder",
  },
  get_supabase_project_info: {
    label: "Consultar info de Supabase",
    description:
      "Obtener información sobre tu proyecto de Supabase",
  },
  get_supabase_table_schema: {
    label: "Ver estructura de tablas",
    description:
      "Consultar la estructura de las tablas en Supabase",
  },
  get_firebase_project_info: {
    label: "Consultar info de Firebase",
    description:
      "Obtener información sobre tu proyecto de Firebase",
  },
  set_chat_summary: {
    label: "Generar resumen del chat",
    description:
      "Crear un resumen de la conversación actual",
  },
  add_integration: {
    label: "Añadir integraciones",
    description:
      "Configurar conexiones con servicios externos",
  },
  read_logs: {
    label: "Leer registros",
    description:
      "Consultar los registros del sistema y la aplicación",
  },
  web_crawl: {
    label: "Navegar páginas web",
    description:
      "Acceder a páginas web para extraer información",
  },
  update_todos: {
    label: "Gestionar tareas",
    description:
      "Actualizar el progreso de las tareas que está realizando",
  },
  run_type_checks: {
    label: "Verificar errores de código",
    description:
      "Ejecutar verificación de tipos para detectar errores",
  },
  git_operations: {
    label: "Operaciones Git",
    description:
      "Commits, ramas y estado del repositorio",
  },
  ask_user: {
    label: "Preguntar al usuario",
    description:
      "Hacerte preguntas cuando necesita más información",
  },
  write_file: {
    label: "Crear archivos",
    description:
      "Crear nuevos archivos en tu proyecto",
  },
  read_file: {
    label: "Leer archivos",
    description:
      "Leer el contenido de archivos de tu proyecto",
  },
  edit_file: {
    label: "Editar archivos (búsqueda)",
    description:
      "Buscar y reemplazar contenido en archivos",
  },
  search_replace: {
    label: "Buscar y reemplazar",
    description:
      "Buscar texto en archivos y reemplazarlo",
  },
  patch_file: {
    label: "Aplicar parches",
    description:
      "Aplicar cambios parciales a archivos existentes",
  },
  grep: {
    label: "Buscar en el código",
    description:
      "Buscar texto o patrones en los archivos del proyecto",
  },
  list_files: {
    label: "Listar archivos",
    description:
      "Ver el listado de archivos y carpetas del proyecto",
  },
  code_search: {
    label: "Búsqueda en código fuente",
    description:
      "Buscar símbolos, funciones o clases en el código",
  },
};

function getToolLabel(name: string): string {
  return TOOL_LABELS[name]?.label ?? name;
}

function getToolDescription(name: string): string {
  return TOOL_LABELS[name]?.description ?? "";
}

// ============================================================================
// Consent pill options
// ============================================================================

const CONSENT_OPTIONS: { value: AgentToolConsent; label: string }[] = [
  { value: "never", label: "Nunca" },
  { value: "ask", label: "Preguntar" },
  { value: "always", label: "Siempre" },
];

// ============================================================================
// Components
// ============================================================================

export function AgentToolsSettings() {
  const { tools, isLoading, setConsent } = useAgentTools();

  const handleConsentChange = (
    toolName: string,
    consent: AgentToolConsent,
  ) => {
    setConsent({ toolName, consent });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-8 animate-spin text-primary/40" />
      </div>
    );
  }

  const allTools = tools || [];

  return (
    <div className="space-y-1">
      {allTools.map((tool: AgentTool) => (
        <ToolConsentRow
          key={tool.name}
          name={tool.name}
          consent={tool.consent}
          onConsentChange={(consent) =>
            handleConsentChange(tool.name, consent)
          }
        />
      ))}
    </div>
  );
}

function ToolConsentRow({
  name,
  consent,
  onConsentChange,
}: {
  name: string;
  consent: AgentToolConsent;
  onConsentChange: (consent: AgentToolConsent) => void;
}) {
  const label = getToolLabel(name);
  const description = getToolDescription(name);

  return (
    <div className="flex justify-between gap-8 p-4 rounded-xl hover:bg-muted/50 transition-colors items-center">
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
      <div className="shrink-0">
        <div className="relative bg-muted/50 rounded-xl p-1 flex w-fit border border-border">
          {CONSENT_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => onConsentChange(option.value)}
              className={cn(
                "px-4 py-1.5 text-sm font-bold rounded-lg transition-colors duration-200 cursor-pointer",
                consent === option.value
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-primary hover:bg-primary/10",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
