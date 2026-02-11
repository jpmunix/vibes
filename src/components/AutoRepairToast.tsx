import React from "react";
import { Loader2, CheckCircle2, AlertTriangle, Wrench } from "lucide-react";

type AutoRepairStatus = "repairing" | "success" | "failed";

interface AutoRepairToastProps {
    status: AutoRepairStatus;
    attempt?: number;
    maxAttempts?: number;
    errorMessage?: string;
}

export function AutoRepairToast({
    status,
    attempt = 1,
    maxAttempts = 2,
    errorMessage,
}: AutoRepairToastProps) {
    return (
        <div className="flex items-start gap-3 p-3 rounded-lg bg-background border border-border shadow-lg min-w-[320px] max-w-[420px]">
            <div className="flex-shrink-0 mt-0.5">
                {status === "repairing" && (
                    <div className="relative">
                        <Wrench size={18} className="text-blue-500 animate-pulse" />
                        <Loader2
                            size={12}
                            className="absolute -bottom-1 -right-1 text-blue-400 animate-spin"
                        />
                    </div>
                )}
                {status === "success" && (
                    <CheckCircle2 size={18} className="text-green-500" />
                )}
                {status === "failed" && (
                    <AlertTriangle size={18} className="text-amber-500" />
                )}
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">
                    {status === "repairing" && (
                        <>
                            🔧 Reparando automáticamente
                            {maxAttempts > 1 && (
                                <span className="text-muted-foreground font-normal">
                                    {" "}
                                    (intento {attempt}/{maxAttempts})
                                </span>
                            )}
                        </>
                    )}
                    {status === "success" && "✅ Error reparado correctamente"}
                    {status === "failed" &&
                        "⚠️ No se pudo reparar automáticamente"}
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
                {errorMessage && status !== "success" && (
                    <p className="text-xs text-red-400/80 mt-1 truncate font-mono">
                        {errorMessage.length > 100
                            ? errorMessage.slice(0, 100) + "…"
                            : errorMessage}
                    </p>
                )}
            </div>
        </div>
    );
}
