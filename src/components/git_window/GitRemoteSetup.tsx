/**
 * GitRemoteSetup — compact inline UI for linking a GitHub remote
 * when the app has a GitHub token but no repo linked yet.
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface GitRemoteSetupProps {
    appId: number;
    appName: string;
    onLinked: () => void;
}

interface Repo {
    name: string;
    full_name: string;
    private: boolean;
}

export function GitRemoteSetup({ appId, appName, onLinked }: GitRemoteSetupProps) {
    const [mode, setMode] = useState<"idle" | "create" | "existing">("idle");
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

    // Create new private repo
    const handleCreate = async () => {
        if (!repoName.trim() || repoAvailable === false) return;
        setIsWorking(true);
        try {
            await ipc.github.createRepo({ org: "", repo: repoName, appId, branch: "main" });
            toast.success(`Repositorio ${repoName} creado y vinculado`);
            onLinked();
        } catch (err: any) {
            toast.error(err.message || "Error al crear el repositorio");
        } finally {
            setIsWorking(false);
        }
    };

    // Connect existing repo
    const handleConnect = async () => {
        if (!selectedRepo) return;
        setIsWorking(true);
        try {
            const [owner, repo] = selectedRepo.split("/");
            await ipc.github.connectExistingRepo({ owner, repo, branch: "main", appId });
            toast.success(`Vinculado a ${selectedRepo}`);
            onLinked();
        } catch (err: any) {
            toast.error(err.message || "Error al vincular el repositorio");
        } finally {
            setIsWorking(false);
        }
    };

    const filteredRepos = repos.filter((r) =>
        r.full_name.toLowerCase().includes(repoSearch.toLowerCase()),
    );

    // Idle — show the two options
    if (mode === "idle") {
        return (
            <div className="border-t border-border p-3 space-y-2 bg-muted/30">
                <div className="flex items-center gap-2 mb-2">
                    <Github size={14} className="text-muted-foreground" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Sin remote configurado
                    </span>
                </div>
                <div className="flex gap-1.5">
                    <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 h-8 text-xs font-medium border-green-500/30 bg-green-500/5 hover:bg-green-500/10 text-green-700 dark:text-green-300"
                        onClick={() => setMode("create")}
                    >
                        <Plus size={13} className="mr-1.5" />
                        Crear repo privado
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 h-8 text-xs font-medium"
                        onClick={() => setMode("existing")}
                    >
                        <Search size={13} className="mr-1.5" />
                        Vincular existente
                    </Button>
                </div>
            </div>
        );
    }

    // Create mode
    if (mode === "create") {
        return (
            <div className="border-t border-border p-3 space-y-2 bg-muted/30">
                <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                        <Plus size={14} className="text-green-500" />
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Nuevo repositorio privado
                        </span>
                    </div>
                    <button
                        onClick={() => setMode("idle")}
                        className="p-0.5 rounded hover:bg-muted transition-colors"
                    >
                        <X size={14} className="text-muted-foreground" />
                    </button>
                </div>
                <div className="flex gap-1.5">
                    <div className="relative flex-1">
                        <Input
                            value={repoName}
                            onChange={(e) => {
                                setRepoName(e.target.value);
                                setRepoAvailable(null);
                            }}
                            placeholder="nombre-del-repo"
                            className={cn(
                                "h-8 text-xs pr-7",
                                repoAvailable === true && "border-green-500/50 focus-visible:ring-green-500/30",
                                repoAvailable === false && "border-red-500/50 focus-visible:ring-red-500/30",
                            )}
                            disabled={isWorking}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && repoAvailable) handleCreate();
                            }}
                        />
                        <div className="absolute right-2 top-1/2 -translate-y-1/2">
                            {isCheckingName && <Loader2 size={12} className="animate-spin text-muted-foreground" />}
                            {!isCheckingName && repoAvailable === true && <Check size={12} className="text-green-500" />}
                            {!isCheckingName && repoAvailable === false && <X size={12} className="text-red-500" />}
                        </div>
                    </div>
                    <Button
                        size="sm"
                        className="h-8 text-xs font-medium bg-green-600 hover:bg-green-700 text-white px-4"
                        onClick={handleCreate}
                        disabled={isWorking || !repoName.trim() || repoAvailable === false || isCheckingName}
                    >
                        {isWorking ? (
                            <Loader2 size={13} className="animate-spin mr-1" />
                        ) : (
                            <Lock size={11} className="mr-1" />
                        )}
                        Crear
                    </Button>
                </div>
                {repoAvailable === false && (
                    <p className="text-[10px] text-red-500">Ese nombre ya está en uso</p>
                )}
            </div>
        );
    }

    // Existing mode
    return (
        <div className="border-t border-border p-3 space-y-2 bg-muted/30">
            <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                    <GitBranch size={14} className="text-primary" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Vincular repositorio
                    </span>
                </div>
                <button
                    onClick={() => setMode("idle")}
                    className="p-0.5 rounded hover:bg-muted transition-colors"
                >
                    <X size={14} className="text-muted-foreground" />
                </button>
            </div>

            {/* Search */}
            <div className="relative">
                <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                    value={repoSearch}
                    onChange={(e) => setRepoSearch(e.target.value)}
                    placeholder="Buscar repositorio..."
                    className="h-7 text-xs pl-7"
                    disabled={isWorking}
                />
            </div>

            {/* Repo list */}
            <div className="max-h-36 overflow-y-auto rounded-md border border-border bg-background">
                {isLoadingRepos ? (
                    <div className="flex items-center justify-center py-4">
                        <Loader2 size={14} className="animate-spin text-muted-foreground" />
                    </div>
                ) : filteredRepos.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">
                        {repoSearch ? "Sin resultados" : "No hay repositorios"}
                    </p>
                ) : (
                    filteredRepos.map((repo) => (
                        <button
                            key={repo.full_name}
                            className={cn(
                                "flex items-center gap-2 w-full px-2.5 py-1.5 text-xs text-left transition-colors",
                                selectedRepo === repo.full_name
                                    ? "bg-primary/10 text-primary font-medium"
                                    : "hover:bg-muted text-foreground",
                            )}
                            onClick={() => setSelectedRepo(repo.full_name)}
                            disabled={isWorking}
                        >
                            {repo.private && <Lock size={10} className="text-muted-foreground shrink-0" />}
                            {!repo.private && <Github size={10} className="text-muted-foreground shrink-0" />}
                            <span className="truncate">{repo.full_name}</span>
                            {selectedRepo === repo.full_name && (
                                <Check size={12} className="ml-auto text-primary shrink-0" />
                            )}
                        </button>
                    ))
                )}
            </div>

            {/* Connect button */}
            <Button
                size="sm"
                className="w-full h-8 text-xs font-medium"
                onClick={handleConnect}
                disabled={!selectedRepo || isWorking}
            >
                {isWorking ? (
                    <Loader2 size={13} className="animate-spin mr-1.5" />
                ) : (
                    <GitBranch size={13} className="mr-1.5" />
                )}
                Vincular {selectedRepo ? selectedRepo.split("/")[1] : ""}
            </Button>
        </div>
    );
}
