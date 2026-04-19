import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Flame, LogOut } from "@/components/ui/icons";
import { useSettings } from "@/hooks/useSettings";
import { useFirebase } from "@/hooks/useFirebase";
import { showSuccess, showError } from "@/lib/toast";

export function FirebaseIntegration() {
    const { settings } = useSettings();
    const { isConnected, disconnect } = useFirebase();
    const [isDisconnecting, setIsDisconnecting] = useState(false);

    if (!isConnected) {
        return null;
    }

    const handleDisconnect = async () => {
        setIsDisconnecting(true);
        try {
            await disconnect();
            showSuccess("Cuenta de Firebase desconectada con éxito");
        } catch (err: any) {
            showError(err.message || "Error al desconectar de Firebase");
        } finally {
            setIsDisconnecting(false);
        }
    };

    return (
        <div className="space-y-8 p-6 rounded-2xl bg-muted/30 border border-border">
            <div className="flex items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-card shadow-sm border border-border">
                        <Flame className="h-6 w-6" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-foreground">
                            Firebase
                        </h3>
                        <p className="typo-caption mt-0.5">
                            Cuenta de Google conectada
                        </p>
                    </div>
                </div>

                <Button
                    onClick={handleDisconnect}
                    variant="ghost"
                    size="sm"
                    disabled={isDisconnecting}
                    className="rounded-xl h-10 px-4 font-bold text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors"
                >
                    <LogOut className="h-4 w-4 mr-2" />
                    {isDisconnecting ? "Desconectando..." : "Desconectar cuenta"}
                </Button>
            </div>
        </div>
    );
}
