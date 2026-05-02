/**
 * VercelPublishButton — compact publish button for the Git toolbar.
 * Shows a popover with Vercel project status, deployment URL, and latest deployment.
 * If not connected, opens a setup dialog.
 */
import { useState, useCallback, useEffect, useRef } from "react";
import { ipc } from "@/ipc/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
    Triangle,
    Loader2,
    Globe,
    ExternalLink,
    Plus,
    Search,
    Check,
    X,
    RefreshCw,
} from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { useSettings } from "@/hooks/useSettings";
import { useVercelDeployments } from "@/hooks/useVercelDeployments";
import type { App } from "@/ipc/types";

// ─── Vercel Setup Dialog ──────────────────────────────────────────────────────

interface VercelSetupDialogProps {
    appId: number;
    appName: string;
    isOpen: boolean;
    onClose: () => void;
    onLinked: () => void;
}

interface VercelProject {
    id: string;
    name: string;
    framework?: string | null;
}

function VercelSetupDialog({ appId, appName, isOpen, onClose, onLinked }: VercelSetupDialogProps) {
    const { settings, refreshSettings } = useSettings();
    const hasToken = !!settings?.vercelAccessToken;
    const [mode, setMode] = useState<"choose" | "create" | "existing">("choose");
    const [isWorking, setIsWorking] = useState(false);

    // Token entry
    const [tokenInput, setTokenInput] = useState("");
    const [isSavingToken, setIsSavingToken] = useState(false);

    // Create mode
    const [projectName, setProjectName] = useState(
        appName.replace(/[^a-zA-Z0-9_.-]/g, "-").toLowerCase(),
    );
    const [projectAvailable, setProjectAvailable] = useState<boolean | null>(null);
    const [isCheckingName, setIsCheckingName] = useState(false);
    const debounceRef = useRef<NodeJS.Timeout | null>(null);

    // Existing mode
    const [projects, setProjects] = useState<VercelProject[]>([]);
    const [isLoadingProjects, setIsLoadingProjects] = useState(false);
    const [projectSearch, setProjectSearch] = useState("");
    const [selectedProject, setSelectedProject] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setMode("choose");
            setIsWorking(false);
            setProjectAvailable(null);
            setSelectedProject(null);
            setProjectSearch("");
            setTokenInput("");
            setProjectName(appName.replace(/[^a-zA-Z0-9_.-]/g, "-").toLowerCase());
        }
    }, [isOpen, appName]);

    // Check name availability
    const checkAvailability = useCallback(async (name: string) => {
        if (!name.trim()) { setProjectAvailable(null); return; }
        setIsCheckingName(true);
        try {
            const result = await ipc.vercel.isProjectAvailable({ name });
            setProjectAvailable(result.available);
        } catch { setProjectAvailable(null); }
        finally { setIsCheckingName(false); }
    }, []);

    useEffect(() => {
        if (mode !== "create") return;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => checkAvailability(projectName), 400);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [projectName, mode, checkAvailability]);

    // Load projects
    const loadProjects = useCallback(async () => {
        setIsLoadingProjects(true);
        try { setProjects(await ipc.vercel.listProjects()); }
        catch { toast.error("Error al cargar proyectos"); }
        finally { setIsLoadingProjects(false); }
    }, []);

    useEffect(() => { if (mode === "existing") loadProjects(); }, [mode, loadProjects]);

    // Save token
    const handleSaveToken = async () => {
        if (!tokenInput.trim()) return;
        setIsSavingToken(true);
        try {
            await ipc.vercel.saveToken({ token: tokenInput.trim() });
            toast.success("Token de Vercel guardado");
            setTokenInput("");
            refreshSettings();
        } catch (err: any) {
            toast.error(err.message || "Error al guardar token");
        } finally { setIsSavingToken(false); }
    };

    // Create project
    const handleCreate = async () => {
        if (!projectName.trim() || projectAvailable === false) return;
        setIsWorking(true);
        try {
            await ipc.vercel.createProject({ name: projectName, appId });
            toast.success(`Proyecto ${projectName} creado en Vercel`);
            onLinked();
            onClose();
        } catch (err: any) {
            toast.error(err.message || "Error al crear proyecto");
        } finally { setIsWorking(false); }
    };

    // Connect existing project
    const handleConnect = async () => {
        if (!selectedProject) return;
        setIsWorking(true);
        try {
            await ipc.vercel.connectExistingProject({ projectId: selectedProject, appId });
            toast.success("Proyecto de Vercel vinculado");
            onLinked();
            onClose();
        } catch (err: any) {
            toast.error(err.message || "Error al vincular proyecto");
        } finally { setIsWorking(false); }
    };

    const filteredProjects = projects.filter((p) =>
        p.name.toLowerCase().includes(projectSearch.toLowerCase()),
    );

    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="sm:max-w-md" showCloseButton={true}>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                            <Triangle size={16} className="text-foreground" />
                        </div>
                        Publicar en Vercel
                    </DialogTitle>
                    <DialogDescription>
                        Despliega tu aplicación en Vercel para hacerla accesible en la web.
                    </DialogDescription>
                </DialogHeader>

                {/* No token → token entry */}
                {!hasToken && (
                    <div className="space-y-3 pt-2">
                        <div className="bg-muted/50 border border-border rounded-lg p-3 space-y-2">
                            <p className="text-xs text-muted-foreground">
                                Necesitas un token de acceso de Vercel. Créalo en la configuración de tu cuenta.
                            </p>
                            <Button
                                variant="outline"
                                size="sm"
                                className="w-full text-xs cursor-pointer"
                                onClick={() => ipc.system.openExternalUrl("https://vercel.com/account/settings/tokens")}
                            >
                                <ExternalLink size={12} className="mr-1.5" />
                                Abrir ajustes de Vercel
                            </Button>
                        </div>
                        <div className="flex gap-2">
                            <Input
                                type="password"
                                value={tokenInput}
                                onChange={(e) => setTokenInput(e.target.value)}
                                placeholder="Token de acceso"
                                className="h-9 text-sm flex-1"
                                disabled={isSavingToken}
                                onKeyDown={(e) => { if (e.key === "Enter") handleSaveToken(); }}
                                autoFocus
                            />
                            <Button
                                className="h-9 text-sm px-4 cursor-pointer"
                                onClick={handleSaveToken}
                                disabled={!tokenInput.trim() || isSavingToken}
                            >
                                {isSavingToken ? <Loader2 size={14} className="animate-spin" /> : "Guardar"}
                            </Button>
                        </div>
                    </div>
                )}

                {/* Has token → choose mode */}
                {hasToken && mode === "choose" && (
                    <div className="space-y-2 pt-2">
                        <button
                            onClick={() => setMode("create")}
                            className={cn(
                                "group w-full flex items-center gap-3 p-3.5 rounded-lg border border-border",
                                "bg-muted/20 hover:bg-accent hover:border-primary/20",
                                "transition-all duration-200 cursor-pointer text-left",
                            )}
                        >
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground group-hover:bg-primary/10 transition-colors">
                                <Plus size={18} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-foreground">Crear nuevo proyecto</p>
                                <p className="text-xs text-muted-foreground mt-0.5">Crea un proyecto en Vercel y despliega automáticamente</p>
                            </div>
                        </button>
                        <button
                            onClick={() => setMode("existing")}
                            className={cn(
                                "group w-full flex items-center gap-3 p-3.5 rounded-lg border border-border",
                                "bg-muted/20 hover:bg-accent hover:border-primary/20",
                                "transition-all duration-200 cursor-pointer text-left",
                            )}
                        >
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary/15 transition-colors">
                                <Search size={18} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-foreground">Vincular proyecto existente</p>
                                <p className="text-xs text-muted-foreground mt-0.5">Conecta con un proyecto que ya tienes en Vercel</p>
                            </div>
                        </button>
                    </div>
                )}

                {/* Create mode */}
                {hasToken && mode === "create" && (
                    <div className="space-y-3 pt-2">
                        <div className="flex items-center gap-2 mb-1">
                            <button onClick={() => setMode("choose")} className="p-1 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground cursor-pointer">
                                <X size={14} />
                            </button>
                            <Plus size={14} className="text-foreground" />
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Nuevo proyecto</span>
                        </div>
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <Input
                                    value={projectName}
                                    onChange={(e) => { setProjectName(e.target.value); setProjectAvailable(null); }}
                                    placeholder="nombre-del-proyecto"
                                    className={cn(
                                        "h-9 text-sm pr-8",
                                        projectAvailable === true && "border-primary/50",
                                        projectAvailable === false && "border-destructive/50",
                                    )}
                                    disabled={isWorking}
                                    onKeyDown={(e) => { if (e.key === "Enter" && projectAvailable) handleCreate(); }}
                                    autoFocus
                                />
                                <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                                    {isCheckingName && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
                                    {!isCheckingName && projectAvailable === true && <Check size={14} className="text-primary" />}
                                    {!isCheckingName && projectAvailable === false && <X size={14} className="text-destructive" />}
                                </div>
                            </div>
                            <Button
                                className="h-9 text-sm font-medium px-5 cursor-pointer"
                                onClick={handleCreate}
                                disabled={isWorking || !projectName.trim() || projectAvailable === false || isCheckingName}
                            >
                                {isWorking ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Triangle size={12} className="mr-1.5" />}
                                Crear
                            </Button>
                        </div>
                        {projectAvailable === false && <p className="text-xs text-destructive">Ese nombre ya está en uso</p>}
                    </div>
                )}

                {/* Existing mode */}
                {hasToken && mode === "existing" && (
                    <div className="space-y-3 pt-2">
                        <div className="flex items-center gap-2 mb-1">
                            <button onClick={() => setMode("choose")} className="p-1 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground cursor-pointer">
                                <X size={14} />
                            </button>
                            <Triangle size={14} className="text-foreground" />
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Vincular proyecto</span>
                        </div>
                        <div className="relative">
                            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                value={projectSearch}
                                onChange={(e) => setProjectSearch(e.target.value)}
                                placeholder="Buscar proyecto..."
                                className="h-8 text-sm pl-8"
                                disabled={isWorking}
                                autoFocus
                            />
                        </div>
                        <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-background">
                            {isLoadingProjects ? (
                                <div className="flex items-center justify-center py-6"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
                            ) : filteredProjects.length === 0 ? (
                                <p className="text-xs text-muted-foreground text-center py-6">{projectSearch ? "Sin resultados" : "No hay proyectos"}</p>
                            ) : (
                                filteredProjects.map((p) => (
                                    <button
                                        key={p.id}
                                        className={cn(
                                            "flex items-center gap-2.5 w-full px-3 py-2 text-sm text-left transition-colors cursor-pointer",
                                            selectedProject === p.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted text-foreground",
                                        )}
                                        onClick={() => setSelectedProject(p.id)}
                                        disabled={isWorking}
                                    >
                                        <Triangle size={12} className="text-muted-foreground shrink-0" />
                                        <span className="truncate">{p.name}</span>
                                        {p.framework && <span className="text-[10px] text-muted-foreground ml-auto">{p.framework}</span>}
                                        {selectedProject === p.id && <Check size={14} className="ml-auto text-primary shrink-0" />}
                                    </button>
                                ))
                            )}
                        </div>
                        <Button className="w-full h-9 text-sm font-medium cursor-pointer" onClick={handleConnect} disabled={!selectedProject || isWorking}>
                            {isWorking ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Triangle size={14} className="mr-1.5" />}
                            Vincular
                        </Button>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}

// ─── Deployment status badge helper ───────────────────────────────────────────

function DeploymentBadge({ state }: { state: string }) {
    const isReady = state === "READY";
    const isBuilding = state === "BUILDING" || state === "INITIALIZING";
    const isError = state === "ERROR";

    return (
        <span className={cn(
            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider",
            isReady && "bg-primary/10 text-primary",
            isBuilding && "bg-primary/10 text-primary",
            isError && "bg-destructive/10 text-destructive",
            !isReady && !isBuilding && !isError && "bg-muted text-muted-foreground",
        )}>
            <span className={cn(
                "h-1.5 w-1.5 rounded-full",
                isReady && "bg-primary",
                isBuilding && "bg-primary animate-pulse",
                isError && "bg-destructive",
                !isReady && !isBuilding && !isError && "bg-muted-foreground",
            )} />
            {state}
        </span>
    );
}

// ─── Main Publish Button ──────────────────────────────────────────────────────

interface VercelPublishButtonProps {
    appId: number;
    app: App;
    refreshApp: () => void;
}

export function VercelPublishButton({ appId, app, refreshApp }: VercelPublishButtonProps) {
    const { settings } = useSettings();
    const hasVercelToken = !!settings?.vercelAccessToken;
    const isConnected = !!app.vercelProjectId;
    const [showSetupDialog, setShowSetupDialog] = useState(false);
    const [isPopoverOpen, setIsPopoverOpen] = useState(false);

    // Only fetch deployments when connected
    const {
        deployments,
        isLoading: isLoadingDeployments,
        getDeployments,
        disconnectProject,
        isDisconnecting,
    } = useVercelDeployments(appId, { enabled: isConnected });

    const latestDeployment = deployments[0];
    const isDeploying = latestDeployment?.readyState === "BUILDING" || latestDeployment?.readyState === "INITIALIZING";

    const handleRefresh = async () => {
        await getDeployments();
        refreshApp();
    };

    const handleDisconnect = async () => {
        await disconnectProject();
        refreshApp();
        setIsPopoverOpen(false);
    };

    // Not connected → button opens dialog
    if (!isConnected) {
        return (
            <>
                <Popover>
                    <PopoverTrigger asChild>
                        <button
                            onClick={() => setShowSetupDialog(true)}
                            className={cn(
                                "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold",
                                "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
                                "transition-all duration-200 cursor-pointer border border-border",
                            )}
                        >
                            <Triangle size={12} />
                            Publicar
                        </button>
                    </PopoverTrigger>
                </Popover>
                <VercelSetupDialog
                    appId={appId}
                    appName={app.name}
                    isOpen={showSetupDialog}
                    onClose={() => setShowSetupDialog(false)}
                    onLinked={refreshApp}
                />
            </>
        );
    }

    // Connected → popover with status
    return (
        <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
            <PopoverTrigger asChild>
                <button
                    className={cn(
                        "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold",
                        "transition-all duration-200 cursor-pointer border",
                        isDeploying
                            ? "bg-primary/10 text-primary border-primary/20 hover:bg-primary/15"
                            : latestDeployment?.readyState === "READY"
                                ? "bg-primary/10 text-primary border-primary/20 hover:bg-primary/15"
                                : "bg-muted text-foreground border-border hover:bg-accent",
                    )}
                >
                    {isDeploying ? (
                        <Loader2 size={12} className="animate-spin" />
                    ) : (
                        <Triangle size={12} />
                    )}
                    Publicar
                </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-0" sideOffset={8}>
                <div className="p-3 space-y-2.5">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Triangle size={14} className="text-foreground" />
                            <span className="text-sm font-semibold">{app.vercelProjectName}</span>
                        </div>
                        <button
                            onClick={() => ipc.system.openExternalUrl(`https://vercel.com/${app.vercelTeamSlug}/${app.vercelProjectName}`)}
                            className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                            <ExternalLink size={13} />
                        </button>
                    </div>

                    {/* Live URL */}
                    {app.vercelDeploymentUrl && (
                        <button
                            onClick={() => ipc.system.openExternalUrl(app.vercelDeploymentUrl!)}
                            className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-muted/50 hover:bg-muted text-xs text-primary hover:underline transition-colors cursor-pointer text-left truncate"
                        >
                            <Globe size={11} className="shrink-0" />
                            <span className="truncate">{app.vercelDeploymentUrl.replace("https://", "")}</span>
                        </button>
                    )}

                    {/* Latest deployment */}
                    {latestDeployment && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <DeploymentBadge state={latestDeployment.readyState} />
                            <span>{new Date(latestDeployment.createdAt).toLocaleString()}</span>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-1.5 pt-1 border-t border-border">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="flex-1 h-7 text-xs cursor-pointer"
                            onClick={handleRefresh}
                            disabled={isLoadingDeployments}
                        >
                            {isLoadingDeployments ? <Loader2 size={11} className="animate-spin mr-1" /> : <RefreshCw size={11} className="mr-1" />}
                            Refrescar
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="flex-1 h-7 text-xs text-destructive hover:text-destructive cursor-pointer"
                            onClick={handleDisconnect}
                            disabled={isDisconnecting}
                        >
                            {isDisconnecting ? <Loader2 size={11} className="animate-spin mr-1" /> : <X size={11} className="mr-1" />}
                            Desconectar
                        </Button>
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
