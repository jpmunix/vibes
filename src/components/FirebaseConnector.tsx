import { useEffect, useState } from "react";
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
import { ExternalLink, RefreshCw, Flame, LogOut, Plus, ChevronLeft } from "lucide-react";
import { FIREBASE_AUTH_CONFIG } from "@/shared/firebase_auth_config";
import { Input } from "@/components/ui/input";

export function FirebaseConnector({ appId, noCard = false }: { appId: number, noCard?: boolean }) {
    const { refreshSettings } = useSettings();
    const { app, refreshApp } = useLoadApp(appId);
    const { lastDeepLink, clearLastDeepLink } = useDeepLink();

    const [showCreateForm, setShowCreateForm] = useState(false);
    const [newProjectId, setNewProjectId] = useState("");
    const [newDisplayName, setNewDisplayName] = useState("");
    const [isConnecting, setIsConnecting] = useState(false);
    const [isInternalProcessing, setIsInternalProcessing] = useState(false);

    // Multi-step selection
    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
    const [webApps, setWebApps] = useState<any[]>([]);
    const [isLoadingWebApps, setIsLoadingWebApps] = useState(false);
    const [showCreateWebAppForm, setShowCreateWebAppForm] = useState(false);
    const [newWebAppName, setNewWebAppName] = useState("");

    const {
        projects,
        isConnected,
        isLoadingProjects,
        isFetchingProjects,
        projectsError,
        refetchProjects,
        setAppProject,
        unsetAppProject,
        disconnect,
        createProject,
        isCreatingProject,
        getProjectConfig,
        listWebApps,
        createWebApp,
    } = useFirebase();

    const isWorking = isCreatingProject || isConnecting || isInternalProcessing || isLoadingWebApps;

    // Validate current project connection
    useEffect(() => {
        const timer = setTimeout(() => {
            if (isConnected &&
                app?.firebaseProjectId &&
                !isLoadingProjects &&
                !isFetchingProjects &&
                !isWorking &&
                !showCreateForm &&
                !selectedProjectId &&
                projects.length > 0
            ) {
                const projectStillExists = projects.some(p => p.projectId === app.firebaseProjectId);
                if (!projectStillExists) {
                    unsetAppProject(appId).then(() => {
                        toast.error("El proyecto que estaba conectado ya no existe en Firebase.");
                        refreshApp();
                    });
                }
            }
        }, 3000);
        return () => clearTimeout(timer);
    }, [isConnected, app?.firebaseProjectId, projects, isLoadingProjects, isFetchingProjects, isWorking, showCreateForm, selectedProjectId]);

    useEffect(() => {
        if (isConnected) refetchProjects();
    }, [isConnected, refetchProjects]);

    useEffect(() => {
        if (app?.name && !newDisplayName) {
            setNewDisplayName(app.name);
            const slug = app.name.toLowerCase().replace(/[^a-z0-9]/g, "-").slice(0, 20);
            const random = Math.floor(Math.random() * 10000);
            setNewProjectId(`${slug}-${random}`);
        }
    }, [app?.name]);

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

    const handleProjectSelect = async (projectId: string, firebaseWebAppId?: string, displayName?: string) => {
        setIsConnecting(true);
        try {
            const config = await getProjectConfig(projectId, firebaseWebAppId, displayName);
            await setAppProject({
                appId,
                projectId,
                config,
            });
            toast.success("Proyecto Firebase conectado con éxito");
            await refreshApp();
            setSelectedProjectId(null);
            return true;
        } catch (error: any) {
            toast.error("Error al conectar el proyecto: " + error.message);
            return false;
        } finally {
            setIsConnecting(false);
        }
    };

    const fetchApps = async (projectId: string) => {
        setIsLoadingWebApps(true);
        try {
            const apps = await listWebApps(projectId);
            setWebApps(apps);
        } catch (error: any) {
            toast.error("Error al cargar Apps web: " + error.message);
        } finally {
            setIsLoadingWebApps(false);
        }
    };

    const onSelectProjectFromList = async (projectId: string) => {
        setSelectedProjectId(projectId);
        setShowCreateWebAppForm(false);
        setNewWebAppName(app?.name || "");
        await fetchApps(projectId);
    };

    const handleCreateWebApp = async () => {
        if (!selectedProjectId || !newWebAppName) return;
        setIsInternalProcessing(true);
        try {
            const result = await createWebApp(selectedProjectId, newWebAppName);
            await handleProjectSelect(selectedProjectId, result.appId, newWebAppName);
        } catch (error: any) {
            toast.error("Error al crear App web: " + error.message);
        } finally {
            setIsInternalProcessing(false);
        }
    };

    const handleConnectGoogle = async () => {
        const scopes = ["https://www.googleapis.com/auth/cloud-platform", "https://www.googleapis.com/auth/firebase"].join(" ");
        const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        url.searchParams.set("client_id", FIREBASE_AUTH_CONFIG.clientId);
        url.searchParams.set("redirect_uri", FIREBASE_AUTH_CONFIG.redirectUri);
        url.searchParams.set("response_type", "code");
        url.searchParams.set("scope", scopes);
        url.searchParams.set("access_type", "offline");
        url.searchParams.set("prompt", "consent");
        await ipc.system.openExternalUrl(url.toString());
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

    const handleCreateProject = async () => {
        if (!newProjectId || !newDisplayName) {
            toast.error("Por favor completa todos los campos");
            return;
        }
        setIsInternalProcessing(true);
        try {
            const project = await createProject({ projectId: newProjectId, displayName: newDisplayName });
            // For new projects, we still handle it as a direct selection for now as it's a "fresh" start
            const success = await handleProjectSelect(project.projectId, undefined, project.displayName);
            if (success) setShowCreateForm(false);
        } catch (error: any) {
            console.error("Project creation failed", error);
        } finally {
            setIsInternalProcessing(false);
        }
    };

    // VIEW 1: Connected and has project set
    if (isConnected && app?.firebaseProjectId) {
        const content = (
            <div className="space-y-4">
                <div className="flex flex-col gap-1.5 text-sm">
                    Esta app está conectada al proyecto:{" "}
                    <Badge variant="secondary" className="text-base font-bold px-3 py-1 mt-1">
                        {app.firebaseProjectId}
                    </Badge>
                </div>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            ipc.system.openExternalUrl(`https://console.firebase.google.com/project/${app.firebaseProjectId}/overview`);
                        }}
                        className="flex-1"
                    >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Ver en consola
                    </Button>
                    <Button variant="destructive" size="sm" onClick={handleUnsetProject}>
                        Desconectar
                    </Button>
                </div>
            </div>
        );
        if (noCard) return content;
        return (
            <Card className="mt-1">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Flame className="h-5 w-5 text-orange-500" />
                        Proyecto de Firebase
                    </CardTitle>
                </CardHeader>
                <CardContent>{content}</CardContent>
            </Card>
        );
    }

    // VIEW 2: Selecting Web App within a Project
    if (isConnected && selectedProjectId) {
        const content = (
            <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                    <Button variant="ghost" size="icon" onClick={() => setSelectedProjectId(null)} className="h-8 w-8" disabled={isWorking}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="flex flex-col">
                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Proyecto</span>
                        <span className="text-sm font-medium leading-none">{selectedProjectId}</span>
                    </div>
                </div>

                {isLoadingWebApps ? (
                    <div className="space-y-2 py-4">
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                    </div>
                ) : showCreateWebAppForm ? (
                    <div className="space-y-4 p-3 border rounded-lg bg-muted/20">
                        <div className="space-y-2">
                            <Label htmlFor="web-app-name">Nombre de la nueva App Web</Label>
                            <Input
                                id="web-app-name"
                                value={newWebAppName}
                                onChange={(e) => setNewWebAppName(e.target.value)}
                                placeholder="Mi App Web"
                            />
                        </div>
                        <div className="flex gap-2">
                            <Button className="flex-1" onClick={handleCreateWebApp} disabled={isWorking}>
                                {isInternalProcessing ? <RefreshCw className="h-4 w-4 animate-spin" /> : "Crear y Conectar"}
                            </Button>
                            <Button variant="outline" onClick={() => setShowCreateWebAppForm(false)} disabled={isWorking}>
                                Cancelar
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <Label>Selecciona una App Web existente</Label>
                        <div className="grid gap-2">
                            {webApps.length === 0 ? (
                                <p className="text-xs text-muted-foreground italic py-2">No hay apps web en este proyecto.</p>
                            ) : (
                                webApps.map((wa) => (
                                    <Button
                                        key={wa.appId}
                                        variant="outline"
                                        className="justify-start h-auto py-3 px-4 flex flex-col items-start gap-1"
                                        onClick={() => handleProjectSelect(selectedProjectId, wa.appId)}
                                        disabled={isWorking}
                                    >
                                        <span className="font-bold">{wa.displayName || "App sin nombre"}</span>
                                        <span className="text-[10px] opacity-60 font-mono">{wa.appId}</span>
                                    </Button>
                                ))
                            )}
                            <Button
                                variant="ghost"
                                className="mt-2 border-dashed border-2 h-14"
                                onClick={() => setShowCreateWebAppForm(true)}
                                disabled={isWorking}
                            >
                                <Plus className="h-4 w-4 mr-2" />
                                Crear nueva App Web
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        );

        if (noCard) return content;

        return (
            <Card className="mt-1">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Flame className="h-5 w-5 text-orange-500" />
                        Configurar App Web
                    </CardTitle>
                    <CardDescription>
                        Un proyecto de Firebase puede contener múltiples Apps Web.
                    </CardDescription>
                </CardHeader>
                <CardContent>{content}</CardContent>
            </Card>
        );
    }

    // VIEW 3: Selecting/Creating Project
    if (isConnected) {
        const content = showCreateForm ? (
            <div className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="new-project-name">Nombre mostrado</Label>
                    <Input
                        id="new-project-name"
                        value={newDisplayName}
                        onChange={(e) => setNewDisplayName(e.target.value)}
                        placeholder="Mi Gran Proyecto"
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="new-project-id">Project ID (Único globalmente)</Label>
                    <Input
                        id="new-project-id"
                        value={newProjectId}
                        onChange={(e) => setNewProjectId(e.target.value)}
                        placeholder="mi-proyecto-123"
                    />
                </div>
                <div className="flex gap-2 pt-2">
                    <Button className="flex-1" onClick={handleCreateProject} disabled={isWorking}>
                        {isWorking ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : "Crear Proyecto"}
                    </Button>
                    <Button variant="outline" onClick={() => setShowCreateForm(false)} disabled={isWorking}>
                        Cancelar
                    </Button>
                </div>
            </div>
        ) : (
            <div className="space-y-4">
                {isLoadingProjects || isConnecting ? (
                    <div className="py-4 flex flex-col items-center justify-center">
                        <RefreshCw className="h-8 w-8 text-primary animate-spin mb-2" />
                        <p className="text-sm font-medium text-muted-foreground">
                            {isConnecting ? "Configurando..." : "Cargando proyectos..."}
                        </p>
                    </div>
                ) : projectsError ? (
                    <div className="text-red-500 text-sm">
                        Error: {projectsError.message}
                        <Button variant="outline" size="sm" className="mt-2 block" onClick={() => refetchProjects()}>Reintentar</Button>
                    </div>
                ) : (
                    <div className="space-y-2">
                        <Label htmlFor="project-select">Seleccionar proyecto existente</Label>
                        <div className="flex gap-2">
                            <div className="flex-1">
                                <Select value="" onValueChange={onSelectProjectFromList}>
                                    <SelectTrigger id="project-select">
                                        <SelectValue placeholder="Selecciona un proyecto" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectGroup>
                                            {projects.map((p) => (
                                                <SelectItem key={p.projectId} value={p.projectId}>
                                                    {p.displayName || p.projectId}
                                                </SelectItem>
                                            ))}
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                            </div>
                            <Button variant="outline" size="icon" onClick={() => setShowCreateForm(true)} title="Nuevo proyecto">
                                <Plus className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                )}
                <div className="pt-2 border-t flex justify-end">
                    <Button variant="ghost" size="sm" onClick={disconnect} className="text-xs text-muted-foreground hover:text-red-500">
                        <LogOut className="h-3 w-3 mr-1" />
                        Desconectar Google
                    </Button>
                </div>
            </div>
        );

        if (noCard) return content;
        return (
            <Card className="mt-1">
                <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Flame className="h-5 w-5 text-orange-500" />
                            {showCreateForm ? "Nuevo Proyecto" : "Firebase"}
                        </div>
                        {!showCreateForm && (
                            <Button variant="outline" size="icon" onClick={() => refetchProjects()} disabled={isFetchingProjects} className="h-8 w-8">
                                <RefreshCw className={`h-4 w-4 ${isFetchingProjects ? "animate-spin" : ""}`} />
                            </Button>
                        )}
                    </CardTitle>
                    <CardDescription>
                        {showCreateForm ? "Carga un nuevo proyecto de Firebase" : "Selecciona un proyecto para esta app."}
                    </CardDescription>
                </CardHeader>
                <CardContent>{content}</CardContent>
            </Card>
        );
    }

    // VIEW 4: Not connected
    const content = (
        <Button onClick={handleConnectGoogle} className="w-full bg-[#4285F4] hover:bg-[#357ae8] text-white">
            <svg className="mr-2 h-4 w-4" viewBox="0 0 488 512">
                <path fill="currentColor" d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"></path>
            </svg>
            Conectar con Google
        </Button>
    );

    if (noCard) return content;
    return (
        <Card className="mt-1 border-dashed">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Flame className="h-5 w-5 text-orange-500" />
                    Firebase
                </CardTitle>
                <CardDescription>Conecta tu cuenta de Google para gestionar tus proyectos.</CardDescription>
            </CardHeader>
            <CardContent>{content}</CardContent>
        </Card>
    );
}
