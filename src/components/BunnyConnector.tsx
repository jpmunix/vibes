import { useState, useEffect, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ipc } from "@/ipc/types";
import type { BunnyConfig, BunnyDatabaseEntry, BunnyStorageZoneEntry } from "@/ipc/types";
import { showError, showSuccess } from "@/lib/toast";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { CollapsibleCard } from "@/components/CollapsibleCard";
import {
    ChevronDown,
    ChevronRight,
    Database,
    HardDrive,
    Plus,
    Trash2,
    Save,
    Eye,
    EyeOff,
    Loader2,
} from "lucide-react";
import bunnyLogo from "../../assets/logo-bunnynet-icon.svg";

// =============================================================================
// Subcomponent: Database Entry Form
// =============================================================================

function DatabaseEntryForm({
    entry,
    index,
    onChange,
    onRemove,
}: {
    entry: BunnyDatabaseEntry;
    index: number;
    onChange: (index: number, entry: BunnyDatabaseEntry) => void;
    onRemove: (index: number) => void;
}) {
    const [showFullToken, setShowFullToken] = useState(false);
    const [showReadToken, setShowReadToken] = useState(false);

    return (
        <div className="p-3 rounded-lg border border-black/10 dark:border-white/10 bg-black/3 dark:bg-white/3 space-y-2">
            <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    Base de datos #{index + 1}
                </span>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-red-400 hover:text-red-500 hover:bg-red-500/10"
                    onClick={() => onRemove(index)}
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </Button>
            </div>
            <div>
                <Label className="text-xs">Nombre identificativo</Label>
                <Input
                    value={entry.name}
                    onChange={(e) => onChange(index, { ...entry, name: e.target.value })}
                    placeholder="mi-base-de-datos"
                    className="h-8 text-sm mt-1"
                />
            </div>
            <div>
                <Label className="text-xs">Database URL</Label>
                <Input
                    value={entry.databaseUrl}
                    onChange={(e) =>
                        onChange(index, { ...entry, databaseUrl: e.target.value })
                    }
                    placeholder="https://db-xxxxx.dns.bunny.net"
                    className="h-8 text-sm mt-1 font-mono"
                />
            </div>
            <div>
                <Label className="text-xs">Full-Access Token</Label>
                <div className="relative mt-1">
                    <Input
                        type={showFullToken ? "text" : "password"}
                        value={entry.fullAccessToken}
                        onChange={(e) =>
                            onChange(index, { ...entry, fullAccessToken: e.target.value })
                        }
                        placeholder="••••••••••••••••"
                        className="h-8 text-sm pr-8 font-mono"
                    />
                    <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer"
                        onClick={() => setShowFullToken(!showFullToken)}
                    >
                        {showFullToken ? (
                            <EyeOff className="h-3.5 w-3.5" />
                        ) : (
                            <Eye className="h-3.5 w-3.5" />
                        )}
                    </button>
                </div>
            </div>
            <div>
                <Label className="text-xs">Read-only Token</Label>
                <div className="relative mt-1">
                    <Input
                        type={showReadToken ? "text" : "password"}
                        value={entry.readOnlyToken}
                        onChange={(e) =>
                            onChange(index, { ...entry, readOnlyToken: e.target.value })
                        }
                        placeholder="••••••••••••••••"
                        className="h-8 text-sm pr-8 font-mono"
                    />
                    <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer"
                        onClick={() => setShowReadToken(!showReadToken)}
                    >
                        {showReadToken ? (
                            <EyeOff className="h-3.5 w-3.5" />
                        ) : (
                            <Eye className="h-3.5 w-3.5" />
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

// =============================================================================
// Subcomponent: Storage Zone Entry Form
// =============================================================================

function StorageZoneEntryForm({
    entry,
    index,
    onChange,
    onRemove,
}: {
    entry: BunnyStorageZoneEntry;
    index: number;
    onChange: (index: number, entry: BunnyStorageZoneEntry) => void;
    onRemove: (index: number) => void;
}) {
    const [showPassword, setShowPassword] = useState(false);
    const [showReadonlyPassword, setShowReadonlyPassword] = useState(false);

    return (
        <div className="p-3 rounded-lg border border-black/10 dark:border-white/10 bg-black/3 dark:bg-white/3 space-y-2">
            <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    Storage zone #{index + 1}
                </span>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-red-400 hover:text-red-500 hover:bg-red-500/10"
                    onClick={() => onRemove(index)}
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </Button>
            </div>
            <div>
                <Label className="text-xs">Nombre identificativo</Label>
                <Input
                    value={entry.name}
                    onChange={(e) => onChange(index, { ...entry, name: e.target.value })}
                    placeholder="mi-storage-zone"
                    className="h-8 text-sm mt-1"
                />
            </div>
            <div>
                <Label className="text-xs">Hostname</Label>
                <Input
                    value={entry.hostname}
                    onChange={(e) =>
                        onChange(index, { ...entry, hostname: e.target.value })
                    }
                    placeholder="storage.bunnycdn.com"
                    className="h-8 text-sm mt-1 font-mono"
                />
            </div>
            <div>
                <Label className="text-xs">Username</Label>
                <Input
                    value={entry.username}
                    onChange={(e) =>
                        onChange(index, { ...entry, username: e.target.value })
                    }
                    placeholder="mi-storage-zone"
                    className="h-8 text-sm mt-1"
                />
            </div>
            <div>
                <Label className="text-xs">Password</Label>
                <div className="relative mt-1">
                    <Input
                        type={showPassword ? "text" : "password"}
                        value={entry.password}
                        onChange={(e) =>
                            onChange(index, { ...entry, password: e.target.value })
                        }
                        placeholder="••••••••••••••••"
                        className="h-8 text-sm pr-8 font-mono"
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
            </div>
            <div>
                <Label className="text-xs">Readonly Password</Label>
                <div className="relative mt-1">
                    <Input
                        type={showReadonlyPassword ? "text" : "password"}
                        value={entry.readonlyPassword}
                        onChange={(e) =>
                            onChange(index, { ...entry, readonlyPassword: e.target.value })
                        }
                        placeholder="••••••••••••••••"
                        className="h-8 text-sm pr-8 font-mono"
                    />
                    <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer"
                        onClick={() => setShowReadonlyPassword(!showReadonlyPassword)}
                    >
                        {showReadonlyPassword ? (
                            <EyeOff className="h-3.5 w-3.5" />
                        ) : (
                            <Eye className="h-3.5 w-3.5" />
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

// =============================================================================
// Main Component
// =============================================================================

const EMPTY_DB: BunnyDatabaseEntry = {
    name: "",
    databaseUrl: "",
    fullAccessToken: "",
    readOnlyToken: "",
};

const EMPTY_STORAGE: BunnyStorageZoneEntry = {
    name: "",
    hostname: "",
    username: "",
    password: "",
    readonlyPassword: "",
};

export function BunnyConnector({ appId }: { appId: number }) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [databases, setDatabases] = useState<BunnyDatabaseEntry[]>([]);
    const [storageZones, setStorageZones] = useState<BunnyStorageZoneEntry[]>([]);
    const [dbSectionOpen, setDbSectionOpen] = useState(false);
    const [storageSectionOpen, setStorageSectionOpen] = useState(false);

    // Snapshot of the last saved config to detect unsaved changes
    const savedSnapshot = useRef<string>("");

    const currentSnapshot = useMemo(
        () => JSON.stringify({ databases, storageZones }),
        [databases, storageZones],
    );

    const hasUnsavedChanges = currentSnapshot !== savedSnapshot.current;

    useEffect(() => {
        loadConfig();
    }, [appId]);

    async function loadConfig() {
        try {
            setLoading(true);
            const config = await ipc.bunny.getConfig({ appId });
            if (config) {
                setDatabases(config.databases);
                setStorageZones(config.storageZones);
                savedSnapshot.current = JSON.stringify({
                    databases: config.databases,
                    storageZones: config.storageZones,
                });
            } else {
                savedSnapshot.current = JSON.stringify({ databases: [], storageZones: [] });
            }
        } catch (err) {
            console.error("Error loading Bunny config:", err);
        } finally {
            setLoading(false);
        }
    }

    function validateConfig(): string[] {
        const errors: string[] = [];
        databases.forEach((db, i) => {
            const n = i + 1;
            if (!db.name.trim()) errors.push(`BD #${n}: falta el nombre`);
            if (!db.databaseUrl.trim()) errors.push(`BD #${n}: falta la Database URL`);
            if (!db.fullAccessToken.trim()) errors.push(`BD #${n}: falta el Full-Access Token`);
        });
        storageZones.forEach((sz, i) => {
            const n = i + 1;
            if (!sz.name.trim()) errors.push(`Storage #${n}: falta el nombre`);
            if (!sz.hostname.trim()) errors.push(`Storage #${n}: falta el hostname`);
            if (!sz.username.trim()) errors.push(`Storage #${n}: falta el username`);
            if (!sz.password.trim()) errors.push(`Storage #${n}: falta el password`);
        });
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
            const config: BunnyConfig = {
                databases,
                storageZones,
            };
            await ipc.bunny.setConfig({ appId, config });
            // Update saved snapshot and collapse sections
            savedSnapshot.current = JSON.stringify({ databases, storageZones });
            setDbSectionOpen(false);
            setStorageSectionOpen(false);
            showSuccess("Configuración de Bunny.net guardada");
        } catch (err) {
            showError(err);
        } finally {
            setSaving(false);
        }
    }

    function handleDbChange(index: number, entry: BunnyDatabaseEntry) {
        setDatabases((prev) => prev.map((d, i) => (i === index ? entry : d)));
    }

    function handleDbRemove(index: number) {
        setDatabases((prev) => prev.filter((_, i) => i !== index));
    }

    function handleStorageChange(index: number, entry: BunnyStorageZoneEntry) {
        setStorageZones((prev) => prev.map((s, i) => (i === index ? entry : s)));
    }

    function handleStorageRemove(index: number) {
        setStorageZones((prev) => prev.filter((_, i) => i !== index));
    }

    const hasData = databases.length > 0 || storageZones.length > 0;
    const showSaveButton = hasData && hasUnsavedChanges;

    if (loading) {
        return (
            <CollapsibleCard
                title="Bunny.net"
                icon={<img src={bunnyLogo} alt="Bunny.net" className="h-5 w-5 brightness-0 dark:invert" />}
                description="Bases de datos en la nube y almacenamiento de archivos"
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
            title="Bunny.net"
            icon={<img src={bunnyLogo} alt="Bunny.net" className="h-5 w-5 brightness-0 dark:invert" />}
            description="Bases de datos en la nube y almacenamiento de archivos"
        >
            <div className="space-y-3">
                {/* Databases Section */}
                <div className="border border-black/8 dark:border-white/8 rounded-lg overflow-hidden">
                    <button
                        type="button"
                        onClick={() => setDbSectionOpen(!dbSectionOpen)}
                        className="w-full px-3 py-2 flex items-center justify-between bg-black/3 dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/8 transition-colors cursor-pointer"
                    >
                        <div className="flex items-center gap-2">
                            {dbSectionOpen ? (
                                <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
                            ) : (
                                <ChevronRight className="h-3.5 w-3.5 text-gray-500" />
                            )}
                            <Database className="h-4 w-4 text-gray-500" />
                            <span className="text-sm font-medium">Bases de datos</span>
                            {databases.length > 0 && (
                                <span className="text-xs bg-primary/15 text-primary px-1.5 py-0.5 rounded-full">
                                    {databases.length}
                                </span>
                            )}
                        </div>
                    </button>
                    <div
                        className={`overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out ${dbSectionOpen
                            ? "max-h-[2000px] opacity-100"
                            : "max-h-0 opacity-0"
                            }`}
                    >
                        <div className="p-3 space-y-2 border-t border-black/8 dark:border-white/8">
                            {databases.map((db, i) => (
                                <DatabaseEntryForm
                                    key={i}
                                    entry={db}
                                    index={i}
                                    onChange={handleDbChange}
                                    onRemove={handleDbRemove}
                                />
                            ))}
                            {databases.length === 0 && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full gap-1.5 text-xs h-8"
                                    onClick={() => setDatabases((prev) => [...prev, { ...EMPTY_DB }])}
                                >
                                    <Plus className="h-3.5 w-3.5" />
                                    Añadir base de datos
                                </Button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Storage Zones Section */}
                <div className="border border-black/8 dark:border-white/8 rounded-lg overflow-hidden">
                    <button
                        type="button"
                        onClick={() => setStorageSectionOpen(!storageSectionOpen)}
                        className="w-full px-3 py-2 flex items-center justify-between bg-black/3 dark:bg-white/5 hover:bg-black/5 dark:hover:bg-white/8 transition-colors cursor-pointer"
                    >
                        <div className="flex items-center gap-2">
                            {storageSectionOpen ? (
                                <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
                            ) : (
                                <ChevronRight className="h-3.5 w-3.5 text-gray-500" />
                            )}
                            <HardDrive className="h-4 w-4 text-gray-500" />
                            <span className="text-sm font-medium">Storage Zones</span>
                            {storageZones.length > 0 && (
                                <span className="text-xs bg-primary/15 text-primary px-1.5 py-0.5 rounded-full">
                                    {storageZones.length}
                                </span>
                            )}
                        </div>
                    </button>
                    <div
                        className={`overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out ${storageSectionOpen
                            ? "max-h-[2000px] opacity-100"
                            : "max-h-0 opacity-0"
                            }`}
                    >
                        <div className="p-3 space-y-2 border-t border-black/8 dark:border-white/8">
                            {storageZones.map((sz, i) => (
                                <StorageZoneEntryForm
                                    key={i}
                                    entry={sz}
                                    index={i}
                                    onChange={handleStorageChange}
                                    onRemove={handleStorageRemove}
                                />
                            ))}
                            {storageZones.length === 0 && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full gap-1.5 text-xs h-8"
                                    onClick={() =>
                                        setStorageZones((prev) => [...prev, { ...EMPTY_STORAGE }])
                                    }
                                >
                                    <Plus className="h-3.5 w-3.5" />
                                    Añadir storage zone
                                </Button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Save Button – only visible when there are unsaved changes */}
                {showSaveButton && (
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
                        Guardar configuración
                    </Button>
                )}
            </div>
        </CollapsibleCard>
    );
}
