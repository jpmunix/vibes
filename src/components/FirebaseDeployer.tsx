import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Flame, ExternalLink, RefreshCw, Globe } from "lucide-react";
import { ipc, App } from "@/ipc/types";
import { toast } from "sonner";
import { useLoadApp } from "@/hooks/useLoadApp";

interface FirebaseDeployerProps {
    appId: number;
    app: App;
}

export function FirebaseDeployer({ appId, app }: FirebaseDeployerProps) {
    const [isDeploying, setIsDeploying] = useState(false);
    const { refreshApp } = useLoadApp(appId);

    const handleDeploy = async () => {
        setIsDeploying(true);
        try {
            const result = await ipc.firebase.deploy({ appId });
            if (result.success) {
                toast.success("¡Despliegue en Firebase completado con éxito!");
                refreshApp();
            } else {
                toast.error("Error en el despliegue: " + result.message);
            }
        } catch (error: any) {
            toast.error("Error al iniciar el despliegue: " + error.message);
        } finally {
            setIsDeploying(false);
        }
    };

    const openConsole = () => {
        ipc.system.openExternalUrl(`https://console.firebase.google.com/project/${app.firebaseProjectId}/hosting/main`);
    };

    const openHostingUrl = () => {
        if (app.firebaseProjectId) {
            ipc.system.openExternalUrl(`https://${app.firebaseProjectId}.web.app`);
        }
    };

    return (
        <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/20">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-orange-100 dark:bg-orange-900/30">
                        <Flame className="h-5 w-5 text-orange-500" />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {app.firebaseProjectId}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            Proyecto conectado
                        </p>
                    </div>
                </div>
                <Button variant="ghost" size="icon" onClick={openConsole} title="Abrir consola de Firebase">
                    <ExternalLink className="h-4 w-4" />
                </Button>
            </div>

            <div className="flex flex-wrap gap-2">
                <Button
                    onClick={handleDeploy}
                    disabled={isDeploying}
                    className="bg-orange-600 hover:bg-orange-700 text-white"
                >
                    {isDeploying ? (
                        <>
                            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                            Desplegando...
                        </>
                    ) : (
                        <>
                            <Flame className="h-4 w-4 mr-2" />
                            Desplegar en Firebase
                        </>
                    )}
                </Button>

                {app.firebaseProjectId && (
                    <Button variant="outline" onClick={openHostingUrl}>
                        <Globe className="h-4 w-4 mr-2" />
                        Ver sitio en vivo
                    </Button>
                )}
            </div>

            {isDeploying && (
                <p className="text-[10px] text-gray-500 italic">
                    Puedes ver el progreso en la pestaña de mensajes del sistema (Consola).
                </p>
            )}
        </div>
    );
}
