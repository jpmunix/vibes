/**
 * Admin — API Keys overview.
 * Reads from `user_preferences` (KV table) and extracts API keys / tokens,
 * grouped by user in collapsible rows with inline editing.
 */
import { useState, useEffect, useCallback } from "react";
import { ipc } from "@/ipc/types";
import {
    Loader2,
    ChevronRight,
    Copy,
    Download,
    Share2,
    Check,
    X,
    Pencil,
    Eye,
    EyeOff,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { AdminUser } from "@/ipc/types/admin";

// ── Types ───────────────────────────────────────────────────────────────────

interface KeyEntry {
    /** Category label (e.g. "OpenRouter", "GitHub", "Vercel") */
    category: string;
    /** Display label for the key */
    label: string;
    /** The actual value */
    value: string;
    /** The preference key in the KV store (for editing) */
    prefKey: string;
    /** JSON path within the preference value (for nested keys) */
    jsonPath?: string;
}

interface UserKeys {
    userId: string;
    displayName: string;
    email: string;
    keys: KeyEntry[];
}

// ── Key extraction from KV preferences ──────────────────────────────────────

function extractKeysFromPrefs(prefs: { key: string; value: string }[]): KeyEntry[] {
    const keys: KeyEntry[] = [];
    const prefsMap = new Map(prefs.map((p) => [p.key, p.value]));

    // Provider settings (OpenRouter keys, apiKeys for other providers)
    const providerSettingsRaw = prefsMap.get("providerSettings");
    if (providerSettingsRaw) {
        try {
            const providerSettings = JSON.parse(providerSettingsRaw);
            if (typeof providerSettings === "object" && providerSettings !== null) {
                for (const [providerName, providerData] of Object.entries(providerSettings)) {
                    if (providerData && typeof providerData === "object") {
                        const pd = providerData as Record<string, unknown>;

                        // Array of keys (OpenRouter style)
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
                                            prefKey: "providerSettings",
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
                                prefKey: "providerSettings",
                            });
                        }

                        // Simple apiKey
                        const apiKey = pd.apiKey as Record<string, unknown> | undefined;
                        if (apiKey?.value) {
                            keys.push({
                                category: providerName,
                                label: "API Key",
                                value: String(apiKey.value),
                                prefKey: "providerSettings",
                            });
                        }
                    }
                }
            }
        } catch { /* skip */ }
    }

    // GitHub token
    const githubToken = prefsMap.get("githubAccessToken");
    if (githubToken) {
        try {
            const parsed = JSON.parse(githubToken);
            if (parsed?.value) {
                keys.push({ category: "GitHub", label: "Access Token", value: String(parsed.value), prefKey: "githubAccessToken" });
            }
        } catch {
            if (githubToken.trim()) {
                keys.push({ category: "GitHub", label: "Access Token", value: githubToken, prefKey: "githubAccessToken" });
            }
        }
    }

    // GitHub user
    const githubUser = prefsMap.get("githubUser");
    if (githubUser) {
        try {
            const parsed = JSON.parse(githubUser);
            if (parsed?.email) {
                keys.push({ category: "GitHub", label: "Email", value: String(parsed.email), prefKey: "githubUser" });
            }
        } catch { /* skip */ }
    }

    // Vercel token
    const vercelToken = prefsMap.get("vercelAccessToken");
    if (vercelToken) {
        try {
            const parsed = JSON.parse(vercelToken);
            if (parsed?.value) {
                keys.push({ category: "Vercel", label: "Access Token", value: String(parsed.value), prefKey: "vercelAccessToken" });
            }
        } catch {
            if (vercelToken.trim()) {
                keys.push({ category: "Vercel", label: "Access Token", value: vercelToken, prefKey: "vercelAccessToken" });
            }
        }
    }

    // Supabase
    const supabaseRaw = prefsMap.get("supabase");
    if (supabaseRaw) {
        try {
            const supabase = JSON.parse(supabaseRaw);
            if (supabase?.organizations && typeof supabase.organizations === "object") {
                for (const [orgId, orgData] of Object.entries(supabase.organizations)) {
                    if (orgData && typeof orgData === "object") {
                        const org = orgData as Record<string, unknown>;
                        const token = org.accessToken as Record<string, unknown> | undefined;
                        const tokenValue = token?.value ?? token;
                        if (tokenValue && typeof tokenValue === "string") {
                            keys.push({ category: "Supabase", label: `Org ${orgId}`, value: tokenValue, prefKey: "supabase" });
                        }
                    }
                }
            }
        } catch { /* skip */ }
    }

    // Embeddings model
    const embModel = prefsMap.get("embeddingsModel");
    if (embModel) {
        const val = embModel.replace(/^"|"$/g, "");
        if (val) {
            keys.push({ category: "Embeddings", label: "Modelo", value: val, prefKey: "embeddingsModel" });
        }
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

function maskValue(value: string): string {
    if (value.length <= 8) return "••••••••";
    const start = value.slice(0, 6);
    const end = value.slice(-4);
    return `${start}${"•".repeat(Math.min(20, value.length - 10))}${end}`;
}

// ── Main component ──────────────────────────────────────────────────────────

export function AdminApiKeys() {
    const [data, setData] = useState<UserKeys[]>([]);
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            // Get all users first
            const usersResult = await ipc.admin.listUsers({});
            setUsers(usersResult.users);

            // Get preferences for each user in parallel
            const results = await Promise.all(
                usersResult.users.map(async (user) => {
                    try {
                        const result = await ipc.admin.getUserPreferences({ userId: user.id });
                        return {
                            userId: user.id,
                            displayName: user.displayName,
                            email: user.email,
                            keys: extractKeysFromPrefs(result.preferences),
                        };
                    } catch {
                        return {
                            userId: user.id,
                            displayName: user.displayName,
                            email: user.email,
                            keys: [],
                        };
                    }
                }),
            );

            setData(results.filter((u) => u.keys.length > 0));
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
                        <div className="flex items-center gap-2">
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
                                Descargar
                            </button>
                            <button
                                type="button"
                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border hover:bg-muted/50 text-muted-foreground hover:text-foreground cursor-pointer transition-colors typo-caption"
                                onClick={async () => {
                                    try {
                                        const md = generateMarkdown(data);
                                        const result = await ipc.markdownShare.uploadDocument({
                                            title: "API Keys",
                                            content: md,
                                            format: "md",
                                        });
                                        await navigator.clipboard.writeText(result.data.share_url);
                                        toast.success("URL copiada al portapapeles");
                                    } catch (e: any) {
                                        toast.error(e.message || "Error al compartir");
                                    }
                                }}
                            >
                                <Share2 size={14} />
                                Compartir
                            </button>
                        </div>
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
                                                    <div className="divide-y divide-border/20">
                                                        {categoryKeys.map((keyEntry, idx) => (
                                                            <ApiKeyRow
                                                                key={idx}
                                                                keyEntry={keyEntry}
                                                                userId={user.userId}
                                                                onCopy={handleCopy}
                                                            />
                                                        ))}
                                                    </div>
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

// ── Editable API Key row ────────────────────────────────────────────────────

function ApiKeyRow({
    keyEntry,
    userId,
    onCopy,
}: {
    keyEntry: KeyEntry;
    userId: string;
    onCopy: (value: string) => void;
}) {
    const [editing, setEditing] = useState(false);
    const [editValue, setEditValue] = useState(keyEntry.value);
    const [saving, setSaving] = useState(false);
    const [showSecret, setShowSecret] = useState(false);

    const isSecret = keyEntry.value.startsWith("sk-") ||
        keyEntry.value.startsWith("ghu_") ||
        keyEntry.value.startsWith("sbp_") ||
        keyEntry.label.toLowerCase().includes("token") ||
        keyEntry.label.toLowerCase().includes("key") ||
        keyEntry.category !== "Embeddings";

    const handleSave = async () => {
        // For now, only simple string values can be edited inline.
        // Complex nested values (providerSettings) need the full preferences editor.
        if (keyEntry.prefKey === "providerSettings" || keyEntry.prefKey === "supabase") {
            toast.error("Usa el editor de preferencias del usuario para editar este campo");
            setEditing(false);
            return;
        }

        setSaving(true);
        try {
            // Wrap in Secret schema format if needed
            const wrappedValue = JSON.stringify({ value: editValue, encryptionType: "plaintext" });
            await ipc.admin.setUserPreference({ userId, key: keyEntry.prefKey, value: wrappedValue });
            keyEntry.value = editValue; // Optimistic update
            toast.success("Clave actualizada");
            setEditing(false);
        } catch (err: any) {
            toast.error(err.message || "Error al guardar");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="flex items-center justify-between gap-4 px-4 py-2.5 hover:bg-muted/20 transition-colors group">
            {/* Label */}
            <div className="shrink-0 w-[160px]">
                <span className="typo-caption text-muted-foreground">
                    {keyEntry.label}
                </span>
            </div>

            {/* Value */}
            <div className="flex-1 flex items-center justify-end gap-2">
                {editing ? (
                    <div className="flex items-center gap-1.5 flex-1 justify-end">
                        <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            className="flex-1 max-w-md px-2 py-1.5 bg-secondary border border-border rounded-lg text-foreground text-xs font-mono outline-none focus:border-primary"
                            autoFocus
                            onKeyDown={(e) => {
                                if (e.key === "Enter") handleSave();
                                if (e.key === "Escape") { setEditing(false); setEditValue(keyEntry.value); }
                            }}
                        />
                        <button
                            type="button"
                            className="p-1 rounded hover:bg-accent text-primary cursor-pointer transition-colors"
                            onClick={handleSave}
                            disabled={saving}
                        >
                            {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                        </button>
                        <button
                            type="button"
                            className="p-1 rounded hover:bg-accent text-muted-foreground cursor-pointer transition-colors"
                            onClick={() => { setEditing(false); setEditValue(keyEntry.value); }}
                        >
                            <X size={12} />
                        </button>
                    </div>
                ) : (
                    <>
                        <span className="typo-caption font-mono text-foreground/80 break-all select-all">
                            {isSecret && !showSecret ? maskValue(keyEntry.value) : keyEntry.value}
                        </span>
                        {isSecret && (
                            <button
                                type="button"
                                className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer transition-colors shrink-0"
                                onClick={() => setShowSecret(!showSecret)}
                            >
                                {showSecret ? <EyeOff size={12} /> : <Eye size={12} />}
                            </button>
                        )}
                    </>
                )}
            </div>

            {/* Actions */}
            {!editing && (
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                        type="button"
                        className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                        onClick={(e) => {
                            e.stopPropagation();
                            onCopy(keyEntry.value);
                        }}
                    >
                        <Copy size={12} />
                    </button>
                    <button
                        type="button"
                        className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                        onClick={(e) => {
                            e.stopPropagation();
                            setEditValue(keyEntry.value);
                            setEditing(true);
                        }}
                    >
                        <Pencil size={12} />
                    </button>
                </div>
            )}
        </div>
    );
}
