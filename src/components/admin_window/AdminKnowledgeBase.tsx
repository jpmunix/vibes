/**
 * Admin — Base de conocimientos.
 * Shows memories, knowledge entries, telemetry and pipeline logs
 * per user per app, using the same recursive table viewer as user settings.
 */
import { useState, useEffect, useCallback } from "react";
import { ipc } from "@/ipc/types";
import {
    Loader2,
    ChevronRight,
    Download,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { SettingsTable } from "@/components/admin_window/RecursiveTableViewer";

// ── Types ───────────────────────────────────────────────────────────────────

interface AppData {
    appId: number;
    appName: string;
    memories: Record<string, unknown>[];
    knowledgeEntries: Record<string, unknown>[];
    pipelineLogs: Record<string, unknown>[];
    telemetry: Record<string, unknown>[];
}

interface UserData {
    userId: string;
    displayName: string;
    email: string;
    apps: AppData[];
}

// ── Download helper ─────────────────────────────────────────────────────────

function downloadFile(filename: string, content: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ── Section config ──────────────────────────────────────────────────────────

const SECTIONS = [
    { key: "memories" as const, label: "Memorias" },
    { key: "knowledgeEntries" as const, label: "Entradas de conocimiento" },
    { key: "pipelineLogs" as const, label: "Pipeline logs" },
    { key: "telemetry" as const, label: "Telemetría" },
] as const;

// ── Main component ──────────────────────────────────────────────────────────

export function AdminKnowledgeBase() {
    const [data, setData] = useState<UserData[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
    const [expandedAppId, setExpandedAppId] = useState<number | null>(null);
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const result = await ipc.admin.getKnowledgeStats({});
            setData(result.users.filter((u) => u.apps.length > 0));
        } catch (err: any) {
            toast.error(err.message || "Error al cargar datos de conocimiento");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const toggleUser = (userId: string) => {
        setExpandedUserId((prev) => (prev === userId ? null : userId));
        setExpandedAppId(null);
        setExpandedSections(new Set());
    };

    const toggleApp = (appId: number) => {
        setExpandedAppId((prev) => (prev === appId ? null : appId));
        setExpandedSections(new Set());
    };

    const toggleSection = (sectionKey: string) => {
        setExpandedSections((prev) => {
            const next = new Set(prev);
            if (next.has(sectionKey)) next.delete(sectionKey);
            else next.add(sectionKey);
            return next;
        });
    };

    const handleDownloadAppData = (app: AppData, displayName: string) => {
        const safeName = displayName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
        const safeApp = app.appName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
        const payload = {
            memories: app.memories,
            knowledgeEntries: app.knowledgeEntries,
            pipelineLogs: app.pipelineLogs,
            telemetry: app.telemetry,
        };
        downloadFile(`${safeName}-${safeApp}-knowledge.json`, JSON.stringify(payload, null, 2), "application/json");
        toast.success(`Datos de ${app.appName} descargados`);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 size={24} className="animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="p-8 w-full mx-auto space-y-8">
            <div className="bg-card rounded-2xl shadow-sm p-8 border border-border">
                <div className="mb-8">
                    <h2 className="typo-section-title">Base de conocimientos</h2>
                    <p className="typo-caption mt-1">
                        Memorias, entradas de conocimiento, telemetría y pipeline logs por usuario y aplicación
                    </p>
                </div>

                <div className="space-y-4">
                    {data.length === 0 ? (
                        <p className="typo-caption text-muted-foreground">
                            No hay datos de conocimiento registrados.
                        </p>
                    ) : (
                        data.map((user) => {
                            const isUserExpanded = expandedUserId === user.userId;
                            const totalItems = user.apps.reduce(
                                (s, a) => s + a.memories.length + a.knowledgeEntries.length + a.pipelineLogs.length + a.telemetry.length,
                                0,
                            );

                            return (
                                <div key={user.userId}>
                                    {/* User header */}
                                    <div
                                        className="flex items-center justify-between gap-8 p-4 rounded-xl border border-border hover:bg-muted/50 transition-colors cursor-pointer"
                                        onClick={() => toggleUser(user.userId)}
                                    >
                                        <div className="flex-1 min-w-0">
                                            <h3 className="typo-label truncate">{user.displayName}</h3>
                                            <p className="typo-caption mt-0.5">
                                                {user.apps.length} app{user.apps.length !== 1 ? "s" : ""}
                                                {" · "}
                                                {totalItems} registro{totalItems !== 1 ? "s" : ""} total{totalItems !== 1 ? "es" : ""}
                                            </p>
                                        </div>
                                        <ChevronRight
                                            className={cn(
                                                "size-5 text-muted-foreground/50 transition-transform duration-200 shrink-0",
                                                isUserExpanded && "rotate-90",
                                            )}
                                        />
                                    </div>

                                    {/* User's apps */}
                                    {isUserExpanded && (
                                        <div className="pl-8 mt-2 space-y-3 mb-4">
                                            {user.apps.map((app) => {
                                                const isAppExpanded = expandedAppId === app.appId;
                                                const appTotal = app.memories.length + app.knowledgeEntries.length + app.pipelineLogs.length + app.telemetry.length;

                                                return (
                                                    <div key={app.appId}>
                                                        {/* App header */}
                                                        <div
                                                            className="flex items-center justify-between gap-8 p-4 rounded-xl border border-border/50 hover:bg-muted/50 transition-colors cursor-pointer"
                                                            onClick={() => toggleApp(app.appId)}
                                                        >
                                                            <div className="flex-1 min-w-0">
                                                                <h4 className="typo-label truncate">{app.appName}</h4>
                                                                <p className="typo-caption mt-0.5">
                                                                    {app.memories.length} memorias
                                                                    {" · "}
                                                                    {app.knowledgeEntries.length} conocimiento
                                                                    {" · "}
                                                                    {app.pipelineLogs.length} logs
                                                                    {" · "}
                                                                    {app.telemetry.length} telemetría
                                                                </p>
                                                            </div>
                                                            <div className="flex items-center gap-1 shrink-0">
                                                                {appTotal > 0 && (
                                                                    <button
                                                                        type="button"
                                                                        className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleDownloadAppData(app, user.displayName);
                                                                        }}
                                                                        title="Descargar datos (.json)"
                                                                    >
                                                                        <Download size={14} />
                                                                    </button>
                                                                )}
                                                                <ChevronRight
                                                                    className={cn(
                                                                        "size-4 text-muted-foreground/50 transition-transform duration-200",
                                                                        isAppExpanded && "rotate-90",
                                                                    )}
                                                                />
                                                            </div>
                                                        </div>

                                                        {/* App sections — each one is an expandable table */}
                                                        {isAppExpanded && (
                                                            <div className="pl-4 mt-2 space-y-3 mb-2">
                                                                {SECTIONS.map(({ key, label }) => {
                                                                    const rows = app[key];
                                                                    const sectionId = `${app.appId}-${key}`;
                                                                    const isSectionExpanded = expandedSections.has(sectionId);

                                                                    return (
                                                                        <div key={key} className="rounded-xl border border-border/50 overflow-hidden">
                                                                            {/* Section header */}
                                                                            <div
                                                                                className="flex items-center justify-between px-4 py-2.5 border-b border-border/50 hover:bg-muted/30 cursor-pointer transition-colors"
                                                                                onClick={() => toggleSection(sectionId)}
                                                                            >
                                                                                <div className="flex items-center gap-1.5">
                                                                                    <ChevronRight
                                                                                        className={cn(
                                                                                            "size-3.5 text-muted-foreground/50 transition-transform duration-150 shrink-0",
                                                                                            isSectionExpanded && "rotate-90",
                                                                                        )}
                                                                                    />
                                                                                    <p className="typo-label">{label}</p>
                                                                                </div>
                                                                                <span className="typo-caption text-muted-foreground">
                                                                                    {rows.length} registro{rows.length !== 1 ? "s" : ""}
                                                                                </span>
                                                                            </div>

                                                                            {/* Rows rendered as recursive viewer */}
                                                                            {isSectionExpanded && (
                                                                                rows.length === 0 ? (
                                                                                    <div className="px-4 py-3">
                                                                                        <p className="typo-caption text-muted-foreground">Sin datos</p>
                                                                                    </div>
                                                                                ) : (
                                                                                    <SettingsTable
                                                                                        entries={rows.map((row, idx) => [`[${idx}]`, row])}
                                                                                    />
                                                                                )
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
