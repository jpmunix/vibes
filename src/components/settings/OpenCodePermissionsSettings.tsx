import React from "react";
import { useSettings } from "@/hooks/useSettings";
import { cn } from "@/lib/utils";

type PermissionValue = "allow" | "ask" | "deny";

interface PermissionDef {
    key: "edit" | "bash" | "webfetch" | "external_directory";
    label: string;
    description: string;
}

const PERMISSIONS: PermissionDef[] = [
    {
        key: "edit",
        label: "Editar archivos",
        description: "Crear, modificar y eliminar archivos del proyecto",
    },
    {
        key: "bash",
        label: "Ejecutar comandos",
        description: "Ejecutar comandos en la terminal (npm, curl, etc.)",
    },
    {
        key: "webfetch",
        label: "Acceder a la web",
        description: "Descargar contenido de URLs externas",
    },
    {
        key: "external_directory",
        label: "Directorios externos",
        description: "Acceder a archivos fuera del proyecto actual",
    },
];

const PERMISSION_OPTIONS: { value: PermissionValue; label: string }[] = [
    { value: "deny", label: "Bloquear" },
    { value: "ask", label: "Preguntar" },
    { value: "allow", label: "Permitir" },
];

export function OpenCodePermissionsSettings() {
    const { settings, updateSettings } = useSettings();
    const perms = settings?.openCodePermissions || {};

    const handleChange = (key: PermissionDef["key"], value: PermissionValue) => {
        updateSettings({
            openCodePermissions: {
                ...perms,
                [key]: value,
            },
        });
    };

    return (
        <div className="space-y-1">
            <p className="text-xs text-muted-foreground px-4 pb-2">
                Controla qué puede hacer OpenCode. Cambios aplican a sesiones nuevas.
            </p>
            {PERMISSIONS.map((perm) => {
                const current = perms[perm.key] || "allow";
                return (
                    <div
                        key={perm.key}
                        className="flex justify-between gap-8 p-4 rounded-xl hover:bg-muted/50 transition-colors items-center"
                    >
                        <div className="flex-1 min-w-0">
                            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                                {perm.label}
                            </h3>
                            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                                {perm.description}
                            </p>
                        </div>
                        <div className="shrink-0">
                            <div className="relative bg-muted/50 rounded-xl p-1 flex w-fit border border-border">
                                {PERMISSION_OPTIONS.map((option) => (
                                    <button
                                        key={option.value}
                                        onClick={() => handleChange(perm.key, option.value)}
                                        className={cn(
                                            "px-4 py-1.5 text-sm font-bold rounded-lg transition-colors duration-200 cursor-pointer",
                                            current === option.value
                                                ? option.value === "deny"
                                                    ? "bg-red-500 text-white shadow-sm"
                                                    : option.value === "ask"
                                                        ? "bg-amber-500 text-white shadow-sm"
                                                        : "bg-primary text-primary-foreground shadow-sm"
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
            })}
        </div>
    );
}
