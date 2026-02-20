import React, { useState } from "react";
import {
    Brain,
    GitBranch,
    Pencil,
    FileText,
    Search,
    Trash2,
    ArrowRightLeft,
    Package,
    Database,
    ScrollText,
    Globe,
    Code,
    FolderOpen,
    Eye,
    Loader,
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

/** Maps a custom tag name to its icon, label, and color */
export const TOOL_META: Record<string, { icon: LucideIcon; label: string; color: string }> = {
    "dyad-write": { icon: Pencil, label: "Escribir", color: "text-blue-500" },
    "dyad-edit": { icon: Pencil, label: "Editar", color: "text-amber-500" },
    "dyad-search-replace": { icon: Pencil, label: "Buscar/Reemplazar", color: "text-amber-500" },
    "dyad-rename": { icon: ArrowRightLeft, label: "Renombrar", color: "text-indigo-500" },
    "dyad-delete": { icon: Trash2, label: "Eliminar", color: "text-red-500" },
    "dyad-read": { icon: Eye, label: "Leer", color: "text-cyan-500" },
    "dyad-grep": { icon: Search, label: "Grep", color: "text-green-500" },
    "dyad-code-search": { icon: Code, label: "Buscar código", color: "text-green-500" },
    "dyad-code-search-result": { icon: Code, label: "Resultado", color: "text-green-500" },
    "dyad-list-files": { icon: FolderOpen, label: "Listar", color: "text-slate-500" },
    "dyad-web-search": { icon: Globe, label: "Web", color: "text-blue-500" },
    "dyad-web-search-result": { icon: Globe, label: "Web", color: "text-blue-500" },
    "dyad-web-crawl": { icon: Globe, label: "Crawl", color: "text-blue-500" },
    "dyad-add-dependency": { icon: Package, label: "Dependencia", color: "text-purple-500" },
    "dyad-add-integration": { icon: Wrench, label: "Integración", color: "text-purple-500" },
    "dyad-execute-sql": { icon: Database, label: "SQL", color: "text-orange-500" },
    "dyad-read-logs": { icon: ScrollText, label: "Logs", color: "text-gray-500" },
    "dyad-codebase-context": { icon: FileText, label: "Contexto", color: "text-cyan-500" },
    "dyad-database-schema": { icon: Database, label: "Esquema BD", color: "text-orange-500" },
    "dyad-supabase-table-schema": { icon: Database, label: "Tabla", color: "text-emerald-500" },
    "dyad-supabase-project-info": { icon: Database, label: "Supabase", color: "text-emerald-500" },
    "dyad-status": { icon: BarChart3, label: "Estado", color: "text-blue-500" },
    "dyad-mcp-tool-call": { icon: Wrench, label: "Herramienta", color: "text-purple-500" },
    "dyad-mcp-tool-result": { icon: Wrench, label: "Resultado", color: "text-purple-500" },
    "think": { icon: Brain, label: "Pensamiento", color: "text-purple-500" },
    "dyad-think": { icon: Brain, label: "Pensamiento", color: "text-purple-500" },
    "dyad-git": { icon: GitBranch, label: "Git", color: "text-orange-500" },
};

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

    if (state === "pending") {
        return (
            <div className="flex items-center gap-2 py-1.5 my-0.5">
                <Loader size={15} className={`${meta.color} animate-spin flex-shrink-0`} />
                <span className={`text-sm font-medium ${meta.color}`}>
                    {meta.label}
                    {detail && <span className="text-muted-foreground font-normal ml-1">{detail}</span>}
                </span>
            </div>
        );
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
        case "dyad-delete": {
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
        default:
            return undefined;
    }
}
