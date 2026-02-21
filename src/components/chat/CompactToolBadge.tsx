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
    Wifi,
    CircleX,
    Wrench,
    BarChart3,
    AlertTriangle,
    type LucideIcon,
} from "lucide-react";
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

export interface ToolMetaEntry {
    icon: LucideIcon;
    label: string;
    pendingLabel?: string;
    color: string;
}

/** Maps a custom tag name to its icon, label (finished), pendingLabel (in-progress), and color */
export const TOOL_META: Record<string, ToolMetaEntry> = {
    "dyad-write": { icon: Pencil, label: "Escrito", pendingLabel: "Escribiendo", color: "text-blue-500" },
    "dyad-edit": { icon: Pencil, label: "Editado", pendingLabel: "Editando", color: "text-amber-500" },
    "dyad-search-replace": { icon: Pencil, label: "Reemplazado", pendingLabel: "Reemplazando", color: "text-amber-500" },
    "dyad-patch": { icon: Scissors, label: "Parcheado", pendingLabel: "Parcheando", color: "text-teal-500" },
    "dyad-rename": { icon: ArrowRightLeft, label: "Renombrado", pendingLabel: "Renombrando", color: "text-indigo-500" },
    "dyad-delete": { icon: Trash2, label: "Eliminado", pendingLabel: "Eliminando", color: "text-red-500" },
    "dyad-read": { icon: Eye, label: "Leído", pendingLabel: "Leyendo", color: "text-cyan-500" },
    "dyad-grep": { icon: Search, label: "Grep", pendingLabel: "Buscando", color: "text-green-500" },
    "dyad-code-search": { icon: Code, label: "Búsqueda", pendingLabel: "Buscando código", color: "text-green-500" },
    "dyad-code-search-result": { icon: Code, label: "Resultado", color: "text-green-500" },
    "dyad-list-files": { icon: FolderOpen, label: "Listado", pendingLabel: "Listando", color: "text-slate-500" },
    "dyad-web-search": { icon: Globe, label: "Web", pendingLabel: "Buscando en web", color: "text-blue-500" },
    "dyad-web-search-result": { icon: Globe, label: "Web", color: "text-blue-500" },
    "dyad-web-crawl": { icon: Globe, label: "Crawl", pendingLabel: "Crawleando", color: "text-blue-500" },
    "dyad-add-dependency": { icon: Package, label: "Dependencia", pendingLabel: "Instalando", color: "text-purple-500" },
    "dyad-add-integration": { icon: Wrench, label: "Integración", pendingLabel: "Integrando", color: "text-purple-500" },
    "dyad-execute-sql": { icon: Database, label: "SQL", pendingLabel: "Ejecutando SQL", color: "text-orange-500" },
    "dyad-read-logs": { icon: ScrollText, label: "Logs", pendingLabel: "Leyendo logs", color: "text-gray-500" },
    "dyad-codebase-context": { icon: FileText, label: "Contexto", pendingLabel: "Cargando contexto", color: "text-cyan-500" },
    "dyad-database-schema": { icon: Database, label: "Esquema BD", pendingLabel: "Cargando esquema", color: "text-orange-500" },
    "dyad-supabase-table-schema": { icon: Database, label: "Tabla", pendingLabel: "Cargando tabla", color: "text-emerald-500" },
    "dyad-supabase-project-info": { icon: Database, label: "Supabase", pendingLabel: "Cargando Supabase", color: "text-emerald-500" },
    "dyad-status": { icon: BarChart3, label: "Estado", pendingLabel: "Comprobando", color: "text-blue-500" },
    "dyad-mcp-tool-call": { icon: Wrench, label: "Herramienta", pendingLabel: "Ejecutando herramienta", color: "text-purple-500" },
    "dyad-mcp-tool-result": { icon: Wrench, label: "Resultado", color: "text-purple-500" },
    "think": { icon: Brain, label: "Pensamiento", pendingLabel: "Pensando", color: "text-purple-500" },
    "thought": { icon: Brain, label: "Pensamiento", pendingLabel: "Pensando", color: "text-purple-500" },
    "dyad-think": { icon: Brain, label: "Pensamiento", pendingLabel: "Pensando", color: "text-purple-500" },
    "dyad-git": { icon: GitBranch, label: "Git", pendingLabel: "Ejecutando Git", color: "text-orange-500" },
    "dyad-ask-user": { icon: MessageCircleQuestion, label: "Pregunta", pendingLabel: "Esperando respuesta", color: "text-violet-500" },
    "dyad-run-command": { icon: Terminal, label: "Comando", pendingLabel: "Ejecutando", color: "text-lime-500" },
    "dyad-start-process": { icon: Play, label: "Proceso", pendingLabel: "Iniciando proceso", color: "text-green-500" },
    "dyad-stop-process": { icon: Square, label: "Detenido", pendingLabel: "Deteniendo proceso", color: "text-red-500" },
    "dyad-list-processes": { icon: List, label: "Procesos", pendingLabel: "Listando procesos", color: "text-slate-500" },
    "dyad-wait-http": { icon: Wifi, label: "HTTP Check", pendingLabel: "Esperando HTTP", color: "text-cyan-500" },
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
    "text-gray-500": "bg-gray-500",
    "text-emerald-500": "bg-emerald-500",
    "text-violet-500": "bg-violet-500",
    "text-teal-500": "bg-teal-500",
    "text-lime-500": "bg-lime-500",
};

export function getBgColorClass(textColorClass: string): string | undefined {
    return TEXT_TO_BG[textColorClass];
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
export const CompactToolBadge: React.FC<CompactToolBadgeProps> = ({
    tag,
    state,
    detail,
    originalContent,
    attributes,
}) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const meta = resolveToolMeta(tag, attributes);
    const Icon = meta.icon;

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
                <TooltipContent>{meta.label} — no terminado</TooltipContent>
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
                <TooltipContent>{meta.label}{detail ? ` · ${detail}` : ""}</TooltipContent>
            </Tooltip>

            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="sm:max-w-6xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className={`flex items-center gap-2 ${meta.color}`}>
                            <Icon size={20} />
                            {meta.label}
                            {detail && <span className="text-muted-foreground font-normal text-sm ml-1">{detail}</span>}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="mt-2 overflow-hidden min-w-0">{originalContent}</div>
                </DialogContent>
            </Dialog>
        </>
    );
};

/** Returns true if this tag should be rendered as a compact tool badge */
export function isCompactableTag(tag: string): boolean {
    return tag in TOOL_META;
}

/** Tags that should NOT be compacted (they are direct user-facing content) */
const NON_COMPACTABLE_TAGS = new Set([
    "dyad-output",
    "dyad-problem-report",
    "dyad-chat-summary",
    "dyad-command",
]);

export function shouldCompact(tag: string): boolean {
    return !NON_COMPACTABLE_TAGS.has(tag) && isCompactableTag(tag);
}

export function resolveToolMeta(tag: string, attributes?: Record<string, string>) {
    const defaultMeta = TOOL_META[tag] || { icon: Wrench, label: tag, color: "text-gray-500" };
    if ((tag === "dyad-read" || tag === "dyad-delete" || tag === "dyad-write" || tag === "dyad-edit") && attributes?.path?.includes(".git/")) {
        return TOOL_META["dyad-git"];
    }
    return defaultMeta;
}

/** Extract a short detail string from tag attributes */
export function getToolDetail(tag: string, attributes: Record<string, string>): string | undefined {
    switch (tag) {
        case "dyad-write":
        case "dyad-edit":
        case "dyad-search-replace":
        case "dyad-read":
        case "dyad-delete":
        case "dyad-patch": {
            const path = attributes.path || "";
            if (path.includes(".git/")) return undefined; // No label for git internal files
            return path ? path.split("/").pop() : undefined;
        }
        case "dyad-rename":
            return attributes.to ? attributes.to.split("/").pop() : undefined;
        case "dyad-grep":
            return attributes.query ? `"${attributes.query}"` : undefined;
        case "dyad-code-search":
            return attributes.query ? `"${attributes.query}"` : undefined;
        case "dyad-web-search":
            return attributes.query || undefined;
        case "dyad-add-dependency":
            return attributes.packages || undefined;
        case "dyad-execute-sql":
            return attributes.description || undefined;
        case "dyad-list-files":
            return attributes.directory || undefined;
        case "dyad-status":
            return attributes.title || undefined;
        case "dyad-git":
            return undefined;
        case "dyad-ask-user":
            return attributes.question || undefined;
        case "dyad-run-command":
            return attributes.cmd || undefined;
        case "dyad-start-process":
            return attributes.cmd || undefined;
        case "dyad-stop-process":
            return attributes["process-id"] || undefined;
        case "dyad-wait-http":
            return attributes.url || undefined;
        default:
            return undefined;
    }
}
