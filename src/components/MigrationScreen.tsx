/**
 * MigrationScreen — Blocking screen shown while migrating local data to cloud.
 * Uses app theme CSS variables for consistent light/dark mode.
 */
import { useEffect, useState } from "react";
import { ipc } from "@/ipc/types";
import { migrationClient, migrationEventClient } from "@/ipc/types/migration";
import type { MigrationProgress } from "@/ipc/types/migration";
import logoSrc from "../../assets/icon/logo.png";

interface MigrationScreenProps {
    userId: string;
    onComplete: () => void;
}

export function MigrationScreen({ userId, onComplete }: MigrationScreenProps) {
    const [progress, setProgress] = useState<MigrationProgress | null>(null);
    const [estimate, setEstimate] = useState<{ totalRows: number; tables: { name: string; rowCount: number }[] } | null>(null);
    const [error, setError] = useState("");
    const [isRunning, setIsRunning] = useState(false);

    // Get estimate on mount
    useEffect(() => {
        migrationClient.getMigrationEstimate(undefined as any).then(setEstimate).catch((err: any) => {
            console.error("Failed to get migration estimate:", err);
        });
    }, []);

    // Subscribe to progress events
    useEffect(() => {
        const unsubscribe = migrationEventClient.onProgress((data) => {
            setProgress(data);
        });
        return unsubscribe;
    }, []);

    // Start migration automatically
    useEffect(() => {
        if (isRunning || !estimate) return;

        const startMigration = async () => {
            setIsRunning(true);
            try {
                await migrationClient.startMigration({ userId });
                // Small delay for the user to see "completed"
                setTimeout(onComplete, 1500);
            } catch (err: any) {
                setError(err.message || "Error durante la migración");
                setIsRunning(false);
            }
        };

        startMigration();
    }, [estimate, userId, isRunning, onComplete]);

    const percentage = progress?.percentage ?? 0;
    const phase = progress?.phase ?? "Preparando...";
    const currentTable = progress?.table ?? "";

    return (
        <div className="flex items-center justify-center min-h-screen w-full bg-background app-region-drag">
            <div className="w-full max-w-[480px] p-10 bg-card rounded-3xl border border-border shadow-lg no-app-region-drag">
                {/* Logo */}
                <div className="text-center mb-8">
                    <img
                        src={logoSrc}
                        alt="minube vibes"
                        className="w-12 h-12 mx-auto mb-4 rounded-lg"
                    />
                    <h1 className="text-xl font-bold text-foreground tracking-tight">
                        Migrando tus datos
                    </h1>
                    <p className="text-sm text-muted-foreground mt-2">
                        Estamos subiendo tus datos al servidor. Este proceso puede tardar unos minutos.
                    </p>
                </div>

                {/* Progress */}
                <div className="mb-6">
                    {/* Progress bar */}
                    <div className="w-full h-3 bg-muted rounded-full overflow-hidden mb-3">
                        <div
                            className="h-full bg-primary rounded-full transition-all duration-300 ease-out"
                            style={{ width: `${percentage}%` }}
                        />
                    </div>

                    {/* Info row */}
                    <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">
                            {phase === "Complete" ? "¡Completado!" : `${phase}: ${currentTable}`}
                        </span>
                        <span className="font-semibold text-foreground tabular-nums">
                            {percentage}%
                        </span>
                    </div>
                </div>

                {/* Data summary */}
                {estimate && (
                    <div className="bg-muted/50 rounded-xl p-4 text-sm">
                        <div className="flex justify-between text-muted-foreground mb-2">
                            <span>Tablas</span>
                            <span>{estimate.tables.filter(t => t.rowCount > 0).length}</span>
                        </div>
                        <div className="flex justify-between text-muted-foreground mb-2">
                            <span>Registros totales</span>
                            <span>{estimate.totalRows.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between text-muted-foreground">
                            <span>Migrados</span>
                            <span>{(progress?.current ?? 0).toLocaleString()}</span>
                        </div>
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div className="mt-4 px-3.5 py-2.5 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive-foreground text-[13px]">
                        {error}
                        <button
                            className="mt-2 w-full py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold cursor-pointer"
                            onClick={() => {
                                setError("");
                                setIsRunning(false);
                            }}
                        >
                            Reintentar
                        </button>
                    </div>
                )}

                {/* Warning */}
                <p className="text-xs text-muted-foreground/60 text-center mt-6">
                    No cierres la aplicación durante la migración
                </p>
            </div>
        </div>
    );
}
