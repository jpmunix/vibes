/**
 * Admin — List Applications panel.
 * Shows all apps grouped by user, with essential data.
 */
import { useState, useEffect, useCallback } from "react";
import { ipc } from "@/ipc/types";
import type { AdminUser } from "@/ipc/types/admin";
import {
    Loader2,
    ChevronRight,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface AdminApp {
    id: number;
    userId: string;
    name: string;
    path: string;
    createdAt: number;
    updatedAt: number;
    primaryLanguage: string | null;
    projectType: string | null;
    githubOrg: string | null;
    githubRepo: string | null;
}

export function AdminListApps() {
    const [apps, setApps] = useState<AdminApp[]>([]);
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());

    const fetchApps = useCallback(async () => {
        setLoading(true);
        try {
            const result = await ipc.admin.listApps({});
            setApps(result.apps);
            setUsers(result.users);
        } catch (err: any) {
            toast.error(err.message || "Error al cargar aplicaciones");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchApps();
    }, [fetchApps]);

    const toggleUser = (userId: string) => {
        setExpandedUsers((prev) => {
            const next = new Set(prev);
            if (next.has(userId)) next.delete(userId);
            else next.add(userId);
            return next;
        });
    };

    // Group apps by userId
    const userMap = new Map<string, AdminUser>();
    for (const u of users) userMap.set(u.id, u);

    const appsByUser = new Map<string, AdminApp[]>();
    for (const app of apps) {
        const list = appsByUser.get(app.userId) ?? [];
        list.push(app);
        appsByUser.set(app.userId, list);
    }

    // Sort users by name
    const sortedUserIds = [...appsByUser.keys()].sort((a, b) => {
        const uA = userMap.get(a);
        const uB = userMap.get(b);
        return (uA?.displayName ?? "").localeCompare(uB?.displayName ?? "");
    });

    // Users without apps
    const usersWithoutApps = users.filter((u) => !appsByUser.has(u.id));

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
                    <h2 className="typo-section-title">Aplicaciones</h2>
                    <p className="typo-caption mt-1">
                        {apps.length} aplicación{apps.length !== 1 ? "es" : ""} registrada{apps.length !== 1 ? "s" : ""} en la plataforma
                    </p>
                </div>

                <div className="space-y-4">
                    {sortedUserIds.map((userId) => {
                        const user = userMap.get(userId);
                        const userApps = appsByUser.get(userId) ?? [];
                        const isExpanded = expandedUsers.has(userId);

                        return (
                            <div key={userId}>
                                {/* ── User row (SettingItem pattern) ── */}
                                <div
                                    className="flex items-center justify-between gap-8 p-4 rounded-xl border border-border hover:bg-muted/50 transition-colors cursor-pointer"
                                    onClick={() => toggleUser(userId)}
                                >
                                    <div className="flex-1 min-w-0">
                                        <h3 className="typo-label truncate">
                                            {user?.displayName ?? userId}
                                        </h3>
                                        <p className="typo-caption mt-0.5">
                                            {userApps.length} aplicación{userApps.length !== 1 ? "es" : ""}
                                        </p>
                                    </div>
                                    <ChevronRight
                                        className={cn(
                                            "size-5 text-muted-foreground/50 transition-transform duration-200 shrink-0",
                                            isExpanded && "rotate-90",
                                        )}
                                    />
                                </div>

                                {/* ── Expanded app list ── */}
                                {isExpanded && (
                                    <div className="pl-8 mt-2 space-y-2">
                                        {userApps.map((app) => (
                                            <div
                                                key={app.id}
                                                className="flex items-center justify-between gap-8 p-4 rounded-xl border border-border hover:bg-muted/50 transition-colors cursor-pointer"
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="typo-label truncate">
                                                        {app.name}
                                                    </h4>
                                                    {(app.primaryLanguage || app.projectType) && (
                                                        <div className="flex items-center gap-1.5 mt-1">
                                                            {app.primaryLanguage && (
                                                                <span className="px-1.5 py-0.5 text-[10px] rounded bg-accent text-muted-foreground uppercase tracking-wider">
                                                                    {app.primaryLanguage}
                                                                </span>
                                                            )}
                                                            {app.projectType && (
                                                                <span className="px-1.5 py-0.5 text-[10px] rounded bg-accent text-muted-foreground">
                                                                    {app.projectType}
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                                <ChevronRight
                                                    className="size-5 text-muted-foreground/50 shrink-0"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {/* Users without apps */}
                    {usersWithoutApps.length > 0 && (
                        <div className="p-4 rounded-xl border border-border/50 opacity-60">
                            <p className="typo-label">Sin aplicaciones</p>
                            <p className="typo-caption mt-0.5">
                                {usersWithoutApps.map((u) => u.displayName).join(", ")}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
