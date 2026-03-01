import { useState, useEffect, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ipc } from "@/ipc/types";
import type { PocketBaseConfig } from "@/ipc/types";
import { showError, showSuccess } from "@/lib/toast";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { CollapsibleCard } from "@/components/CollapsibleCard";
import { Database, Eye, EyeOff, Loader2, Save } from "lucide-react";
// @ts-ignore
import pocketbaseLogo from "../../assets/logo-pocketbase-icon.svg";

const EMPTY_CONFIG: PocketBaseConfig = {
    url: "",
    adminEmail: "",
    adminPassword: "",
};

export function PocketBaseConnector({ appId }: { appId: number }) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [config, setConfig] = useState<PocketBaseConfig>({ ...EMPTY_CONFIG });
    const [showPassword, setShowPassword] = useState(false);

    // Snapshot of the last saved config to detect unsaved changes
    const savedSnapshot = useRef<string>("");

    const currentSnapshot = useMemo(() => JSON.stringify(config), [config]);
    const hasUnsavedChanges = currentSnapshot !== savedSnapshot.current;

    useEffect(() => {
        loadConfig();
    }, [appId]);

    async function loadConfig() {
        try {
            setLoading(true);
            const savedConfig = await ipc.pocketbase.getConfig({ appId });
            if (savedConfig) {
                setConfig(savedConfig);
                savedSnapshot.current = JSON.stringify(savedConfig);
            } else {
                setConfig({ ...EMPTY_CONFIG });
                savedSnapshot.current = JSON.stringify(EMPTY_CONFIG);
            }
        } catch (err) {
            console.error("Error loading PocketBase config:", err);
        } finally {
            setLoading(false);
        }
    }

    function validateConfig(): string[] {
        const errors: string[] = [];
        if (!config.url.trim()) errors.push("Falta la URL de la instancia");
        if (!config.adminEmail.trim()) errors.push("Falta el Email del Superuser");
        if (!config.adminPassword.trim()) errors.push("Falta la Contraseña del Superuser");
        return errors;
    }

    async function handleSave() {
        const validationErrors = validateConfig();
        if (validationErrors.length > 0) {
            showError(`Campos requeridos vacíos:\n${validationErrors.join("\n")}`);
            return;
        }
        try {
            setSaving(true);
            await ipc.pocketbase.setConfig({ appId, config });
            savedSnapshot.current = JSON.stringify(config);
            showSuccess("Configuración de PocketBase guardada. Ahora el agente local puede usar este BaaS.");
        } catch (err) {
            showError(err);
        } finally {
            setSaving(false);
        }
    }

    if (loading) {
        return (
            <CollapsibleCard
                title="PocketBase"
                icon={<img src={pocketbaseLogo} alt="PocketBase" className="h-5 w-5 brightness-0 dark:invert" />}
                description="BaaS SQLite en un solo archivo con Auth, DB y Realtime"
            >
                <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Cargando configuración...
                </div>
            </CollapsibleCard>
        );
    }

    return (
        <CollapsibleCard
            title="PocketBase"
            icon={<img src={pocketbaseLogo} alt="PocketBase" className="h-5 w-5 brightness-0 dark:invert" />}
            description="Backend-as-a-Service (BaaS) con Auth, Database, Realtime y Storage (Files)."
        >
            <div className="space-y-4">
                <div className="p-3 rounded-lg border border-black/10 dark:border-white/10 bg-black/3 dark:bg-white/3 space-y-3">
                    <div>
                        <Label className="text-xs">URL de la Instancia</Label>
                        <Input
                            value={config.url}
                            onChange={(e) => setConfig({ ...config, url: e.target.value })}
                            placeholder="https://tu-instancia.pockethost.io"
                            className="h-8 text-sm mt-1 font-mono"
                        />
                        <p className="text-[10px] text-muted-foreground mt-1">
                            Asegúrate de no incluir un trailing slash a menos que lo requieras.
                        </p>
                    </div>
                    <div>
                        <Label className="text-xs">Superuser Email</Label>
                        <Input
                            type="email"
                            value={config.adminEmail}
                            onChange={(e) => setConfig({ ...config, adminEmail: e.target.value })}
                            placeholder="admin@ejemplo.com"
                            className="h-8 text-sm mt-1"
                        />
                    </div>
                    <div>
                        <Label className="text-xs">Superuser Password</Label>
                        <div className="relative mt-1">
                            <Input
                                type={showPassword ? "text" : "password"}
                                value={config.adminPassword}
                                onChange={(e) => setConfig({ ...config, adminPassword: e.target.value })}
                                placeholder="••••••••••••••••"
                                className="h-8 text-sm pr-8"
                            />
                            <button
                                type="button"
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer"
                                onClick={() => setShowPassword(!showPassword)}
                            >
                                {showPassword ? (
                                    <EyeOff className="h-3.5 w-3.5" />
                                ) : (
                                    <Eye className="h-3.5 w-3.5" />
                                )}
                            </button>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">
                            El agente utilizará estas credenciales para autenticarse como superusuario y poder leer colecciones protegidas u ocultas.
                        </p>
                    </div>
                </div>

                {hasUnsavedChanges && (
                    <Button
                        onClick={handleSave}
                        disabled={saving}
                        size="sm"
                        className="w-full gap-1.5"
                    >
                        {saving ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Save className="h-4 w-4" />
                        )}
                        Guardar configuración de PocketBase
                    </Button>
                )}
            </div>
        </CollapsibleCard>
    );
}
