/**
 * PreferencesCopyDialog — Modal to copy/overwrite preferences from one user to others.
 * Supports multi-select preferences, mode toggle (copy vs overwrite), and target user picker.
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { ipc } from "@/ipc/types";
import type { AdminUser } from "@/ipc/types/admin";
import {
    X,
    Check,
    Loader2,
    Search,
    Copy,
    ArrowRightLeft,
    ChevronDown,
    Users,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface PrefItem {
    key: string;
    value: string;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    sourceUser: AdminUser;
    allUsers: AdminUser[];
}

export function PreferencesCopyDialog({ isOpen, onClose, sourceUser, allUsers }: Props) {
    const [prefs, setPrefs] = useState<PrefItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
    const [targetUserIds, setTargetUserIds] = useState<Set<string>>(new Set());
    const [mode, setMode] = useState<"copy" | "overwrite">("overwrite");
    const [filter, setFilter] = useState("");
    const [userFilter, setUserFilter] = useState("");
    const [executing, setExecuting] = useState(false);
    const [step, setStep] = useState<"select-prefs" | "select-users">("select-prefs");

    // Fetch source user's preferences
    useEffect(() => {
        if (!isOpen) return;
        setLoading(true);
        setSelectedKeys(new Set());
        setTargetUserIds(new Set());
        setStep("select-prefs");
        setFilter("");
        setUserFilter("");

        ipc.admin.getUserPreferences({ userId: sourceUser.id }).then((result) => {
            setPrefs(result.preferences.map((p) => ({ key: p.key, value: p.value })));
        }).catch((err: any) => {
            toast.error(err.message || "Error al cargar preferencias");
        }).finally(() => setLoading(false));
    }, [isOpen, sourceUser.id]);

    const filteredPrefs = useMemo(() => {
        if (!filter) return prefs;
        const q = filter.toLowerCase();
        return prefs.filter((p) => p.key.toLowerCase().includes(q) || p.value.toLowerCase().includes(q));
    }, [prefs, filter]);

    const otherUsers = useMemo(() => {
        const others = allUsers.filter((u) => u.id !== sourceUser.id);
        if (!userFilter) return others;
        const q = userFilter.toLowerCase();
        return others.filter((u) => u.displayName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
    }, [allUsers, sourceUser.id, userFilter]);

    const toggleKey = (key: string) => {
        setSelectedKeys((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    };

    const toggleAllVisible = () => {
        const allSelected = filteredPrefs.every((p) => selectedKeys.has(p.key));
        if (allSelected) {
            setSelectedKeys((prev) => {
                const next = new Set(prev);
                filteredPrefs.forEach((p) => next.delete(p.key));
                return next;
            });
        } else {
            setSelectedKeys((prev) => {
                const next = new Set(prev);
                filteredPrefs.forEach((p) => next.add(p.key));
                return next;
            });
        }
    };

    const toggleUser = (userId: string) => {
        setTargetUserIds((prev) => {
            const next = new Set(prev);
            if (next.has(userId)) next.delete(userId); else next.add(userId);
            return next;
        });
    };

    const toggleAllUsers = () => {
        const allSelected = otherUsers.every((u) => targetUserIds.has(u.id));
        if (allSelected) {
            setTargetUserIds(new Set());
        } else {
            setTargetUserIds(new Set(otherUsers.map((u) => u.id)));
        }
    };

    const handleExecute = useCallback(async () => {
        if (selectedKeys.size === 0 || targetUserIds.size === 0) return;
        setExecuting(true);
        try {
            const result = await ipc.admin.copyPreferencesToUsers({
                sourceUserId: sourceUser.id,
                targetUserIds: Array.from(targetUserIds),
                keys: Array.from(selectedKeys),
                mode,
            });
            const modeLabel = mode === "overwrite" ? "sobrescritas" : "copiadas";
            toast.success(
                `${result.written} preferencia(s) ${modeLabel}` +
                (result.skipped > 0 ? `, ${result.skipped} omitida(s)` : ""),
            );
            onClose();
        } catch (err: any) {
            toast.error(err.message || "Error al copiar preferencias");
        } finally {
            setExecuting(false);
        }
    }, [selectedKeys, targetUserIds, mode, sourceUser.id, onClose]);

    if (!isOpen) return null;

    const allPrefsSelected = filteredPrefs.length > 0 && filteredPrefs.every((p) => selectedKeys.has(p.key));
    const allUsersSelected = otherUsers.length > 0 && otherUsers.every((u) => targetUserIds.has(u.id));

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div
                className="relative w-full max-w-lg max-h-[80vh] bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
                    <div>
                        <h3 className="typo-label text-foreground">Copiar preferencias</h3>
                        <p className="typo-caption text-muted-foreground mt-0.5">
                            Desde: <span className="text-foreground font-medium">{sourceUser.displayName}</span>
                        </p>
                    </div>
                    <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
                        <X size={16} />
                    </button>
                </div>

                {/* Mode toggle */}
                <div className="flex items-center gap-2 px-5 py-3 border-b border-border/50 shrink-0">
                    <span className="typo-caption text-muted-foreground shrink-0">Modo:</span>
                    <div className="flex rounded-lg border border-border overflow-hidden">
                        <button
                            type="button"
                            onClick={() => setMode("overwrite")}
                            className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                                mode === "overwrite"
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-muted",
                            )}
                        >
                            <ArrowRightLeft size={12} />
                            Sobrescribir
                        </button>
                        <button
                            type="button"
                            onClick={() => setMode("copy")}
                            className={cn(
                                "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                                mode === "copy"
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-secondary text-muted-foreground hover:text-foreground hover:bg-muted",
                            )}
                        >
                            <Copy size={12} />
                            Solo copiar nuevas
                        </button>
                    </div>
                </div>

                {/* Step indicator */}
                <div className="flex items-center gap-1 px-5 py-2 border-b border-border/30 shrink-0">
                    <button
                        type="button"
                        onClick={() => setStep("select-prefs")}
                        className={cn(
                            "px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer",
                            step === "select-prefs" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
                        )}
                    >
                        1. Preferencias ({selectedKeys.size})
                    </button>
                    <ChevronDown size={12} className="text-muted-foreground/40 -rotate-90" />
                    <button
                        type="button"
                        onClick={() => selectedKeys.size > 0 && setStep("select-users")}
                        className={cn(
                            "px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer",
                            step === "select-users" ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
                            selectedKeys.size === 0 && "opacity-40 cursor-not-allowed",
                        )}
                    >
                        2. Usuarios ({targetUserIds.size})
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 min-h-0 overflow-y-auto">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 size={20} className="animate-spin text-muted-foreground" />
                        </div>
                    ) : step === "select-prefs" ? (
                        <div className="p-3 space-y-2">
                            {/* Search + select all */}
                            <div className="flex items-center gap-2">
                                <div className="relative flex-1">
                                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
                                    <input
                                        type="text"
                                        placeholder="Buscar preferencia…"
                                        value={filter}
                                        onChange={(e) => setFilter(e.target.value)}
                                        className="w-full pl-8 pr-3 py-1.5 bg-secondary border border-border rounded-lg text-foreground text-xs placeholder:text-muted-foreground/50 focus:border-primary outline-none transition-colors"
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={toggleAllVisible}
                                    className={cn(
                                        "px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer border",
                                        allPrefsSelected
                                            ? "bg-primary/15 text-primary border-primary/30"
                                            : "bg-secondary text-muted-foreground border-border hover:text-foreground",
                                    )}
                                >
                                    {allPrefsSelected ? "Deseleccionar" : "Seleccionar"} todo
                                </button>
                            </div>

                            {/* Preference list */}
                            <div className="space-y-0.5 max-h-[40vh] overflow-y-auto rounded-lg border border-border/50">
                                {filteredPrefs.map((p) => {
                                    const selected = selectedKeys.has(p.key);
                                    const preview = p.value.length > 60 ? p.value.slice(0, 60) + "…" : p.value;
                                    return (
                                        <button
                                            key={p.key}
                                            type="button"
                                            onClick={() => toggleKey(p.key)}
                                            className={cn(
                                                "w-full flex items-center gap-3 px-3 py-2 text-left transition-colors cursor-pointer",
                                                selected ? "bg-primary/8 hover:bg-primary/12" : "hover:bg-muted/40",
                                            )}
                                        >
                                            <div className={cn(
                                                "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                                                selected ? "bg-primary border-primary" : "border-border",
                                            )}>
                                                {selected && <Check size={10} className="text-primary-foreground" />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <span className="typo-caption font-mono text-foreground/80 block truncate">{p.key}</span>
                                                <span className="typo-caption text-muted-foreground/60 block truncate text-[10px]">{preview}</span>
                                            </div>
                                        </button>
                                    );
                                })}
                                {filteredPrefs.length === 0 && (
                                    <div className="px-3 py-6 text-center typo-caption text-muted-foreground/50">
                                        Sin resultados
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="p-3 space-y-2">
                            {/* Search users + select all */}
                            <div className="flex items-center gap-2">
                                <div className="relative flex-1">
                                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
                                    <input
                                        type="text"
                                        placeholder="Buscar usuario…"
                                        value={userFilter}
                                        onChange={(e) => setUserFilter(e.target.value)}
                                        className="w-full pl-8 pr-3 py-1.5 bg-secondary border border-border rounded-lg text-foreground text-xs placeholder:text-muted-foreground/50 focus:border-primary outline-none transition-colors"
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={toggleAllUsers}
                                    className={cn(
                                        "px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer border",
                                        allUsersSelected
                                            ? "bg-primary/15 text-primary border-primary/30"
                                            : "bg-secondary text-muted-foreground border-border hover:text-foreground",
                                    )}
                                >
                                    {allUsersSelected ? "Deseleccionar" : "Seleccionar"} todos
                                </button>
                            </div>

                            {/* User list */}
                            <div className="space-y-0.5 max-h-[40vh] overflow-y-auto rounded-lg border border-border/50">
                                {otherUsers.map((u) => {
                                    const selected = targetUserIds.has(u.id);
                                    return (
                                        <button
                                            key={u.id}
                                            type="button"
                                            onClick={() => toggleUser(u.id)}
                                            className={cn(
                                                "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors cursor-pointer",
                                                selected ? "bg-primary/8 hover:bg-primary/12" : "hover:bg-muted/40",
                                            )}
                                        >
                                            <div className={cn(
                                                "w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors",
                                                selected ? "bg-primary border-primary" : "border-border",
                                            )}>
                                                {selected && <Check size={10} className="text-primary-foreground" />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <span className="typo-caption text-foreground/90 block truncate font-medium">{u.displayName}</span>
                                                <span className="typo-caption text-muted-foreground/60 block truncate text-[10px]">{u.email}</span>
                                            </div>
                                        </button>
                                    );
                                })}
                                {otherUsers.length === 0 && (
                                    <div className="px-3 py-6 text-center typo-caption text-muted-foreground/50">
                                        No hay otros usuarios
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-5 py-3 border-t border-border shrink-0">
                    <span className="typo-caption text-muted-foreground/60">
                        {selectedKeys.size} pref · {targetUserIds.size} usuario(s) · {mode === "overwrite" ? "sobrescribir" : "solo nuevas"}
                    </span>
                    <div className="flex items-center gap-2">
                        {step === "select-users" && (
                            <button
                                type="button"
                                onClick={() => setStep("select-prefs")}
                                className="px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                            >
                                Atrás
                            </button>
                        )}
                        {step === "select-prefs" ? (
                            <button
                                type="button"
                                disabled={selectedKeys.size === 0}
                                onClick={() => setStep("select-users")}
                                className="px-4 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground shadow-sm cursor-pointer hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                            >
                                <Users size={12} />
                                Elegir usuarios
                            </button>
                        ) : (
                            <button
                                type="button"
                                disabled={targetUserIds.size === 0 || executing}
                                onClick={handleExecute}
                                className="px-4 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground shadow-sm cursor-pointer hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                            >
                                {executing ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                                {mode === "overwrite" ? "Sobrescribir" : "Copiar"}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
