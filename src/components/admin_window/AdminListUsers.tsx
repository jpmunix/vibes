/**
 * Admin — Users panel.
 * Settings-style card with section title, inline create form, and user table.
 */
import { useState, useEffect, useCallback } from "react";
import { ipc } from "@/ipc/types";
import type { AdminUser } from "@/ipc/types/admin";
import {
    Pencil,
    Check,
    X,
    Lock,
    Loader2,
    ChevronRight,
    Eye,
    EyeOff,
    Copy,
    RefreshCw,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ── Password generator ──────────────────────────────────────────────────────

function generatePassword(): string {
    const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const lower = "abcdefghijklmnopqrstuvwxyz";
    const digits = "0123456789";
    const symbols = "!@#$%&*-_+=?";
    const all = upper + lower + digits + symbols;

    const pw = [
        upper[Math.floor(Math.random() * upper.length)],
        lower[Math.floor(Math.random() * lower.length)],
        digits[Math.floor(Math.random() * digits.length)],
        symbols[Math.floor(Math.random() * symbols.length)],
    ];

    for (let i = pw.length; i < 16; i++) {
        pw.push(all[Math.floor(Math.random() * all.length)]);
    }

    for (let i = pw.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pw[i], pw[j]] = [pw[j], pw[i]];
    }

    return pw.join("");
}

// ── Main component ──────────────────────────────────────────────────────────

export function AdminListUsers() {
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState({ displayName: "", email: "" });
    const [passwordResetId, setPasswordResetId] = useState<string | null>(null);
    const [newPassword, setNewPassword] = useState("");
    const [saving, setSaving] = useState(false);

    // Create-user form state
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [createForm, setCreateForm] = useState({ displayName: "", email: "", password: "" });
    const [showCreatePassword, setShowCreatePassword] = useState(false);
    const [copied, setCopied] = useState(false);
    const [creating, setCreating] = useState(false);

    // Expand user details
    const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

    const toggleExpandUser = (userId: string) => {
        setExpandedUserId((prev) => (prev === userId ? null : userId));
    };

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        try {
            const result = await ipc.admin.listUsers({});
            setUsers(result.users);
        } catch (err: any) {
            toast.error(err.message || "Error al cargar usuarios");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    // ── Edit handlers ──

    const startEdit = (user: AdminUser) => {
        setEditingId(user.id);
        setEditForm({ displayName: user.displayName, email: user.email });
        setPasswordResetId(null);
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditForm({ displayName: "", email: "" });
    };

    const saveEdit = async () => {
        if (!editingId) return;
        setSaving(true);
        try {
            const updated = await ipc.admin.updateUser({
                userId: editingId,
                displayName: editForm.displayName,
                email: editForm.email,
            });
            setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
            setEditingId(null);
            toast.success("Usuario actualizado");
        } catch (err: any) {
            toast.error(err.message || "Error al actualizar");
        } finally {
            setSaving(false);
        }
    };

    const savePassword = async () => {
        if (!passwordResetId || newPassword.length < 6) {
            toast.error("La contraseña debe tener al menos 6 caracteres");
            return;
        }
        setSaving(true);
        try {
            await ipc.admin.resetPassword({ userId: passwordResetId, newPassword });
            setPasswordResetId(null);
            setNewPassword("");
            toast.success("Contraseña actualizada");
        } catch (err: any) {
            toast.error(err.message || "Error al cambiar contraseña");
        } finally {
            setSaving(false);
        }
    };

    // ── Create handlers ──

    const handleGenerate = () => {
        const pw = generatePassword();
        setCreateForm((f) => ({ ...f, password: pw }));
        setShowCreatePassword(true);
    };

    const handleCopy = async () => {
        if (!createForm.password) return;
        await navigator.clipboard.writeText(createForm.password);
        setCopied(true);
        toast.success("Contraseña copiada");
        setTimeout(() => setCopied(false), 2000);
    };

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!createForm.displayName.trim()) { toast.error("El nombre es obligatorio"); return; }
        if (!createForm.email.trim()) { toast.error("El email es obligatorio"); return; }
        if (createForm.password.length < 6) { toast.error("La contraseña debe tener al menos 6 caracteres"); return; }

        setCreating(true);
        try {
            const user = await ipc.admin.createUser({
                displayName: createForm.displayName.trim(),
                email: createForm.email.trim(),
                password: createForm.password,
            });
            toast.success(`Usuario "${user.displayName}" creado`);
            setCreateForm({ displayName: "", email: "", password: "" });
            setShowCreatePassword(false);
            setShowCreateForm(false);
            fetchUsers();
        } catch (err: any) {
            toast.error(err.message || "Error al crear usuario");
        } finally {
            setCreating(false);
        }
    };

    // ── Loading ──

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 size={24} className="animate-spin text-muted-foreground" />
            </div>
        );
    }

    const inputClass =
        "w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground text-sm placeholder:text-muted-foreground/50 focus:border-primary focus:ring-0 outline-none transition-colors";

    return (
        <div className="p-8 w-full mx-auto space-y-8">

            {/* ── Section card ── */}
            <div className="bg-card rounded-2xl shadow-sm p-8 border border-border">
                <div className="mb-8">
                    <h2 className="typo-section-title">Usuarios</h2>
                    <p className="typo-caption mt-1">
                        Gestiona las cuentas de usuario de la plataforma
                    </p>
                </div>

                <div className="space-y-4">
                    {/* ── Create user row (Settings-style SettingItem with "+ Crear" button) ── */}
                    <div
                        className="flex items-center justify-between gap-8 p-4 rounded-xl border border-border hover:bg-muted/50 transition-colors cursor-pointer"
                        onClick={() => setShowCreateForm((prev) => !prev)}
                    >
                        <div className="flex-1">
                            <h3 className="typo-label">Crear usuario</h3>
                            <p className="typo-caption mt-1">
                                Registra una nueva cuenta con nombre, email y contraseña
                            </p>
                        </div>
                        <ChevronRight
                            className={cn(
                                "size-5 text-muted-foreground/50 transition-transform duration-200 shrink-0",
                                showCreateForm && "rotate-90",
                            )}
                        />
                    </div>

                    {/* ── Inline create form (collapsible) ── */}
                    {showCreateForm && (
                        <form onSubmit={handleCreateUser} className="pl-8 space-y-2">
                            {/* Name */}
                            <div className="flex items-center justify-between gap-8 p-4 rounded-xl hover:bg-muted/50 transition-colors">
                                <div className="shrink-0">
                                    <label htmlFor="admin-name" className="typo-label">Nombre</label>
                                    <p className="typo-caption mt-0.5">Nombre visible del usuario</p>
                                </div>
                                <input
                                    id="admin-name"
                                    type="text"
                                    placeholder="Nombre del usuario"
                                    value={createForm.displayName}
                                    onChange={(e) => setCreateForm((f) => ({ ...f, displayName: e.target.value }))}
                                    required
                                    autoFocus
                                    className={`${inputClass} max-w-xs`}
                                />
                            </div>

                            {/* Email */}
                            <div className="flex items-center justify-between gap-8 p-4 rounded-xl hover:bg-muted/50 transition-colors">
                                <div className="shrink-0">
                                    <label htmlFor="admin-email" className="typo-label">Email</label>
                                    <p className="typo-caption mt-0.5">Dirección de correo electrónico</p>
                                </div>
                                <input
                                    id="admin-email"
                                    type="email"
                                    placeholder="usuario@email.com"
                                    value={createForm.email}
                                    onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                                    required
                                    className={`${inputClass} max-w-xs`}
                                />
                            </div>

                            {/* Password */}
                            <div className="flex items-center justify-between gap-8 p-4 rounded-xl hover:bg-muted/50 transition-colors">
                                <div className="shrink-0">
                                    <label htmlFor="admin-password" className="typo-label">Contraseña</label>
                                    <p className="typo-caption mt-0.5">Mínimo 6 caracteres</p>
                                </div>
                                <div className="flex gap-1.5 max-w-xs w-full">
                                    <div className="relative flex-1">
                                        <input
                                            id="admin-password"
                                            type={showCreatePassword ? "text" : "password"}
                                            placeholder="Contraseña"
                                            value={createForm.password}
                                            onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                                            required
                                            className={`${inputClass} pr-9`}
                                        />
                                        <button
                                            type="button"
                                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                                            onClick={() => setShowCreatePassword(!showCreatePassword)}
                                            tabIndex={-1}
                                        >
                                            {showCreatePassword ? <EyeOff size={14} /> : <Eye size={14} />}
                                        </button>
                                    </div>
                                    <button
                                        type="button"
                                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-secondary border border-border text-muted-foreground hover:text-foreground hover:bg-accent text-xs transition-colors cursor-pointer shrink-0"
                                        onClick={handleGenerate}
                                    >
                                        <RefreshCw size={12} />
                                        Generar
                                    </button>
                                    {createForm.password && (
                                        <button
                                            type="button"
                                            className="flex items-center px-2.5 py-2 rounded-lg bg-secondary border border-border text-muted-foreground hover:text-foreground hover:bg-accent text-xs transition-colors cursor-pointer shrink-0"
                                            onClick={handleCopy}
                                        >
                                            {copied ? <Check size={12} className="text-primary" /> : <Copy size={12} />}
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex justify-end gap-2 px-4 pt-2 pb-2">
                                <button
                                    type="button"
                                    onClick={() => setShowCreateForm(false)}
                                    className="px-4 py-1.5 rounded-lg typo-select text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={creating}
                                    className="px-4 py-1.5 typo-select rounded-lg bg-primary text-primary-foreground shadow-sm cursor-pointer hover:brightness-110 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    {creating && <Loader2 size={14} className="animate-spin" />}
                                    Crear usuario
                                </button>
                            </div>
                        </form>
                    )}

                    {/* ── User list (SettingItem rows) ── */}
                    {users.map((user) => {
                        const isExpanded = expandedUserId === user.id;
                        const isEditing = editingId === user.id;
                        const isResettingPw = passwordResetId === user.id;

                        return (
                            <div key={user.id}>
                                {/* ── User row ── */}
                                <div
                                    className="flex items-center justify-between gap-8 p-4 rounded-xl border border-border hover:bg-muted/50 transition-colors cursor-pointer"
                                    onClick={() => toggleExpandUser(user.id)}
                                >
                                    <div className="flex-1 min-w-0">
                                        <h3 className="typo-label truncate">
                                            {user.displayName}
                                        </h3>
                                        <p className="typo-caption mt-0.5">
                                            {user.email} · {new Date(user.createdAt).toLocaleDateString("es-ES", {
                                                day: "2-digit",
                                                month: "short",
                                                year: "numeric",
                                            })}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        {/* Edit / Password buttons */}
                                        <button
                                            type="button"
                                            className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                                            onClick={(e) => { e.stopPropagation(); startEdit(user); }}
                                            title="Editar"
                                        >
                                            <Pencil size={14} />
                                        </button>
                                        <button
                                            type="button"
                                            className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setPasswordResetId(isResettingPw ? null : user.id);
                                                setNewPassword("");
                                                setEditingId(null);
                                            }}
                                            title="Cambiar contraseña"
                                        >
                                            <Lock size={14} />
                                        </button>
                                        <ChevronRight
                                            className={cn(
                                                "size-5 text-muted-foreground/50 transition-transform duration-200 ml-1",
                                                isExpanded && "rotate-90",
                                            )}
                                        />
                                    </div>
                                </div>

                                {/* ── Expanded content ── */}
                                {isExpanded && (
                                    <div className="pl-8 mt-2 space-y-2 mb-4">
                                        {/* Inline edit form */}
                                        {isEditing && (
                                            <div className="flex items-center gap-2 p-4 rounded-xl border border-border">
                                                <input
                                                    value={editForm.displayName}
                                                    onChange={(e) => setEditForm((f) => ({ ...f, displayName: e.target.value }))}
                                                    className="flex-1 px-2 py-1.5 bg-secondary border border-border rounded-lg text-foreground text-sm outline-none focus:border-primary"
                                                    placeholder="Nombre"
                                                    autoFocus
                                                />
                                                <input
                                                    value={editForm.email}
                                                    onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                                                    className="flex-1 px-2 py-1.5 bg-secondary border border-border rounded-lg text-foreground text-sm outline-none focus:border-primary"
                                                    placeholder="Email"
                                                />
                                                <button
                                                    type="button"
                                                    className="p-1.5 rounded hover:bg-accent text-primary cursor-pointer transition-colors"
                                                    onClick={saveEdit}
                                                    disabled={saving}
                                                >
                                                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="p-1.5 rounded hover:bg-accent text-muted-foreground cursor-pointer transition-colors"
                                                    onClick={cancelEdit}
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        )}

                                        {/* Inline password reset */}
                                        {isResettingPw && (
                                            <div className="flex items-center gap-2 p-4 rounded-xl border border-border">
                                                <input
                                                    type="text"
                                                    value={newPassword}
                                                    onChange={(e) => setNewPassword(e.target.value)}
                                                    placeholder="Nueva contraseña (mín. 6 caracteres)"
                                                    className="flex-1 px-2 py-1.5 bg-secondary border border-border rounded-lg text-foreground text-sm outline-none focus:border-primary"
                                                    autoFocus
                                                />
                                                <button
                                                    type="button"
                                                    className="p-1.5 rounded hover:bg-accent text-primary cursor-pointer transition-colors"
                                                    onClick={savePassword}
                                                    disabled={saving}
                                                >
                                                    {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="p-1.5 rounded hover:bg-accent text-muted-foreground cursor-pointer transition-colors"
                                                    onClick={() => { setPasswordResetId(null); setNewPassword(""); }}
                                                >
                                                    <X size={12} />
                                                </button>
                                            </div>
                                        )}

                                        {/* Settings JSON tree */}
                                        <UserSettingsViewer userId={user.id} />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
// ── Settings Table Viewer ───────────────────────────────────────────────────

function UserSettingsViewer({ userId }: { userId: string }) {
    const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setLoading(true);
        setError(null);
        ipc.admin.getUserSettings({ userId })
            .then((result) => setSettings(result.settings))
            .catch((err: any) => setError(err.message || "Error al cargar"))
            .finally(() => setLoading(false));
    }, [userId]);

    if (loading) {
        return (
            <div className="p-4 rounded-xl border border-border/50 flex items-center gap-2">
                <Loader2 size={14} className="animate-spin text-muted-foreground" />
                <span className="typo-caption">Cargando configuración…</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 rounded-xl border border-border/50">
                <p className="typo-caption text-destructive">{error}</p>
            </div>
        );
    }

    if (!settings || Object.keys(settings).length === 0) {
        return (
            <div className="p-4 rounded-xl border border-border/50">
                <p className="typo-caption">Sin configuración guardada</p>
            </div>
        );
    }

    return (
        <div className="rounded-xl border border-border/50 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border/50">
                <p className="typo-label">Configuración del usuario</p>
            </div>
            <SettingsTable entries={Object.entries(settings)} />
        </div>
    );
}

/** Describes the size of a complex value */
function describeComplex(val: unknown): string {
    if (Array.isArray(val)) {
        const n = val.length;
        return n === 0 ? "[ ] vacío" : `${n} elemento${n !== 1 ? "s" : ""}`;
    }
    if (typeof val === "object" && val !== null) {
        const n = Object.keys(val).length;
        return n === 0 ? "{ } vacío" : `${n} propiedad${n !== 1 ? "es" : ""}`;
    }
    return "";
}

function isComplex(val: unknown): boolean {
    return val !== null && typeof val === "object";
}

/** A two-column table that renders key–value pairs, with expandable rows for nested data */
function SettingsTable({ entries }: { entries: [string, unknown][] }) {
    return (
        <table className="w-full text-sm">
            <tbody>
                {entries.map(([key, val]) => (
                    <SettingsRow key={key} label={key} value={val} />
                ))}
            </tbody>
        </table>
    );
}

function SettingsRow({ label, value }: { label: string; value: unknown }) {
    const complex = isComplex(value);
    const [expanded, setExpanded] = useState(false);

    // Nested entries when expanded
    const nestedEntries: [string, unknown][] = expanded
        ? Array.isArray(value)
            ? value.map((item, idx) => [`[${idx}]`, item])
            : typeof value === "object" && value !== null
                ? Object.entries(value as Record<string, unknown>)
                : []
        : [];

    return (
        <>
            <tr
                className={cn(
                    "border-t border-border/30 first:border-t-0 transition-colors",
                    complex ? "hover:bg-muted/50 cursor-pointer" : "hover:bg-muted/20",
                )}
                onClick={complex ? () => setExpanded((e) => !e) : undefined}
            >
                {/* Key column */}
                <td className="px-4 py-2.5 align-top text-left">
                    <div className="flex items-center gap-1.5">
                        {complex && (
                            <ChevronRight
                                className={cn(
                                    "size-3.5 text-muted-foreground/50 transition-transform duration-150 shrink-0",
                                    expanded && "rotate-90",
                                )}
                            />
                        )}
                        <span className="typo-caption text-muted-foreground break-all">{label}</span>
                    </div>
                </td>

                {/* Value column */}
                <td className="px-4 py-2.5 align-top text-right">
                    {complex ? (
                        <span className="typo-caption text-muted-foreground/70 italic">
                            {describeComplex(value)}
                        </span>
                    ) : (
                        <ValueDisplay value={value} />
                    )}
                </td>
            </tr>

            {/* Nested sub-table */}
            {expanded && nestedEntries.length > 0 && (
                <tr>
                    <td colSpan={2} className="p-0">
                        <div className="ml-6 border-l-2 border-border/30">
                            <SettingsTable entries={nestedEntries} />
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
}

/** Renders a primitive value with appropriate styling */
function ValueDisplay({ value }: { value: unknown }) {
    if (value === null || value === undefined) {
        return <span className="typo-caption italic text-muted-foreground/50">null</span>;
    }

    if (typeof value === "boolean") {
        return (
            <span className={cn(
                "typo-caption font-mono px-1.5 py-0.5 rounded",
                value
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground bg-muted/50",
            )}>
                {value ? "true" : "false"}
            </span>
        );
    }

    if (typeof value === "number") {
        return <span className="typo-caption font-mono text-primary">{value}</span>;
    }

    if (typeof value === "string") {
        if (value === "") {
            return <span className="typo-caption italic text-muted-foreground/50">""</span>;
        }
        return (
            <span className="typo-caption font-mono text-foreground/80 break-all select-all">
                {value}
            </span>
        );
    }

    return <span className="typo-caption">{String(value)}</span>;
}

