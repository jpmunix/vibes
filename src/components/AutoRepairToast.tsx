import React from "react";
import { Loader2, CheckCircle2, AlertTriangle, Wrench, X } from "lucide-react";

type AutoRepairStatus = "repairing" | "success" | "failed";

export interface AutoRepairToastProps {
    status: AutoRepairStatus;
    attempt?: number;
    maxAttempts?: number;
    errorMessage?: string;
    onDismiss?: () => void;
}

export function AutoRepairToast({
    status,
    attempt = 1,
    maxAttempts = 2,
    errorMessage,
    onDismiss,
}: AutoRepairToastProps) {
    return (
        <div className="group relative flex items-start gap-3 p-3 rounded-lg bg-background border border-border shadow-lg min-w-[320px] max-w-[420px]">
            {onDismiss && (
                <button
                    onClick={onDismiss}
                    className="absolute top-2 right-2 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Close"
                >
                    <X size={14} />
                </button>
            )}
            <div className="flex-shrink-0 mt-0.5">
                {status === "repairing" && (
                    <div className="relative">
                        <Wrench size={18} className="text-blue-500 animate-pulse" />
                    </div>
                )}
                {status === "success" && (
                    <CheckCircle2 size={18} className="text-green-500" />
                )}
                {status === "failed" && (
                    <AlertTriangle size={18} className="text-amber-500" />
                )}
            </div>
            <div className="flex-1 min-w-0 pr-6">
                <p className="text-sm font-medium text-foreground">
                    {status === "repairing" && "Reparando automáticamente"}
                    {status === "success" && "Error reparado correctamente"}
                    {status === "failed" && "No se pudo reparar automáticamente"}
                </p>
                {status === "repairing" && (
                    <p className="text-xs text-muted-foreground mt-1">
                        Se detectó un error de compilación. La IA está trabajando en
                        arreglarlo...
                    </p>
                )}
                {status === "failed" && (
                    <p className="text-xs text-muted-foreground mt-1">
                        Puedes intentar arreglarlo manualmente o usar &quot;Fix error with
                        AI&quot; en el panel de preview.
                    </p>
                )}
            </div>
        </div>
    );
}
