/**
 * GitRemoteSetupDialog — modal dialog for linking a GitHub remote
 * when the app has a GitHub token but no repo linked yet.
 * Triggered by Push / Commit & Push actions or the "no remote" badge.
 */
import { useState, useCallback, useEffect, useRef } from "react";
import { ipc } from "@/ipc/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
    Github,
    Plus,
    Search,
    Loader2,
    Check,
    X,
    Lock,
    GitBranch,
    Upload,
    Globe,
} from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";

interface GitRemoteSetupDialogProps {
    appId: number;
    appName: string;
    isOpen: boolean;
    onClose: () => void;
    onLinked: () => void;
    /** If true, auto-push after linking */
    autoPushAfterLink?: boolean;
    pushFn?: (opts: {}) => Promise<void>;
}

interface Repo {
    name: string;
    full_name: string;
    private: boolean;
}

export function GitRemoteSetupDialog({
    appId,
    appName,
    isOpen,
    onClose,
    onLinked,
    autoPushAfterLink,
    pushFn,
}: GitRemoteSetupDialogProps) {
    const [mode, setMode] = useState<"choose" | "create" | "existing">("choose");
    const [isWorking, setIsWorking] = useState(false);

    // Create mode
    const [repoName, setRepoName] = useState(
        appName.replace(/[^a-zA-Z0-9_.-]/g, "-").toLowerCase(),
    );
    const [repoAvailable, setRepoAvailable] = useState<boolean | null>(null);
    const [isCheckingName, setIsCheckingName] = useState(false);
    const debounceRef = useRef<NodeJS.Timeout | null>(null);

    // Existing mode
    const [repos, setRepos] = useState<Repo[]>([]);
    const [isLoadingRepos, setIsLoadingRepos] = useState(false);
    const [repoSearch, setRepoSearch] = useState("");
    const [selectedRepo, setSelectedRepo] = useState<string | null>(null);

    // Reset mode when dialog opens
    useEffect(() => {
        if (isOpen) {
            setMode("choose");
            setIsWorking(false);
            setRepoAvailable(null);
            setSelectedRepo(null);
            setRepoSearch("");
            setRepoName(appName.replace(/[^a-zA-Z0-9_.-]/g, "-").toLowerCase());
        }
    }, [isOpen, appName]);

    // Check name availability (debounced)
    const checkAvailability = useCallback(async (name: string) => {
        if (!name.trim()) {
            setRepoAvailable(null);
            return;
        }
        setIsCheckingName(true);
        try {
            const result = await ipc.github.isRepoAvailable({ org: "", repo: name });
            setRepoAvailable(result.available);
        } catch {
            setRepoAvailable(null);
        } finally {
            setIsCheckingName(false);
        }
    }, []);

    useEffect(() => {
        if (mode !== "create") return;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => checkAvailability(repoName), 400);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [repoName, mode, checkAvailability]);

    // Load repos
    const loadRepos = useCallback(async () => {
        setIsLoadingRepos(true);
        try {
            const data = await ipc.github.listRepos();
            setRepos(data);
        } catch {
            toast.error("Error al cargar repositorios");
        } finally {
            setIsLoadingRepos(false);
        }
    }, []);

    useEffect(() => {
        if (mode === "existing") loadRepos();
    }, [mode, loadRepos]);

    // Post-link action: push if needed
    const afterLink = useCallback(async () => {
        onLinked();
        if (autoPushAfterLink && pushFn) {
            try {
                await pushFn({});
                toast.success("Push realizado tras vincular repositorio");
            } catch (err: any) {
                toast.error(`Error en push: ${err.message}`);
            }
        }
        onClose();
    }, [onLinked, autoPushAfterLink, pushFn, onClose]);

    // Check for uncommitted changes before any repo operation
    const checkUncommittedChanges = async (): Promise<boolean> => {
        try {
            const files = await ipc.git.getUncommittedFiles({ appId });
            if (files && files.length > 0) {
                toast.error(
                    `Tienes ${files.length} archivo${files.length > 1 ? "s" : ""} sin commitear. Haz commit de tus cambios antes de vincular un repositorio remoto.`,
                    { duration: 6000 },
                );
                return false;
            }
            return true;
        } catch {
            // If we can't check, proceed anyway
            return true;
        }
    };

    // Create new private repo
    const handleCreate = async () => {
        if (!repoName.trim() || repoAvailable === false) return;
        if (!(await checkUncommittedChanges())) return;
        setIsWorking(true);
        try {
            await ipc.github.createRepo({ org: "", repo: repoName, appId, branch: "main" });
            toast.success(`Repositorio ${repoName} creado y vinculado`);
            await afterLink();
        } catch (err: any) {
            toast.error(err.message || "Error al crear el repositorio");
        } finally {
            setIsWorking(false);
        }
    };

    // Connect existing repo
    const handleConnect = async () => {
        if (!selectedRepo) return;
        if (!(await checkUncommittedChanges())) return;
        setIsWorking(true);
        try {
            const [owner, repo] = selectedRepo.split("/");
            await ipc.github.connectExistingRepo({ owner, repo, branch: "main", appId });
            toast.success(`Vinculado a ${selectedRepo}`);
            await afterLink();
        } catch (err: any) {
            toast.error(err.message || "Error al vincular el repositorio");
        } finally {
            setIsWorking(false);
        }
    };

    const filteredRepos = repos.filter((r) =>
        r.full_name.toLowerCase().includes(repoSearch.toLowerCase()),
    );

    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="sm:max-w-md" showCloseButton={true}>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                            <Github size={16} className="text-primary" />
                        </div>
                        Configurar repositorio remoto
                    </DialogTitle>
                    <DialogDescription>
                        No hay un remote Git configurado. Para poder hacer push necesitas vincular un repositorio.
                    </DialogDescription>
                </DialogHeader>

                {/* ── Choose mode ── */}
                {mode === "choose" && (
                    <div className="space-y-2 pt-2">
                        <button
                            onClick={() => setMode("create")}
                            className={cn(
                                "group w-full flex items-center gap-3 p-3.5 rounded-lg border border-border",
                                "bg-muted/20 hover:bg-green-500/5 hover:border-green-500/30",
                                "transition-all duration-200 cursor-pointer text-left",
                            )}
                        >
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-green-500/10 text-green-500 group-hover:bg-green-500/15 transition-colors">
                                <Plus size={18} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-foreground">Crear repositorio privado</p>
                                <p className="text-xs text-muted-foreground mt-0.5">Crea un nuevo repo en GitHub y vincula automáticamente</p>
                            </div>
                        </button>
                        <button
                            onClick={() => setMode("existing")}
                            className={cn(
                                "group w-full flex items-center gap-3 p-3.5 rounded-lg border border-border",
                                "bg-muted/20 hover:bg-blue-500/5 hover:border-blue-500/30",
                                "transition-all duration-200 cursor-pointer text-left",
                            )}
                        >
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500 group-hover:bg-blue-500/15 transition-colors">
                                <Search size={18} />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-foreground">Vincular repositorio existente</p>
                                <p className="text-xs text-muted-foreground mt-0.5">Conecta con un repo que ya existe en tu cuenta de GitHub</p>
                            </div>
                        </button>
                    </div>
                )}

                {/* ── Create mode ── */}
                {mode === "create" && (
                    <div className="space-y-3 pt-2">
                        <div className="flex items-center gap-2 mb-1">
                            <button
                                onClick={() => setMode("choose")}
                                className="p-1 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground cursor-pointer"
                            >
                                <X size={14} />
                            </button>
                            <Plus size={14} className="text-green-500" />
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                Nuevo repositorio privado
                            </span>
                        </div>
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <Input
                                    value={repoName}
                                    onChange={(e) => {
                                        setRepoName(e.target.value);
                                        setRepoAvailable(null);
                                    }}
                                    placeholder="nombre-del-repo"
                                    className={cn(
                                        "h-9 text-sm pr-8",
                                        repoAvailable === true && "border-green-500/50 focus-visible:ring-green-500/30",
                                        repoAvailable === false && "border-red-500/50 focus-visible:ring-red-500/30",
                                    )}
                                    disabled={isWorking}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && repoAvailable) handleCreate();
                                    }}
                                    autoFocus
                                />
                                <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                                    {isCheckingName && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
                                    {!isCheckingName && repoAvailable === true && <Check size={14} className="text-green-500" />}
                                    {!isCheckingName && repoAvailable === false && <X size={14} className="text-red-500" />}
                                </div>
                            </div>
                            <Button
                                className="h-9 text-sm font-medium bg-green-600 hover:bg-green-700 text-white px-5 cursor-pointer"
                                onClick={handleCreate}
                                disabled={isWorking || !repoName.trim() || repoAvailable === false || isCheckingName}
                            >
                                {isWorking ? (
                                    <Loader2 size={14} className="animate-spin mr-1.5" />
                                ) : (
                                    <Lock size={12} className="mr-1.5" />
                                )}
                                Crear
                            </Button>
                        </div>
                        {repoAvailable === false && (
                            <p className="text-xs text-red-500">Ese nombre ya está en uso</p>
                        )}
                    </div>
                )}

                {/* ── Existing mode ── */}
                {mode === "existing" && (
                    <div className="space-y-3 pt-2">
                        <div className="flex items-center gap-2 mb-1">
                            <button
                                onClick={() => setMode("choose")}
                                className="p-1 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground cursor-pointer"
                            >
                                <X size={14} />
                            </button>
                            <GitBranch size={14} className="text-primary" />
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                Vincular repositorio
                            </span>
                        </div>

                        {/* Search */}
                        <div className="relative">
                            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                value={repoSearch}
                                onChange={(e) => setRepoSearch(e.target.value)}
                                placeholder="Buscar repositorio..."
                                className="h-8 text-sm pl-8"
                                disabled={isWorking}
                                autoFocus
                            />
                        </div>

                        {/* Repo list */}
                        <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-background/50">
                            {isLoadingRepos ? (
                                <div className="flex items-center justify-center py-6">
                                    <Loader2 size={16} className="animate-spin text-muted-foreground" />
                                </div>
                            ) : filteredRepos.length === 0 ? (
                                <p className="text-xs text-muted-foreground text-center py-6">
                                    {repoSearch ? "Sin resultados" : "No hay repositorios"}
                                </p>
                            ) : (
                                filteredRepos.map((repo) => (
                                    <button
                                        key={repo.full_name}
                                        className={cn(
                                            "flex items-center gap-2.5 w-full px-3 py-2 text-sm text-left transition-colors cursor-pointer",
                                            selectedRepo === repo.full_name
                                                ? "bg-primary/10 text-primary font-medium"
                                                : "hover:bg-muted text-foreground",
                                        )}
                                        onClick={() => setSelectedRepo(repo.full_name)}
                                        disabled={isWorking}
                                    >
                                        {repo.private ? (
                                            <Lock size={12} className="text-muted-foreground shrink-0" />
                                        ) : (
                                            <Globe size={12} className="text-muted-foreground shrink-0" />
                                        )}
                                        <span className="truncate">{repo.full_name}</span>
                                        {selectedRepo === repo.full_name && (
                                            <Check size={14} className="ml-auto text-primary shrink-0" />
                                        )}
                                    </button>
                                ))
                            )}
                        </div>

                        {/* Connect button */}
                        <Button
                            className="w-full h-9 text-sm font-medium cursor-pointer"
                            onClick={handleConnect}
                            disabled={!selectedRepo || isWorking}
                        >
                            {isWorking ? (
                                <Loader2 size={14} className="animate-spin mr-1.5" />
                            ) : (
                                <GitBranch size={14} className="mr-1.5" />
                            )}
                            Vincular {selectedRepo ? selectedRepo.split("/")[1] : ""}
                        </Button>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
