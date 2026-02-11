import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ipc } from "@/ipc/types";
import { toast } from "sonner";
import { useSettings } from "@/hooks/useSettings";
import { useFirebase } from "@/hooks/useFirebase";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useLoadApp } from "@/hooks/useLoadApp";
import { useDeepLink } from "@/contexts/DeepLinkContext";
import { ExternalLink, RefreshCw, Flame, LogOut } from "lucide-react";

export function FirebaseConnector({ appId }: { appId: number }) {
    const { refreshSettings } = useSettings();
    const { app, refreshApp } = useLoadApp(appId);
    const { lastDeepLink, clearLastDeepLink } = useDeepLink();

    const {
        projects,
        isConnected,
        isLoadingProjects,
        isFetchingProjects,
        projectsError,
        refetchProjects,
        setAppProject,
        unsetAppProject,
        getProjectConfig,
    } = useFirebase();

    useEffect(() => {
        const handleDeepLink = async () => {
            if (lastDeepLink?.type === "firebase-oauth-return") {
                await refreshSettings();
                await refetchProjects();
                await refreshApp();
                clearLastDeepLink();
            }
        };
        handleDeepLink();
    }, [lastDeepLink?.timestamp]);

    const handleProjectSelect = async (projectId: string) => {
        try {
            const config = await getProjectConfig(projectId);
            await setAppProject({
                appId,
                projectId,
                config,
            });
            toast.success("Proyecto Firebase conectado con éxito");
            await refreshApp();
        } catch (error) {
            toast.error("Error al conectar el proyecto: " + error);
        }
    };

    const handleConnectGoogle = async () => {
        await ipc.system.openExternalUrl(
            "https://oauth.dyad.sh/api/integrations/firebase/login"
        );
    };

    const handleUnsetProject = async () => {
        try {
            await unsetAppProject(appId);
            toast.success("Proyecto Firebase desconectado");
            await refreshApp();
        } catch (error) {
            toast.error("Error al desconectar el proyecto");
        }
    };

    // Connected and has project set
    if (isConnected && app?.firebaseProjectId) {
        return (
            <Card className="mt-1">
                <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Flame className="h-5 w-5 text-orange-500" />
                            Proyecto de Firebase
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                ipc.system.openExternalUrl(
                                    `https://console.firebase.google.com/project/${app.firebaseProjectId}/overview`
                                );
                            }}
                            className="px-2"
                        >
                            <ExternalLink className="h-4 w-4" />
                        </Button>
                    </CardTitle>
                    <CardDescription className="flex flex-col gap-1.5 text-sm">
                        Esta app está conectada al proyecto:{" "}
                        <Badge variant="secondary" className="ml-2 text-base font-bold px-3 py-1">
                            {app.firebaseProjectId}
                        </Badge>
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <Button variant="destructive" onClick={handleUnsetProject}>
                            Desconectar proyecto
                        </Button>
                    </div>
                </CardContent>
            </Card>
        );
    }

    // Connected but no project set
    if (isConnected) {
        return (
            <Card className="mt-1">
                <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Flame className="h-5 w-5 text-orange-500" />
                            Proyectos de Firebase
                        </div>
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => refetchProjects()}
                            disabled={isFetchingProjects}
                        >
                            <RefreshCw className={`h-4 w-4 ${isFetchingProjects ? "animate-spin" : ""}`} />
                        </Button>
                    </CardTitle>
                    <CardDescription>
                        Selecciona un proyecto de Firebase para conectar a esta app
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoadingProjects ? (
                        <div className="space-y-2">
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-10 w-full" />
                        </div>
                    ) : projectsError ? (
                        <div className="text-red-500">
                            Error al cargar proyectos: {projectsError.message}
                            <Button variant="outline" className="mt-2" onClick={() => refetchProjects()}>
                                Reintentar
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="project-select">Proyecto</Label>
                                <Select
                                    value={app?.firebaseProjectId || ""}
                                    onValueChange={handleProjectSelect}
                                >
                                    <SelectTrigger id="project-select">
                                        <SelectValue placeholder="Selecciona un proyecto" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            {projects.map((project) => (
                                                <SelectItem key={project.projectId} value={project.projectId}>
                                                    {project.displayName || project.projectId}
                                                </SelectItem>
                                            ))}
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        );
    }

    // Not connected
    return (
        <Card className="mt-1 border-dashed">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Flame className="h-5 w-5 text-orange-500" />
                    Firebase Integración
                </CardTitle>
                <CardDescription>
                    Conecta tu cuenta de Google para gestionar tus proyectos de Firebase directamente.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Button onClick={handleConnectGoogle} className="w-full bg-[#4285F4] hover:bg-[#357ae8] text-white">
                    <svg className="mr-2 h-4 w-4" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="google" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512">
                        <path fill="currentColor" d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"></path>
                    </svg>
                    Conectar con Google
                </Button>
            </CardContent>
        </Card>
    );
}
