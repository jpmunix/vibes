import { useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import { normalizePath } from "../../shared/normalizePath";
import { useAtom, useSetAtom } from "jotai";
import { appsListAtom, selectedAppIdAtom } from "@/atoms/appAtoms";
import { ipc } from "@/ipc/types";
import { useLoadApps } from "@/hooks/useLoadApps";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Loader2,
  MessageCircle,
  Pencil,
  Folder,
  FolderOpen,
  FolderInput,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Github,
  Smartphone,
  Flame,
  Database,
  DatabaseZap,
  Copy,
  FolderX,
  Star,
  Settings,
  Info,
  Calendar,
  Clock,
  MapPin,
  MessageSquareText,
  ClipboardCopy,
  Check,
  BunnyIcon,
  PocketBaseIcon,
  SupabaseIcon,
  Download,
  FileText,
} from "@/components/ui/icons";

import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GitHubConnector } from "@/components/GitHubConnector";
import { SupabaseConnector } from "@/components/SupabaseConnector";
import { PocketBaseConnector } from "@/components/PocketBaseConnector";
// Firebase hidden - not mature yet
// import { FirebaseConnector } from "@/components/FirebaseConnector";
import { showError, showSuccess } from "@/lib/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { invalidateAppQuery } from "@/hooks/useLoadApp";
import { useDebounce } from "@/hooks/useDebounce";
import { useCheckName } from "@/hooks/useCheckName";
import { AppUpgrades } from "@/components/AppUpgrades";
import { CapacitorControls } from "@/components/CapacitorControls";
import { useSettings } from "@/hooks/useSettings";
import { isSupabaseConnected } from "@/lib/schemas";
import { GithubCollaboratorManager } from "@/components/GithubCollaboratorManager";
import { KnowledgeBaseModal } from "@/components/KnowledgeBaseModal";
import { Brain } from "@/components/ui/icons";
import { useAddAppToFavorite } from "@/hooks/useAddAppToFavorite";
import { CollapsibleCard } from "@/components/CollapsibleCard";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useTheme } from "@/contexts/ThemeContext";
import { BunnyConnector } from "@/components/BunnyConnector";

export default function AppDetailsPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const search = useSearch({ from: "/app-details" as const });
  const [appsList] = useAtom(appsListAtom);
  const { refreshApps } = useLoadApps();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteFiles, setDeleteFiles] = useState(false);
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [newAppName, setNewAppName] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const [isRenameFolderDialogOpen, setIsRenameFolderDialogOpen] =
    useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [isRenamingFolder, setIsRenamingFolder] = useState(false);
  const [isGeneratingTitle, setIsGeneratingTitle] = useState(false);
  const [isIntegrationsSectionOpen, setIsIntegrationsSectionOpen] = useState(false);
  const [isInfoSectionOpen, setIsInfoSectionOpen] = useState(false);
  const { toggleFavorite, isLoading: isFavoriteLoading } = useAddAppToFavorite();

  const [isCopyDialogOpen, setIsCopyDialogOpen] = useState(false);
  const [newCopyAppName, setNewCopyAppName] = useState("");
  const [isChangeLocationDialogOpen, setIsChangeLocationDialogOpen] =
    useState(false);
  const [isKnowledgeBaseModalOpen, setIsKnowledgeBaseModalOpen] = useState(false);

  const [initialPrompt, setInitialPrompt] = useState<{ content: string | null; createdAt: Date | string | null } | null>(null);
  const [isLoadingInitialPrompt, setIsLoadingInitialPrompt] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  const queryClient = useQueryClient();
  const setSelectedAppId = useSetAtom(selectedAppIdAtom);
  const { theme, intensity } = useTheme();
  const { settings } = useSettings();

  const debouncedNewCopyAppName = useDebounce(newCopyAppName, 150);
  const { data: checkNameResult, isLoading: isCheckingName } = useCheckName(
    debouncedNewCopyAppName,
  );
  const nameExists = checkNameResult?.exists ?? false;

  // Get the appId from search params and find the corresponding app
  const appId = search.appId ? Number(search.appId) : null;
  const selectedApp = appId ? appsList.find((app) => app.id === appId) : null;

  // Fetch initial prompt when the info section opens
  useEffect(() => {
    if (isInfoSectionOpen && appId && !initialPrompt && !isLoadingInitialPrompt) {
      setIsLoadingInitialPrompt(true);
      ipc.chat.getInitialPrompt(appId)
        .then((result) => {
          setInitialPrompt(result);
        })
        .catch((err) => {
          console.error("Error fetching initial prompt:", err);
        })
        .finally(() => {
          setIsLoadingInitialPrompt(false);
        });
    }
  }, [isInfoSectionOpen, appId, initialPrompt, isLoadingInitialPrompt]);

  const handleDeleteApp = async () => {
    if (!appId) return;

    try {
      setIsDeleting(true);
      await ipc.app.deleteApp({ appId, deleteFiles });
      setIsDeleteDialogOpen(false);
      setDeleteFiles(false);
      await refreshApps();
      navigate({ to: "/", search: {} });
    } catch (error) {
      setIsDeleteDialogOpen(false);
      showError(error);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleOpenRenameDialog = () => {
    if (selectedApp) {
      setNewAppName(selectedApp.name);
      setIsRenameDialogOpen(true);
    }
  };

  const handleOpenRenameFolderDialog = () => {
    if (selectedApp) {
      setNewFolderName(
        normalizePath(selectedApp.path).split("/").pop() || selectedApp.path,
      );
      setIsRenameFolderDialogOpen(true);
    }
  };

  const handleGenerateTitle = async () => {
    if (!appId || !selectedApp) return;
    try {
      setIsGeneratingTitle(true);
      const { title } = await ipc.app.generateAppTitleFromHistory({ appId });

      setIsRenaming(true);
      await ipc.app.updateAppName({
        appId,
        appName: title,
      });

      setNewAppName(title);
      await refreshApps();
    } catch (error) {
      console.error("Failed to generate title:", error);
      showError("Error al generar el título");
    } finally {
      setIsGeneratingTitle(false);
      setIsRenaming(false);
    }
  };

  const handleRenameApp = async () => {
    if (!appId || !selectedApp || !newAppName.trim()) return;

    try {
      setIsRenaming(true);

      await ipc.app.updateAppName({
        appId,
        appName: newAppName,
      });

      setIsRenameDialogOpen(false);
      await refreshApps();
    } catch (error) {
      console.error("Failed to rename app:", error);
      const errorMessage = (
        error instanceof Error ? error.message : String(error)
      ).replace(/^Error invoking remote method 'rename-app': Error: /, "");
      showError(errorMessage);
    } finally {
      setIsRenaming(false);
    }
  };

  const handleRenameFolderOnly = async () => {
    if (!appId || !selectedApp || !newFolderName.trim()) return;

    try {
      setIsRenamingFolder(true);
      await ipc.app.renameApp({
        appId,
        appName: selectedApp.name, // Keep the app name the same
        appPath: newFolderName, // Change only the folder path
      });

      setIsRenameFolderDialogOpen(false);
      await refreshApps();
    } catch (error) {
      console.error("Failed to rename folder:", error);
      const errorMessage = (
        error instanceof Error ? error.message : String(error)
      ).replace(/^Error invoking remote method 'rename-app': Error: /, "");
      showError(errorMessage);
    } finally {
      setIsRenamingFolder(false);
    }
  };

  const handleAppNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewCopyAppName(e.target.value);
  };

  const handleOpenCopyDialog = () => {
    if (selectedApp) {
      setNewCopyAppName(`${selectedApp.name}-copy`);
      setIsCopyDialogOpen(true);
    }
  };

  const handleChangeLocation = async () => {
    if (!selectedApp || !appId) return;

    try {
      // Get the current parent directory as default
      const currentPath = selectedApp.resolvedPath || "";
      const currentParentDir = currentPath
        ? currentPath.replace(/[/\\][^/\\]*$/, "") // Remove last path component
        : undefined;

      const response = await ipc.app.selectAppLocation({
        defaultPath: currentParentDir,
      });
      if (!response.canceled && response.path) {
        await changeLocationMutation.mutateAsync({
          appId,
          parentDirectory: response.path,
        });
        setIsChangeLocationDialogOpen(false);
      } else {
        // User canceled the file dialog, close the change location dialog
        setIsChangeLocationDialogOpen(false);
      }
    } catch {
      // Error is already shown by the mutation's onError
      setIsChangeLocationDialogOpen(false);
    }
  };

  const copyAppMutation = useMutation({
    mutationFn: async ({ withHistory }: { withHistory: boolean }) => {
      if (!appId || !newCopyAppName.trim()) {
        throw new Error("Invalid app ID or name for copying.");
      }
      return ipc.app.copyApp({
        appId,
        newAppName: newCopyAppName,
        withHistory,
      });
    },
    onSuccess: async (data) => {
      const appId = data.app.id;
      setSelectedAppId(appId);
      await invalidateAppQuery(queryClient, { appId });
      await refreshApps();
      await ipc.chat.createChat(appId);
      setIsCopyDialogOpen(false);
      navigate({ to: "/app-details", search: { appId } });
    },
    onError: (error) => {
      showError(error);
    },
  });

  const changeLocationMutation = useMutation({
    mutationFn: async (params: { appId: number; parentDirectory: string }) => {
      return ipc.app.changeAppLocation(params);
    },
    onSuccess: async () => {
      await invalidateAppQuery(queryClient, { appId });
      await refreshApps();
      showSuccess("Ubicación de la aplicación actualizada");
    },
    onError: (error) => {
      showError(error);
    },
  });

  if (!selectedApp) {
    return (
      <div className="relative h-full w-full p-8 flex flex-col">
        <Button
          onClick={() => router.history.back()}
          variant="outline"
          size="sm"
          className="absolute top-4 left-4 flex items-center gap-1 bg-(--background-lightest) py-5"
        >
          <ArrowLeft className="h-3 w-4" />
          Atrás
        </Button>
        <div className="flex flex-col items-center justify-center flex-1">
          <h2 className="typo-section-title">Aplicación no encontrada</h2>
        </div>
      </div>
    );
  }

  const currentAppPath = selectedApp.resolvedPath || "";

  // Check if docs/DESIGN.md exists for download option
  const { data: designData } = useQuery({
    queryKey: ["design-read", currentAppPath],
    queryFn: () => ipc.design.readDesign({ appPath: selectedApp.path }),
    enabled: !!currentAppPath && isInfoSectionOpen,
    staleTime: 30_000,
  });
  const hasDesignMd = !!designData?.content;

  const handleDownloadDesign = () => {
    if (!designData?.content) return;
    const blob = new Blob([designData.content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "DESIGN.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="relative h-full w-full overflow-hidden flex"
      data-testid="app-details-page"
    >
      {/* Glow background effect */}
      <div
        aria-hidden
        className="glow-static pointer-events-none absolute rounded-full"
        style={{
          width: '1400px',
          height: '1400px',
          top: '50%',
          left: '50%',
        }}
      />

      <style>{`
        .glow-static {
          background: radial-gradient(
            circle,
            var(--primary) 0%,
            color-mix(in oklch, var(--primary) 55%, transparent) 20%,
            color-mix(in oklch, var(--primary) 30%, transparent) 40%,
            color-mix(in oklch, var(--primary) 12%, transparent) 60%,
            color-mix(in oklch, var(--primary) 4%, transparent) 80%,
            transparent 100%
          );
          filter: blur(90px);
          transform: translate(-50%, -50%) scale(1.1);
          opacity: 0.5;
          z-index: 0;
        }
      `}</style>

      <div className="absolute inset-0 overflow-y-auto overflow-x-hidden z-10">
        <div className="min-h-full flex flex-col w-full max-w-2xl mx-auto p-4 py-8 relative">
          <div className="my-auto w-full flex flex-col">
            {/* Hero */}
            <div className="flex items-center justify-center gap-3 mb-8 mt-2">
              <h1 className="typo-page-title text-center tracking-tight">{selectedApp.name}</h1>
              <Button
                variant="ghost"
                size="sm"
                className="p-1 h-auto transition-transform hover:scale-110 shrink-0"
                onClick={() => toggleFavorite(selectedApp.id)}
                disabled={isFavoriteLoading}
                title={selectedApp.isFavorite ? "Quitar de favoritos" : "Añadir a favoritos"}
              >
                <Star
                  className={`h-6 w-6 transition-all duration-200 ${selectedApp.isFavorite
                    ? "fill-yellow-400 text-yellow-400 drop-shadow-[0_0_6px_rgba(250,204,21,0.5)]"
                    : "text-muted-foreground/70/60 hover:text-yellow-400"
                    }`}
                />
              </Button>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-2">
              {(!selectedApp.primaryLanguage || ['javascript', 'typescript', 'unknown'].includes(selectedApp.primaryLanguage?.toLowerCase?.())) && (
              <Button
                variant="outline"
                onClick={() => {
                  if (!appId) {
                    console.error("No app id found");
                    return;
                  }
                  ipc.system.openChatWindow({ appId, theme, themeIntensity: intensity });
                }}
                className="cursor-pointer w-full py-7 flex justify-center items-center gap-2 text-base font-semibold shadow-sm bg-card dark:bg-black/40 backdrop-blur-xl dark:border-white/10 hover:bg-muted/80 dark:hover:bg-black/60 transition-colors"
                size="lg"
              >
                <MessageCircle className="h-5 w-5" />
                <span className="mb-0.5">Abrir en Chat</span>
              </Button>
              )}

              {/* Collapsible Información y opciones section */}
              <div className="border border-border dark:border-white/10 rounded-xl bg-card dark:bg-black/40 backdrop-blur-xl shadow-sm overflow-hidden">
                <button
                  type="button"
                  onClick={() => setIsInfoSectionOpen(!isInfoSectionOpen)}
                  className="w-full px-4 py-4 flex items-center justify-between hover:bg-muted/50 dark:hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    {isInfoSectionOpen ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                    <div className="flex flex-col items-start">
                      <span className="typo-label">Información y opciones</span>
                      <span className="typo-caption">Nombre, carpeta y datos de la aplicación</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Settings className="h-3.5 w-3.5 text-muted-foreground/70" />
                    <Info className="h-3.5 w-3.5 text-muted-foreground/70" />
                  </div>
                </button>
                <div
                  className={`overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out ${isInfoSectionOpen ? "max-h-[3000px] opacity-100" : "max-h-0 opacity-0"
                    }`}
                >
                  <div className="p-4 space-y-3 border-t border-border dark:border-white/10 bg-muted/20 dark:bg-black/20">
                    {/* Opciones Card */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 typo-label">
                          <Settings className="h-5 w-5" />
                          Opciones
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start gap-2 h-9"
                          onClick={handleOpenRenameDialog}
                          data-testid="app-details-rename-app-button"
                        >
                          <Pencil className="h-4 w-4" />
                          Renombrar proyecto
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start gap-2 h-9"
                          onClick={() => ipc.system.showItemInFolder(currentAppPath)}
                        >
                          <Folder className="h-4 w-4" />
                          Abrir carpeta de destino
                        </Button>
                        {hasDesignMd && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start gap-2 h-9"
                            onClick={handleDownloadDesign}
                          >
                            <Download className="h-4 w-4" />
                            Descargar DESIGN.md
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start gap-2 h-9 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setIsDeleteDialogOpen(true)}
                        >
                          <FolderX className="h-4 w-4" />
                          Cerrar carpeta
                        </Button>
                      </CardContent>
                    </Card>

                    {/* Información Card */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 typo-label">
                          <Info className="h-5 w-5" />
                          Información
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex items-start gap-3">
                          <MapPin className="h-4 w-4 text-muted-foreground/70 mt-0.5 shrink-0" />
                          <div>
                            <span className="block typo-micro uppercase tracking-widest mb-0.5">Ruta</span>
                            <span className="typo-mono-xs break-all !text-[13px]">{currentAppPath}</span>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <Calendar className="h-4 w-4 text-muted-foreground/70 mt-0.5 shrink-0" />
                          <div>
                            <span className="block typo-micro uppercase tracking-widest mb-0.5">Fecha de creación</span>
                            <span className="typo-mono !text-[13px]">{new Date(selectedApp.createdAt).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <Clock className="h-4 w-4 text-muted-foreground/70 mt-0.5 shrink-0" />
                          <div>
                            <span className="block typo-micro uppercase tracking-widest mb-0.5">Última actualización</span>
                            <span className="typo-mono !text-[13px]">{new Date(selectedApp.updatedAt).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Prompt Inicial Card */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="flex items-center gap-2 typo-label">
                          <MessageSquareText className="h-5 w-5" />
                          Prompt inicial
                        </CardTitle>
                        <CardDescription className="typo-caption">El mensaje que dio origen a esta aplicación</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {isLoadingInitialPrompt ? (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Cargando...
                          </div>
                        ) : initialPrompt?.content ? (
                          <div className="space-y-2">
                            <div className="relative group">
                              <div className="typo-body whitespace-pre-wrap break-words bg-black/5 dark:bg-white/5 rounded-lg p-3 border border-black/5 dark:border-white/5 max-h-48 overflow-y-auto">
                                {initialPrompt.content}
                              </div>
                              <button
                                type="button"
                                className="absolute top-2 right-2 p-1.5 rounded-md bg-black/10 dark:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/20 dark:hover:bg-white/20 cursor-pointer"
                                onClick={() => {
                                  navigator.clipboard.writeText(initialPrompt.content!);
                                  setCopiedPrompt(true);
                                  setTimeout(() => setCopiedPrompt(false), 2000);
                                }}
                                title="Copiar prompt"
                              >
                                {copiedPrompt ? (
                                  <Check className="h-3.5 w-3.5 text-green-500" />
                                ) : (
                                  <ClipboardCopy className="h-3.5 w-3.5 text-muted-foreground" />
                                )}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground italic">
                            No se encontró el prompt inicial de esta aplicación.
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </div>

              {/* Collapsible Repositorio e integraciones section */}
              <div className="border border-border dark:border-white/10 rounded-xl bg-card dark:bg-black/40 backdrop-blur-xl shadow-sm overflow-hidden mt-2">
                <button
                  type="button"
                  onClick={() => setIsIntegrationsSectionOpen(!isIntegrationsSectionOpen)}
                  className="w-full px-4 py-4 flex items-center justify-between hover:bg-muted/50 dark:hover:bg-white/5 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    {isIntegrationsSectionOpen ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                    <div className="flex flex-col items-start">
                      <span className="typo-label">Repositorio e integraciones</span>
                      <span className="typo-caption text-muted-foreground">GitHub, Bunny.net, PocketBase y Supabase</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Github className={`h-3.5 w-3.5 transition-colors duration-200 ${selectedApp.githubOrg && selectedApp.githubRepo ? 'text-primary' : 'text-foreground opacity-40'}`} />
                    <BunnyIcon className={`h-3.5 w-3.5 transition-colors duration-200 ${selectedApp.bunnyConfig ? 'text-primary' : 'text-foreground opacity-40'}`} />
                    <PocketBaseIcon className={`h-3.5 w-3.5 transition-colors duration-200 ${selectedApp.pocketbaseConfig ? 'text-primary' : 'text-foreground opacity-40'}`} />
                    <SupabaseIcon className={`h-3.5 w-3.5 transition-colors duration-200 ${selectedApp.supabaseProjectId ? 'text-primary' : 'text-foreground opacity-40'}`} />
                    {/* Firebase hidden - not mature yet */}
                    {/* <Flame className="h-3.5 w-3.5 text-muted-foreground/70" /> */}
                    {/* <Smartphone className="h-3.5 w-3.5 text-muted-foreground/70" /> */}
                  </div>
                </button>
                <div
                  className={`overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out ${isIntegrationsSectionOpen ? "max-h-[3000px] opacity-100" : "max-h-0 opacity-0"
                    }`}
                >
                  <div className="p-4 space-y-3 border-t border-border dark:border-white/10 bg-muted/20 dark:bg-black/20">
                    {/* GitHub */}
                    <CollapsibleCard
                      title="GitHub"
                      icon={<Github className="h-5 w-5" />}
                      description="Conecta y gestiona tu repositorio de GitHub"
                    >
                      <GitHubConnector appId={appId} folderName={selectedApp.path} />
                      {selectedApp.githubOrg && selectedApp.githubRepo && appId && (
                        <div className="pt-4 border-t border-gray-100 dark:border-gray-800 mt-4">
                          <GithubCollaboratorManager appId={appId} />
                        </div>
                      )}
                    </CollapsibleCard>

                    {/* Bunny.net */}
                    {appId && <BunnyConnector appId={appId} />}

                    {/* Supabase */}
                    {appId && <SupabaseConnector appId={appId} />}

                    {/* PocketBase */}
                    {appId && <PocketBaseConnector appId={appId} />}

                    {/* Firebase hidden - not mature yet */}
                    {/* {appId && <FirebaseConnector appId={appId} />} */}

                    {/* Capacitor hidden */}
                    {/* {appId && <CapacitorControls appId={appId} />} */}

                    {/* App Upgrades (includes Capacitor install prompt) */}
                    <AppUpgrades appId={appId} />
                  </div>
                </div>
              </div>


              {/* Knowledge Base — hidden: retired in agent mode, OpenCode uses AGENTS.md natively */}
            </div>

            {/* Rename Dialog */}
            <Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
              <DialogContent className="max-w-sm p-4">
                <DialogHeader className="pb-2">
                  <DialogTitle>Renombrar aplicación</DialogTitle>
                </DialogHeader>
                <Input
                  value={newAppName}
                  onChange={(e) => setNewAppName(e.target.value)}
                  placeholder="Introduce el nuevo nombre de la aplicación"
                  className="my-2"
                  autoFocus
                />
                <DialogFooter className="pt-2">
                  <Button
                    variant="outline"
                    onClick={() => setIsRenameDialogOpen(false)}
                    disabled={isRenaming}
                    size="sm"
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleRenameApp}
                    disabled={isRenaming || !newAppName.trim()}
                    size="sm"
                  >
                    Renombrar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Rename Folder Dialog */}
            <Dialog
              open={isRenameFolderDialogOpen}
              onOpenChange={setIsRenameFolderDialogOpen}
            >
              <DialogContent className="max-w-sm p-4">
                <DialogHeader className="pb-2">
                  <DialogTitle>Renombrar carpeta de la aplicación</DialogTitle>
                  <DialogDescription>
                    Esto cambiará solo el nombre de la carpeta, no el nombre de la
                    aplicación.
                  </DialogDescription>
                </DialogHeader>
                <Input
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Introduce el nuevo nombre de la carpeta"
                  className="my-2"
                  autoFocus
                />
                <DialogFooter className="pt-2">
                  <Button
                    variant="outline"
                    onClick={() => setIsRenameFolderDialogOpen(false)}
                    disabled={isRenamingFolder}
                    size="sm"
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleRenameFolderOnly}
                    disabled={isRenamingFolder || !newFolderName.trim()}
                    size="sm"
                  >
                    {isRenamingFolder ? (
                      <>
                        <Loader2 className="animate-spin h-3 w-3 mr-1" />
                        Renombrando...
                      </>
                    ) : (
                      "Renombrar carpeta"
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>



            {/* Copy App Dialog */}
            {selectedApp && (
              <Dialog open={isCopyDialogOpen} onOpenChange={setIsCopyDialogOpen}>
                <DialogContent className="max-w-md p-4">
                  <DialogHeader className="pb-2">
                    <DialogTitle>Clonar "{selectedApp.name}"</DialogTitle>
                    <DialogDescription>
                      <p>Crea una copia independiente de esta aplicación con un nuevo nombre.</p>
                      <p>
                        Las integraciones (Supabase, GitHub) no se clonan.
                      </p>
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3 my-2">
                    <div>
                      <Label htmlFor="newAppName">
                        Nuevo nombre de la aplicación
                      </Label>
                      <div className="relative mt-1">
                        <Input
                          id="newAppName"
                          value={newCopyAppName}
                          onChange={handleAppNameChange}
                          placeholder="Introduce el nuevo nombre de la aplicación"
                          className="pr-8"
                          disabled={copyAppMutation.isPending}
                        />
                        {isCheckingName && (
                          <div className="absolute right-2 top-1/2 -translate-y-1/2">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          </div>
                        )}
                      </div>

                      {nameExists && (
                        <p className="typo-caption text-yellow-600 dark:text-yellow-500 mt-1">
                          Ya existe una aplicación con este nombre. Por favor, elige
                          otro nombre.
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Button
                        variant="outline"
                        className="w-full justify-start p-2 h-auto relative text-sm"
                        onClick={() =>
                          copyAppMutation.mutate({ withHistory: true })
                        }
                        disabled={
                          copyAppMutation.isPending ||
                          nameExists ||
                          !newCopyAppName.trim() ||
                          isCheckingName
                        }
                      >
                        {copyAppMutation.isPending &&
                          copyAppMutation.variables?.withHistory === true && (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          )}
                        <div className="absolute top-1 right-1">
                          <span className="bg-blue-100 text-blue-800 typo-caption font-medium px-1.5 py-0.5 rounded dark:bg-blue-900 dark:text-blue-300">
                            Recomendado
                          </span>
                        </div>
                        <div className="text-left">
                          <p className="typo-label">
                            Clonar con historial
                          </p>
                          <p className="typo-caption text-muted-foreground">
                            Clona toda la aplicación incluyendo el historial de
                            versiones.
                          </p>
                        </div>
                      </Button>

                      <Button
                        variant="outline"
                        className="w-full justify-start p-2 h-auto text-sm"
                        onClick={() =>
                          copyAppMutation.mutate({ withHistory: false })
                        }
                        disabled={
                          copyAppMutation.isPending ||
                          nameExists ||
                          !newCopyAppName.trim() ||
                          isCheckingName
                        }
                      >
                        {copyAppMutation.isPending &&
                          copyAppMutation.variables?.withHistory === false && (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          )}
                        <div className="text-left">
                          <p className="typo-label">
                            Clonar sin historial
                          </p>
                          <p className="typo-caption text-muted-foreground">
                            Solo clona el estado actual del código, sin versiones
                            anteriores. Útil si hay problemas con Git.
                          </p>
                        </div>
                      </Button>
                    </div>
                  </div>
                  <DialogFooter className="pt-2">
                    <Button
                      variant="outline"
                      onClick={() => setIsCopyDialogOpen(false)}
                      disabled={copyAppMutation.isPending}
                      size="sm"
                    >
                      Cancelar
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}

            {/* Change Location Dialog */}
            <Dialog
              open={isChangeLocationDialogOpen}
              onOpenChange={setIsChangeLocationDialogOpen}
            >
              <DialogContent className="max-w-sm p-4">
                <DialogHeader className="pb-2">
                  <DialogTitle>Cambiar ubicación de la aplicación</DialogTitle>
                  <DialogDescription>
                    Selecciona una carpeta donde se guardará esta aplicación. El
                    nombre de la carpeta de la aplicación seguirá siendo el mismo.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter className="pt-2">
                  <Button
                    variant="outline"
                    onClick={() => setIsChangeLocationDialogOpen(false)}
                    disabled={changeLocationMutation.isPending}
                    size="sm"
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleChangeLocation}
                    disabled={changeLocationMutation.isPending}
                    size="sm"
                  >
                    {changeLocationMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Moviendo...
                      </>
                    ) : (
                      "Seleccionar carpeta"
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Close Folder Confirmation Dialog */}
            <Dialog open={isDeleteDialogOpen} onOpenChange={(open) => {
              setIsDeleteDialogOpen(open);
              if (!open) setDeleteFiles(false);
            }}>
              <DialogContent className="max-w-sm p-4">
                <DialogHeader className="pb-2">
                  <DialogTitle>¿Cerrar "{selectedApp.name}"?</DialogTitle>
                  <DialogDescription>
                    La aplicación se desvinculará de Vibes. Los archivos en disco NO serán eliminados.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex items-center space-x-2 py-2">
                  <input
                    type="checkbox"
                    id="delete-files-detail-check"
                    checked={deleteFiles}
                    onChange={(e) => setDeleteFiles(e.target.checked)}
                    disabled={isDeleting}
                    className="rounded border-border"
                  />
                  <label htmlFor="delete-files-detail-check" className="text-xs text-muted-foreground cursor-pointer">
                    También eliminar archivos del disco
                  </label>
                </div>
                <DialogFooter className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => setIsDeleteDialogOpen(false)}
                    disabled={isDeleting}
                    size="sm"
                  >
                    Cancelar
                  </Button>
                  <Button
                    variant={deleteFiles ? "destructive" : "default"}
                    onClick={handleDeleteApp}
                    disabled={isDeleting}
                    className="flex items-center gap-1"
                    size="sm"
                  >
                    {isDeleting ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Cerrando...
                      </>
                    ) : deleteFiles ? (
                      "Cerrar y eliminar archivos"
                    ) : (
                      "Cerrar carpeta"
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
    </div>
  );
}
