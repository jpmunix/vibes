import React, { useState } from "react";
import {
  Brain,
  GitBranch,
  MessageCircleQuestion,
  Pencil,
  FileText,
  Search,
  Scissors,
  Trash2,
  ArrowRightLeft,
  Package,
  Database,
  ScrollText,
  Globe,
  Code,
  FolderOpen,
  Eye,
  Terminal,
  Play,
  Square,
  List,
  ListChecks,
  Wifi,
  CircleX,
  Wrench,
  BarChart3,
  AlertTriangle,
  FileSearch,
  Coins,
  Blocks,
  type LucideIcon,
} from "@/components/ui/icons";
import { resolveRuntimeToolTag, RUNTIME_TOOL_TAGS } from "@/lib/tools/toolPresentation";
import { useI18n } from "@/lib/i18n";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import supabaseLogo from "../../../assets/logo-supabase-icon.svg";
import pocketbaseLogo from "../../../assets/logo-pocketbase-icon.svg";
import { cn } from "@/lib/utils";

const SupabaseIcon = ({
  size,
  className,
}: {
  size?: number;
  className?: string;
}) => (
  <img loading="lazy" decoding="async"
    src={supabaseLogo}
    alt="Supabase"
    className={cn("brightness-0 dark:invert opacity-80", className)}
    style={{ width: size || 14, height: size || 14 }}
  />
);

const PocketBaseIcon = ({
  size,
  className,
}: {
  size?: number;
  className?: string;
}) => (
  <span
    className={cn("inline-flex items-center justify-center", className)}
    style={{ width: size || 14, height: size || 14 }}
  >
    <img loading="lazy" decoding="async"
      src={pocketbaseLogo}
      alt="PocketBase"
      className="brightness-0 dark:invert opacity-80 object-contain w-full h-full"
    />
  </span>
);

export interface ToolMetaEntry {
  icon: LucideIcon;
  label: string;
  pendingLabel?: string;
  color: string;
}

/** Maps a custom tag name to its icon, label (finished), pendingLabel (in-progress), and color */
export const TOOL_META: Record<string, ToolMetaEntry> = {
  "vibes-write": {
    icon: Pencil,
    label: "Escrito",
    pendingLabel: "Escribiendo",
    color: "text-blue-500",
  },
  "vibes-edit": {
    icon: Pencil,
    label: "Editado",
    pendingLabel: "Editando",
    color: "text-amber-500",
  },
  "vibes-search-replace": {
    icon: Pencil,
    label: "Reemplazado",
    pendingLabel: "Reemplazando",
    color: "text-amber-500",
  },
  "vibes-patch": {
    icon: Scissors,
    label: "Parcheado",
    pendingLabel: "Parcheando",
    color: "text-teal-500",
  },
  "vibes-rename": {
    icon: ArrowRightLeft,
    label: "Renombrado",
    pendingLabel: "Renombrando",
    color: "text-indigo-500",
  },
  "vibes-delete": {
    icon: Trash2,
    label: "Eliminado",
    pendingLabel: "Eliminando",
    color: "text-red-500",
  },
  "vibes-read": {
    icon: Eye,
    label: "Leído",
    pendingLabel: "Leyendo",
    color: "text-cyan-500",
  },
  "vibes-grep": {
    icon: Search,
    label: "Grep",
    pendingLabel: "Buscando",
    color: "text-green-500",
  },
  "vibes-code-search": {
    icon: Code,
    label: "Búsqueda",
    pendingLabel: "Buscando código",
    color: "text-green-500",
  },
  "vibes-code-search-result": {
    icon: Code,
    label: "Resultado",
    color: "text-green-500",
  },
  "vibes-list-files": {
    icon: FolderOpen,
    label: "Listado",
    pendingLabel: "Listando",
    color: "text-slate-500",
  },

  "vibes-web-crawl": {
    icon: Globe,
    label: "Búsqueda web",
    pendingLabel: "Buscando web",
    color: "text-blue-500",
  },
  "vibes-add-dependency": {
    icon: Package,
    label: "Dependencia",
    pendingLabel: "Instalando",
    color: "text-purple-500",
  },
  "vibes-add-integration": {
    icon: Wrench,
    label: "Integración",
    pendingLabel: "Integrando",
    color: "text-purple-500",
  },
  "vibes-execute-sql": {
    icon: Database,
    label: "SQL",
    pendingLabel: "Ejecutando SQL",
    color: "text-orange-500",
  },
  "vibes-read-logs": {
    icon: ScrollText,
    label: "Logs",
    pendingLabel: "Leyendo logs",
    color: "text-muted-foreground",
  },
  "vibes-codebase-context": {
    icon: FileText,
    label: "Contexto",
    pendingLabel: "Cargando contexto",
    color: "text-cyan-500",
  },
  "vibes-database-schema": {
    icon: Database,
    label: "Esquema BD",
    pendingLabel: "Cargando esquema",
    color: "text-orange-500",
  },
  "vibes-supabase-table-schema": {
    icon: SupabaseIcon as any,
    label: "Tabla",
    pendingLabel: "Cargando tabla",
    color: "",
  },
  "vibes-supabase-project-info": {
    icon: SupabaseIcon as any,
    label: "Supabase",
    pendingLabel: "Cargando Supabase",
    color: "",
  },
  "vibes-pocketbase-info": {
    icon: PocketBaseIcon as any,
    label: "PocketBase",
    pendingLabel: "Cargando PocketBase",
    color: "",
  },
  "vibes-pocketbase-storage-info": {
    icon: PocketBaseIcon as any,
    label: "PocketBase Storage",
    pendingLabel: "Cargando Storage",
    color: "",
  },
  "vibes-bunny-db-info": {
    icon: Database,
    label: "Bunny DB",
    pendingLabel: "Cargando Bunny DB",
    color: "text-orange-500",
  },
  "vibes-bunny-storage-info": {
    icon: FolderOpen,
    label: "Bunny Storage",
    pendingLabel: "Cargando Storage",
    color: "text-orange-500",
  },
  "vibes-status": {
    icon: BarChart3,
    label: "Estado",
    pendingLabel: "Comprobando",
    color: "text-blue-500",
  },
  "vibes-mcp-tool-call": {
    icon: Blocks,
    label: "MCP",
    pendingLabel: "Ejecutando herramienta",
    color: "text-purple-500",
  },

  "vibes-question": {
    icon: MessageCircleQuestion,
    label: "Pregunta",
    pendingLabel: "Esperando respuesta",
    color: "text-violet-500",
  },
  "vibes-todo": {
    icon: ListChecks,
    label: "Tareas",
    pendingLabel: "Actualizando tareas",
    color: "text-sky-500",
  },

  think: {
    icon: Brain,
    label: "Pensamiento",
    pendingLabel: "Trabajando",
    color: "text-purple-500",
  },
  thought: {
    icon: Brain,
    label: "Pensamiento",
    pendingLabel: "Trabajando",
    color: "text-purple-500",
  },
  "vibes-think": {
    icon: Brain,
    label: "Pensamiento",
    pendingLabel: "Trabajando",
    color: "text-purple-500",
  },
  "vibes-git": {
    icon: GitBranch,
    label: "Git",
    pendingLabel: "Ejecutando Git",
    color: "text-orange-500",
  },
  "vibes-ask-user": {
    icon: MessageCircleQuestion,
    label: "Pregunta",
    pendingLabel: "Esperando respuesta del usuario",
    color: "text-violet-500",
  },
  "vibes-run-command": {
    icon: Terminal,
    label: "Comando",
    pendingLabel: "Ejecutando",
    color: "text-emerald-600 dark:text-lime-500",
  },
  "vibes-start-process": {
    icon: Play,
    label: "Proceso",
    pendingLabel: "Iniciando proceso",
    color: "text-green-500",
  },
  "vibes-stop-process": {
    icon: Square,
    label: "Detenido",
    pendingLabel: "Deteniendo proceso",
    color: "text-red-500",
  },
  "vibes-list-processes": {
    icon: List,
    label: "Procesos",
    pendingLabel: "Listando procesos",
    color: "text-slate-500",
  },
  "vibes-wait-http": {
    icon: Wifi,
    label: "HTTP Check",
    pendingLabel: "Esperando HTTP",
    color: "text-cyan-500",
  },
  "vibes-typecheck-summary": {
    icon: FileSearch,
    label: "TSC",
    color: "text-emerald-500",
  },
  "vibes-token-usage": {
    icon: Coins,
    label: "Uso de Tokens",
    color: "text-amber-500",
  },
  "vibes-vision": {
    icon: Eye,
    label: "Visión",
    pendingLabel: "Analizando la imagen",
    color: "text-indigo-400",
  },
};

/** Map text-* color to its bg-* equivalent (static strings so Tailwind JIT doesn't purge them) */
const TEXT_TO_BG: Record<string, string> = {
  "text-blue-500": "bg-blue-500",
  "text-amber-500": "bg-amber-500",
  "text-indigo-500": "bg-indigo-500",
  "text-red-500": "bg-red-500",
  "text-cyan-500": "bg-cyan-500",
  "text-green-500": "bg-green-500",
  "text-slate-500": "bg-slate-500",
  "text-purple-500": "bg-purple-500",
  "text-orange-500": "bg-orange-500",
  "text-muted-foreground": "bg-gray-500",
  "text-emerald-500": "bg-emerald-500",
  "text-violet-500": "bg-violet-500",
  "text-teal-500": "bg-teal-500",
  "text-sky-500": "bg-sky-500",
  "text-emerald-600 dark:text-lime-500": "bg-lime-500",
  "text-amber-600 dark:text-yellow-500": "bg-yellow-500",
};

export function getBgColorClass(textColorClass: string): string | undefined {
  return TEXT_TO_BG[textColorClass];
}

/** Format token count: 1234 → "1.2K", 12345 → "12.3K", 123456 → "123K" */
export function formatTokenCount(count: number): string {
  if (count < 1000) return String(count);
  if (count < 10000) return `${(count / 1000).toFixed(1)}K`;
  if (count < 1000000) return `${Math.round(count / 1000)}K`;
  return `${(count / 1000000).toFixed(1)}M`;
}

/** Format price cost: $0.12345 → "$0.1234" */
export function formatPriceCost(costUsd: number): string {
  if (costUsd === 0) return "$0";
  if (costUsd < 0.0001) return "<$0.0001";
  // For larger values like 1.25, toFixed(2) works best. But for 0.00361, we need more.
  // Strip trailing zeros after decimal if any.
  return (
    "$" +
    costUsd.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    })
  );
}

export type ToolBadgeState = "pending" | "finished" | "aborted";

interface CompactToolBadgeProps {
  tag: string;
  state: ToolBadgeState;
  /** Short description for the pending state, e.g. "archivo.tsx" */
  detail?: string;
  /** The original rendered content to show in the modal */
  originalContent: React.ReactNode;
  attributes?: Record<string, string>;
}

/**
 * Compact tool badge:
 * - PENDING: full-width row with spinning icon + label + detail
 * - FINISHED: small icon badge (inline-flex) — click opens modal with original content
 * - ABORTED: small red icon badge
 */
export const CompactToolBadge: React.FC<CompactToolBadgeProps> = React.memo(
  ({ tag, state, detail, originalContent, attributes }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const meta = resolveToolMeta(tag, attributes);
    const Icon = meta.icon;

    // #168 — Descripción canónica de la tool (i18n) para el modal. Se resuelve
    // el toolId desde el tag vía la fuente única (incluido el upgrade
    // retroactivo de badges viejos grabados como vibes-mcp-tool-call).
    const resolvedToolId =
      Object.entries(RUNTIME_TOOL_TAGS).find(([, t]) => t === tag)?.[0] ??
      (tag === "vibes-mcp-tool-call" && attributes?.tool
        ? resolveRuntimeToolTag(attributes.tool)
          ? attributes.tool
          : undefined
        : undefined);
    const { t, toolDescription } = useI18n();
    const description = resolvedToolId
      ? toolDescription(resolvedToolId)
      : "";

    // Pending state: no inline badge — the streaming loader handles this
    if (state === "pending") {
      return null;
    }

    if (state === "aborted") {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-red-500/10 cursor-default">
              <CircleX size={14} className="text-red-500" />
            </div>
          </TooltipTrigger>
          <TooltipContent>{toolLabel(meta.label, t)} — {t("badges.notFinished")}</TooltipContent>
        </Tooltip>
      );
    }

    // finished state
    return (
      <>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-muted hover:bg-accent transition-colors cursor-pointer"
            >
              <Icon size={14} className={meta.color} />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            {toolLabel(meta.label, t)}
            {detail ? ` · ${detail}` : ""}
          </TooltipContent>
        </Tooltip>

        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="sm:max-w-6xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className={`flex items-center gap-2 ${meta.color}`}>
                <Icon size={20} />
                {toolLabel(meta.label, t)}
                {detail && (
                  <span className="typo-caption ml-1 text-muted-foreground">
                    {detail}
                  </span>
                )}
              </DialogTitle>
            </DialogHeader>
            {description && (
              <p className="typo-caption text-muted-foreground -mt-2">
                {description}
              </p>
            )}
            <div className="mt-2 overflow-hidden min-w-0">
              {originalContent}
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  },
);

/**
 * Maps a TOOL_META Spanish label to its i18n key (badges.*), falling back
 * to the raw label when no translation exists.
 */
const TOOL_LABEL_KEYS: Record<string, string> = {
  Escrito: "badges.written",
  Escribiendo: "badges.writing",
  Editado: "badges.edited",
  Editando: "badges.editing",
  Reemplazado: "badges.replaced",
  Reemplazando: "badges.replacing",
  Parcheado: "badges.patched",
  Parcheando: "badges.patching",
  Renombrado: "badges.renamed",
  Renombrando: "badges.renaming",
  Eliminado: "badges.deleted",
  Eliminando: "badges.deleting",
  Leído: "badges.read",
  Leyendo: "badges.reading",
  Grep: "badges.grep",
  Buscando: "badges.searching",
  Búsqueda: "badges.search",
  "Buscando código": "badges.searchingCode",
  Resultado: "badges.result",
  Listado: "badges.listing",
  Listando: "badges.listing",
  "Búsqueda web": "badges.webSearch",
  "Buscando web": "badges.webSearching",
  Dependencia: "badges.dependency",
  Instalando: "badges.installing",
  Integración: "badges.integration",
  Integrando: "badges.integrating",
  SQL: "badges.sql",
  "Ejecutando SQL": "badges.sqlPending",
  Logs: "badges.logs",
  "Leyendo logs": "badges.logsPending",
  Contexto: "badges.context",
  "Cargando contexto": "badges.contextPending",
  "Esquema BD": "badges.schema",
  "Cargando esquema": "badges.schemaPending",
  Tabla: "badges.table",
  "Cargando tabla": "badges.tablePending",
  Supabase: "badges.supabase",
  "Cargando Supabase": "badges.supabasePending",
  PocketBase: "badges.pocketbase",
  "Cargando PocketBase": "badges.pocketbasePending",
  "PocketBase Storage": "badges.pocketbaseStorage",
  "Cargando Storage": "badges.pocketbaseStoragePending",
  "Bunny DB": "badges.bunnyDb",
  "Cargando Bunny DB": "badges.bunnyDbPending",
  "Bunny Storage": "badges.bunnyStorage",
  Estado: "badges.status",
  Comprobando: "badges.statusPending",
  MCP: "badges.mcp",
  "Ejecutando herramienta": "badges.mcpPending",
  Pregunta: "badges.question",
  "Esperando respuesta": "badges.questionPending",
  Tareas: "badges.todos",
  "Actualizando tareas": "badges.todosPending",
  Pensamiento: "badges.thinking",
  Trabajando: "badges.thinkingPending",
  Git: "badges.git",
  "Ejecutando Git": "badges.gitPending",
  "Esperando respuesta del usuario": "badges.askUserPending",
  Comando: "badges.command",
  Ejecutando: "badges.commandPending",
  Proceso: "badges.process",
  "Iniciando proceso": "badges.processPending",
  Detenido: "badges.stopped",
  "Deteniendo proceso": "badges.stopping",
  Procesos: "badges.processes",
  "Listando procesos": "badges.processesPending",
  "HTTP Check": "badges.httpCheck",
  "Esperando HTTP": "badges.httpCheckPending",
  "Uso de Tokens": "badges.tokenUsage",
  Visión: "badges.vision",
  "Analizando la imagen": "badges.visionPending",
  Info: "badges.info",
  "con errores": "badges.withErrors",
  "sin errores": "badges.noErrors",
};

function toolLabel(label: string, t: (k: string) => string): string {
  const key = TOOL_LABEL_KEYS[label];
  return key ? t(key) : label;
}

/** Returns true if this tag should be rendered as a compact tool badge */
export function isCompactableTag(tag: string): boolean {
  return tag in TOOL_META;
}

/** Tags that should NOT be compacted (they are direct user-facing content) */
const NON_COMPACTABLE_TAGS = new Set([
  "vibes-output",
  "vibes-problem-report",
  "vibes-chat-summary",
  "set_chat_summary",
  "vibes-command",
  "vibes-add-integration", // Interactive: contains setup buttons (e.g. Supabase)
  "vibes-ask-user", // Interactive: contains question + response options
  "vibes-cancelled", // Styled inline cancel indicator — not a tool badge
]);

export function shouldCompact(tag: string): boolean {
  return !NON_COMPACTABLE_TAGS.has(tag) && isCompactableTag(tag);
}

export function resolveToolMeta(
  tag: string,
  attributes?: Record<string, string>,
) {
  const defaultMeta = TOOL_META[tag] || {
    icon: Wrench,
    label: tag,
    color: "text-muted-foreground",
  };
  if (
    (tag === "vibes-read" ||
      tag === "vibes-delete" ||
      tag === "vibes-write" ||
      tag === "vibes-edit") &&
    attributes?.path?.includes(".git/")
  ) {
    return TOOL_META["vibes-git"];
  }
  // #168 — Upgrade retroactivo: los mensajes anteriores a la unificación
  // guardaron las tools built-in como `vibes-mcp-tool-call tool="list_dir"`.
  // Si el atributo tool= corresponde a una tool del catálogo, resolvemos su
  // meta real (icono/label/color) en vez de mostrar el genérico "MCP".
  if (tag === "vibes-mcp-tool-call" && attributes?.tool) {
    const realTag = resolveRuntimeToolTag(attributes.tool);
    if (realTag && realTag !== "vibes-mcp-tool-call") {
      const upgraded = TOOL_META[realTag];
      if (upgraded) return upgraded;
    }
  }
  return defaultMeta;
}

/** Extract a short detail string from tag attributes */
export function getToolDetail(
  tag: string,
  attributes: Record<string, string>,
): string | undefined {
  switch (tag) {
    case "vibes-write":
    case "vibes-edit":
    case "vibes-search-replace":
    case "vibes-read":
    case "vibes-delete":
    case "vibes-patch": {
      const path = attributes.path || "";
      if (path.includes(".git/")) return undefined; // No label for git internal files
      return path ? path.split("/").pop() : undefined;
    }
    case "vibes-rename":
      return attributes.to ? attributes.to.split("/").pop() : undefined;
    case "vibes-grep":
      return attributes.query ? `"${attributes.query}"` : undefined;
    case "vibes-code-search":
      return attributes.query ? `"${attributes.query}"` : undefined;
    case "vibes-web-crawl":
      return attributes.url || attributes.query
        ? attributes.url || `"${attributes.query}"`
        : undefined;

    case "vibes-add-dependency":
      return attributes.packages || undefined;
    case "vibes-execute-sql":
      return attributes.description || undefined;
    case "vibes-list-files":
      return attributes.directory || undefined;
    case "vibes-status":
      return attributes.title || undefined;
    case "vibes-git":
      return undefined;
    case "vibes-ask-user":
      return attributes.question || undefined;
    case "vibes-run-command":
      return attributes.cmd || undefined;
    case "vibes-start-process":
      return attributes.cmd || undefined;
    case "vibes-stop-process":
      return attributes["process-id"] || undefined;
    case "vibes-mcp-tool-call":
      return attributes.tool || attributes.server || undefined;
    case "vibes-wait-http":
      return attributes.url || undefined;
    case "vibes-pocketbase-info":
      return attributes.collection || "Info";
    case "vibes-pocketbase-storage-info":
      return attributes.collection || "Storage";
    case "vibes-typecheck-summary": {
      const hasErr = attributes["has-errors"] === "true";
      return hasErr ? "con errores" : "sin errores";
    }
    case "vibes-token-usage": {
      const inp = parseInt(attributes.input || "0", 10);
      const out = parseInt(attributes.output || "0", 10);
      const cached = parseInt(attributes.cached || "0", 10);
      const webSearches = parseInt(attributes["web-searches"] || "0", 10);

      // Path 1: direct cost from OpenCode (ground truth — matches OpenCode's own UI)
      const directCostStr = attributes["cost"];
      if (directCostStr) {
        const directCost = parseFloat(directCostStr);
        if (!isNaN(directCost)) {
          return formatPriceCost(directCost);
        }
      }

      // Path 2: legacy — compute from token counts × OpenRouter price
      const priceIn = parseFloat(attributes["price-input"] || "0");
      const priceOut = parseFloat(attributes["price-output"] || "0");

      if (priceIn > 0 || priceOut > 0 || webSearches > 0) {
        const costInput = (inp - cached) * priceIn;
        const costCached = cached * priceIn * 0.5;
        const costOutput = out * priceOut;
        const costWebSearches = webSearches * 0.02;
        const costTotal = costInput + costCached + costOutput + costWebSearches;
        return formatPriceCost(costTotal);
      }

      // Fallback si no hay tarifa registrada
      return `${formatTokenCount(inp + out)}`;
    }
    default:
      return undefined;
  }
}
