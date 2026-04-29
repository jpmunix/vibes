/**
 * Admin — API Keys overview.
 * Fetches all users' settings and extracts API keys / tokens / integrations,
 * grouped by user in collapsible SettingItem rows.
 */
import { useState, useEffect, useCallback } from "react";
import { ipc } from "@/ipc/types";
import {
    Loader2,
    ChevronRight,
    Copy,
    Download,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ── Types ───────────────────────────────────────────────────────────────────

interface KeyEntry {
    /** Category label (e.g. "OpenRouter", "GitHub", "Vercel") */
    category: string;
    /** Display label for the key */
    label: string;
    /** The actual value */
    value: string;
}

interface UserKeys {
    userId: string;
    displayName: string;
    email: string;
    keys: KeyEntry[];
}

// ── Key extraction from raw settings ────────────────────────────────────────

function extractKeys(settings: Record<string, unknown>): KeyEntry[] {
    const keys: KeyEntry[] = [];

    // OpenRouter keys
    const providerSettings = settings.providerSettings as Record<string, unknown> | undefined;
    if (providerSettings && typeof providerSettings === "object") {
        for (const [providerName, providerData] of Object.entries(providerSettings)) {
            if (providerData && typeof providerData === "object") {
                const pd = providerData as Record<string, unknown>;
                const providerKeys = pd.keys as unknown[];
                if (Array.isArray(providerKeys)) {
                    for (const keyObj of providerKeys) {
                        if (keyObj && typeof keyObj === "object") {
                            const k = keyObj as Record<string, unknown>;
                            const alias = (k.alias as string) || "sin alias";
                            const keyData = k.key as Record<string, unknown> | undefined;
                            const value = keyData?.value as string | undefined;
                            if (value) {
                                keys.push({
                                    category: providerName,
                                    label: alias,
                                    value,
                                });
                            }
                        }
                    }
                }
                // Selected key ID
                if (pd.selectedKeyId) {
                    keys.push({
                        category: providerName,
                        label: "Key activa",
                        value: String(pd.selectedKeyId),
                    });
                }
            }
        }
    }

    // GitHub token
    const githubToken = settings.githubAccessToken as Record<string, unknown> | undefined;
    if (githubToken?.value) {
        keys.push({ category: "GitHub", label: "Access Token", value: String(githubToken.value) });
    }

    // GitHub user
    const githubUser = settings.githubUser as Record<string, unknown> | undefined;
    if (githubUser?.email) {
        keys.push({ category: "GitHub", label: "Email", value: String(githubUser.email) });
    }

    // Vercel token
    const vercelToken = settings.vercelAccessToken as Record<string, unknown> | undefined;
    if (vercelToken?.value) {
        keys.push({ category: "Vercel", label: "Access Token", value: String(vercelToken.value) });
    }

    // Serper API key
    const serperKey = settings.serperApiKey as Record<string, unknown> | undefined;
    if (serperKey?.value) {
        keys.push({ category: "Serper", label: "API Key", value: String(serperKey.value) });
    }

    // Supabase
    const supabase = settings.supabase as Record<string, unknown> | undefined;
    if (supabase && typeof supabase === "object") {
        const orgs = supabase.organizations as Record<string, unknown> | undefined;
        if (orgs && Object.keys(orgs).length > 0) {
            for (const [orgId, orgData] of Object.entries(orgs)) {
                if (orgData && typeof orgData === "object") {
                    const org = orgData as Record<string, unknown>;
                    const token = org.accessToken as string | undefined;
                    if (token) {
                        keys.push({ category: "Supabase", label: `Org ${orgId}`, value: token });
                    }
                }
            }
        }
    }

    // Neon
    const neonToken = settings.neonAccessToken as Record<string, unknown> | undefined;
    if (neonToken?.value) {
        keys.push({ category: "Neon", label: "Access Token", value: String(neonToken.value) });
    }

    // Firebase
    const firebaseToken = settings.firebaseAccessToken as Record<string, unknown> | undefined;
    if (firebaseToken?.value) {
        keys.push({ category: "Firebase", label: "Access Token", value: String(firebaseToken.value) });
    }

    // Embeddings model (not a key, but relevant config)
    if (settings.embeddingsModel) {
        keys.push({ category: "Embeddings", label: "Modelo", value: String(settings.embeddingsModel) });
    }

    return keys;
}

// ── Export helpers ──────────────────────────────────────────────────────────

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

function groupByCategory(keys: KeyEntry[]): Map<string, KeyEntry[]> {
    const map = new Map<string, KeyEntry[]>();
    for (const key of keys) {
        if (!map.has(key.category)) map.set(key.category, []);
        map.get(key.category)!.push(key);
    }
    return map;
}

function generateMarkdown(data: UserKeys[]): string {
    const lines: string[] = [];
    const date = new Date().toLocaleDateString("es-ES", {
        day: "2-digit",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });

    lines.push("# API Keys — Exportación");
    lines.push("");
    lines.push(`> Generado el ${date}`);
    lines.push("");

    for (const user of data) {
        lines.push(`## ${user.displayName}`);
        lines.push("");
        lines.push(`- **Email:** ${user.email}`);
        lines.push(`- **ID:** \`${user.userId}\``);
        lines.push("");

        const categories = groupByCategory(user.keys);
        for (const [category, categoryKeys] of categories.entries()) {
            lines.push(`### ${category}`);
            lines.push("");
            lines.push("| Nombre | Valor |");
            lines.push("|--------|-------|");
            for (const k of categoryKeys) {
                lines.push(`| ${k.label} | \`${k.value}\` |`);
            }
            lines.push("");
        }

        lines.push("---");
        lines.push("");
    }

    return lines.join("\n");
}

// ── Main component ──────────────────────────────────────────────────────────

export function AdminApiKeys() {
    const [data, setData] = useState<UserKeys[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const result = await ipc.admin.getAllUsersSettings({});
            const extracted: UserKeys[] = result.usersSettings
                .map((u) => ({
                    userId: u.userId,
                    displayName: u.displayName,
                    email: u.email,
                    keys: u.settings ? extractKeys(u.settings) : [],
                }))
                .filter((u) => u.keys.length > 0);

            setData(extracted);
        } catch (err: any) {
            toast.error(err.message || "Error al cargar API keys");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const toggleExpand = (userId: string) => {
        setExpandedUserId((prev) => (prev === userId ? null : userId));
    };

    const handleCopy = async (value: string) => {
        await navigator.clipboard.writeText(value);
        toast.success("Copiado al portapapeles");
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
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h2 className="typo-section-title">API Keys</h2>
                        <p className="typo-caption mt-1">
                            Claves de integración y tokens de todos los usuarios
                        </p>
                    </div>
                    {data.length > 0 && (
                        <button
                            type="button"
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border hover:bg-muted/50 text-muted-foreground hover:text-foreground cursor-pointer transition-colors typo-caption"
                            onClick={() => {
                                const md = generateMarkdown(data);
                                downloadFile("api-keys.md", md, "text/markdown");
                                toast.success("api-keys.md descargado");
                            }}
                        >
                            <Download size={14} />
                            Exportar .md
                        </button>
                    )}
                </div>

                <div className="space-y-4">
                    {data.length === 0 ? (
                        <p className="typo-caption text-muted-foreground">
                            Ningún usuario tiene API keys configuradas.
                        </p>
                    ) : (
                        data.map((user) => {
                            const isExpanded = expandedUserId === user.userId;
                            const categories = groupByCategory(user.keys);

                            return (
                                <div key={user.userId}>
                                    {/* User header row */}
                                    <div
                                        className="flex items-center justify-between gap-8 p-4 rounded-xl border border-border hover:bg-muted/50 transition-colors cursor-pointer"
                                        onClick={() => toggleExpand(user.userId)}
                                    >
                                        <div className="flex-1 min-w-0">
                                            <h3 className="typo-label truncate">
                                                {user.displayName}
                                            </h3>
                                            <p className="typo-caption mt-0.5">
                                                {user.email} · {user.keys.length} clave{user.keys.length !== 1 ? "s" : ""}
                                            </p>
                                        </div>
                                        <ChevronRight
                                            className={cn(
                                                "size-5 text-muted-foreground/50 transition-transform duration-200 shrink-0",
                                                isExpanded && "rotate-90",
                                            )}
                                        />
                                    </div>

                                    {/* Expanded: keys grouped by category */}
                                    {isExpanded && (
                                        <div className="pl-8 mt-2 space-y-3 mb-4">
                                            {Array.from(categories.entries()).map(([category, categoryKeys]) => (
                                                <div key={category} className="rounded-xl border border-border/50 overflow-hidden">
                                                    {/* Category header */}
                                                    <div className="px-4 py-2 border-b border-border/30 bg-muted/20">
                                                        <span className="typo-caption font-medium text-muted-foreground uppercase tracking-wider">
                                                            {category}
                                                        </span>
                                                    </div>

                                                    {/* Keys table */}
                                                    <table className="w-full text-sm">
                                                        <tbody>
                                                            {categoryKeys.map((keyEntry, idx) => (
                                                                <tr
                                                                    key={idx}
                                                                    className="border-t border-border/20 first:border-t-0 hover:bg-muted/20 transition-colors"
                                                                >
                                                                    <td className="px-4 py-2.5 align-top text-left w-[160px]">
                                                                        <span className="typo-caption text-muted-foreground">
                                                                            {keyEntry.label}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-4 py-2.5 align-top text-right">
                                                                        <div className="flex items-center justify-end gap-2">
                                                                            <span className="typo-caption font-mono text-foreground/80 break-all select-all">
                                                                                {keyEntry.value}
                                                                            </span>
                                                                            <button
                                                                                type="button"
                                                                                className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer transition-colors shrink-0"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    handleCopy(keyEntry.value);
                                                                                }}
                                                                            >
                                                                                <Copy size={12} />
                                                                            </button>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            ))}
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
