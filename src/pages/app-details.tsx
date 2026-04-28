import { useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
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
  Plus,
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
import { LanguageBadge } from "@/components/LanguageBadge";

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
  const [isAddIntegrationOpen, setIsAddIntegrationOpen] = useState(false);
  const [addingIntegration, setAddingIntegration] = useState<'github' | 'bunny' | 'supabase' | 'pocketbase' | null>(null);
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
    if (appId && !initialPrompt && !isLoadingInitialPrompt) {
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
  }, [appId, initialPrompt, isLoadingInitialPrompt]);

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
    enabled: !!currentAppPath,
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
      {/* Background matching settings page + subtle accent glow at top */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-muted/30"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-64"
        style={{ background: 'radial-gradient(ellipse 60% 100% at 50% -20%, color-mix(in oklch, var(--primary) 8%, transparent), transparent)' }}
      />

      <div className="absolute inset-0 overflow-y-auto overflow-x-hidden z-10">
        <div className="min-h-full flex flex-col w-full max-w-2xl mx-auto p-4 py-8 relative">
          <div className="my-auto w-full flex flex-col">
            {/* Hero */}
            <div className="flex flex-col items-center gap-2 mb-8 mt-2">
              <div className="flex items-center gap-2.5">
                <h1
                  className="typo-page-title text-center tracking-tight cursor-pointer hover:underline decoration-primary/40 underline-offset-4 transition-all"
                  onClick={handleOpenRenameDialog}
                  title="Clic para renombrar"
                  data-testid="app-details-rename-app-button"
                >
                  {selectedApp.name}
                </h1>
                <LanguageBadge language={selectedApp.primaryLanguage} />
              </div>
              <span
                className="typo-mono-xs text-muted-foreground/50 break-all text-center cursor-pointer hover:text-muted-foreground/80 transition-colors"
                title="Abrir carpeta"
                onClick={() => ipc.system.showItemInFolder(currentAppPath)}
              >
                {currentAppPath}
              </span>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                {(!selectedApp.primaryLanguage || ['javascript', 'typescript', 'unknown'].includes(selectedApp.primaryLanguage?.toLowerCase?.())) && (
                <Button
                  variant="outline"
                  onClick={() => {
                    if (!appId) return;
                    ipc.system.openChatWindow({ appId, theme, themeIntensity: intensity });
                  }}
                  className="cursor-pointer flex-1 py-7 flex justify-center items-center gap-2 text-base font-semibold shadow-sm bg-primary/10 border-primary/20 text-primary hover:bg-primary/15 transition-colors"
                  size="lg"
                >
                  <MessageCircle className="h-5 w-5" />
                  Abrir en Chat
                </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => setIsDeleteDialogOpen(true)}
                  className="cursor-pointer flex-1 py-7 flex justify-center items-center gap-2 text-base font-semibold shadow-sm bg-transparent border-destructive/20 text-destructive/80 hover:bg-destructive/10 hover:text-destructive transition-colors"
                  size="lg"
                >
                  <FolderX className="h-5 w-5" />
                  Cerrar workspace
                </Button>
              </div>

              {hasDesignMd && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 h-9 bg-transparent border-border hover:bg-muted/50 dark:hover:bg-white/5 cursor-pointer self-center"
                  onClick={handleDownloadDesign}
                >
                  <Download className="h-3.5 w-3.5" />
                  Descargar DESIGN.md
                </Button>
              )}



              {/* ── Integraciones ── */}
              <div className="mt-6">
                <div className="flex items-center gap-2 mb-3 px-1">
                  <span className="text-xs font-medium text-muted-foreground/60 tracking-wide">Integraciones</span>
                </div>
                <div className="space-y-2">
                  {/* ── Connected integrations ── */}
                  {selectedApp.githubOrg && selectedApp.githubRepo && (
                    <CollapsibleCard
                      title="GitHub"
                      icon={<Github className="h-5 w-5" />}
                      description={`${selectedApp.githubOrg}/${selectedApp.githubRepo}`}
                    >
                      <GitHubConnector appId={appId} folderName={selectedApp.path} />
                      {appId && (
                        <div className="pt-4 border-t border-gray-100 dark:border-gray-800 mt-4">
                          <GithubCollaboratorManager appId={appId} />
                        </div>
                      )}
                    </CollapsibleCard>
                  )}
                  {selectedApp.bunnyConfig && appId && <BunnyConnector appId={appId} />}
                  {selectedApp.supabaseProjectId && appId && <SupabaseConnector appId={appId} />}
                  {selectedApp.pocketbaseConfig && appId && <PocketBaseConnector appId={appId} />}

                  {/* ── Unconnected integrations (muted) ── */}
                  {!(selectedApp.githubOrg && selectedApp.githubRepo) && (
                    <div className="opacity-50 hover:opacity-80 transition-opacity">
                      <CollapsibleCard
                        title="GitHub"
                        icon={<Github className="h-5 w-5" />}
                        description="No conectado"
                      >
                        <GitHubConnector appId={appId} folderName={selectedApp.path} />
                      </CollapsibleCard>
                    </div>
                  )}
                  {!selectedApp.bunnyConfig && appId && (
                    <div className="opacity-50 hover:opacity-80 transition-opacity">
                      <BunnyConnector appId={appId} />
                    </div>
                  )}
                  {!selectedApp.supabaseProjectId && appId && (
                    <div className="opacity-50 hover:opacity-80 transition-opacity">
                      <SupabaseConnector appId={appId} />
                    </div>
                  )}
                  {!selectedApp.pocketbaseConfig && appId && (
                    <div className="opacity-50 hover:opacity-80 transition-opacity">
                      <PocketBaseConnector appId={appId} />
                    </div>
                  )}


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
                  <DialogTitle>Renombrar directorio del workspace</DialogTitle>
                  <DialogDescription>
                    Esto cambiará solo el nombre del directorio en disco, no el nombre del
                    workspace.
                  </DialogDescription>
                </DialogHeader>
                <Input
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Introduce el nuevo nombre del directorio"
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
                      "Renombrar directorio"
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
                  <DialogTitle>Cambiar ubicación del workspace</DialogTitle>
                  <DialogDescription>
                    Selecciona una ubicación donde se guardará este workspace. El
                    nombre del directorio seguirá siendo el mismo.
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
                      "Seleccionar directorio"
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
                  <DialogTitle>¿Cerrar workspace "{selectedApp.name}"?</DialogTitle>
                  <DialogDescription>
                    El workspace se desvinculará de Vibes. Los archivos en disco se conservarán.
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
                    Eliminar también los archivos del disco
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
                      "Eliminar workspace y archivos"
                    ) : (
                      "Cerrar workspace"
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
