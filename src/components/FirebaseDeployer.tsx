import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Flame, ExternalLink, RefreshCw, Globe, AlertCircle } from "@/components/ui/icons";
import { ipc, App } from "@/ipc/types";
import { toast } from "sonner";
import { useLoadApp } from "@/hooks/useLoadApp";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

interface FirebaseDeployerProps {
    appId: number;
    app: App;
}

export function FirebaseDeployer({ appId, app }: FirebaseDeployerProps) {
    const [isDeploying, setIsDeploying] = useState(false);
    const [showEnableApiDialog, setShowEnableApiDialog] = useState(false);
    const [activationUrl, setActivationUrl] = useState("");
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
            const errorMessage = error.message || "";
            if (errorMessage.startsWith("HOSTING_API_DISABLED|")) {
                const url = errorMessage.split("|")[1];
                setActivationUrl(url);
                setShowEnableApiDialog(true);
            } else {
                toast.error("Error al iniciar el despliegue: " + error.message);
            }
        } finally {
            setIsDeploying(false);
        }
    };

    const handleEnableApi = () => {
        if (activationUrl) {
            ipc.system.openExternalUrl(activationUrl);
            setShowEnableApiDialog(false);
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
        <>
            <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/20">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-full bg-orange-100 dark:bg-orange-900/30">
                            <Flame className="h-5 w-5 text-orange-500" />
                        </div>
                        <div>
                            <p className="typo-label text-foreground">
                                {app.firebaseProjectId}
                            </p>
                            <p className="typo-caption text-muted-foreground">
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
                    <p className="typo-caption text-muted-foreground italic">
                        Puedes ver el progreso en la pestaña de mensajes del sistema (Consola).
                    </p>
                )}
            </div>

            <Dialog open={showEnableApiDialog} onOpenChange={setShowEnableApiDialog}>
                <DialogContent>
                    <DialogHeader>
                        <div className="flex items-center gap-2 text-orange-600 mb-2">
                            <AlertCircle className="h-5 w-5" />
                            <DialogTitle>API de Hosting Deshabilitada</DialogTitle>
                        </div>
                        <DialogDescription className="space-y-3">
                            <p>
                                Para poder desplegar tu aplicación, necesitas habilitar el servicio de **Firebase Hosting** en tu proyecto de Google Cloud.
                            </p>
                            <p className="typo-caption bg-gray-100 dark:bg-gray-800 p-2 rounded border">
                                Proyecto: <span className="typo-mono">{app.firebaseProjectId}</span>
                            </p>
                            <p>
                                Haz clic en el siguiente botón para abrir la consola de Google y activar el servicio. Una vez activado, espera unos 30 segundos y vuelve a intentar el despliegue.
                            </p>
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="mt-4">
                        <Button variant="outline" onClick={() => setShowEnableApiDialog(false)}>
                            Cancelar
                        </Button>
                        <Button onClick={handleEnableApi} className="bg-orange-600 hover:bg-orange-700 text-white">
                            Habilitar en Google Console
                            <ExternalLink className="ml-2 h-4 w-4" />
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
