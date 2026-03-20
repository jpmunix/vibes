import { useNavigate } from "@tanstack/react-router";
import { PlusCircle, Search, FolderPlus, Loader2 } from "lucide-react";
import { useAtom, useSetAtom } from "jotai";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectedChatIdAtom } from "@/atoms/chatAtoms";
import { useLoadApps } from "@/hooks/useLoadApps";
import { useMemo, useState } from "react";
import { AppSearchDialog } from "./AppSearchDialog";
import { useAddAppToFavorite } from "@/hooks/useAddAppToFavorite";
import { AppItem } from "./appItem";
import { ipc } from "@/ipc/types";
import { showError } from "@/lib/toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ImportAppButton } from "./ImportAppButton";
import { useCreateApp } from "@/hooks/useCreateApp";
import { useCheckName } from "@/hooks/useCheckName";
import { useTheme } from "@/contexts/ThemeContext";
import { useSettings } from "@/hooks/useSettings";

export function AppList({ show }: { show?: boolean }) {
  const navigate = useNavigate();
  const [selectedAppId, setSelectedAppId] = useAtom(selectedAppIdAtom);
  const setSelectedChatId = useSetAtom(selectedChatIdAtom);
  const { apps, loading, error, refreshApps } = useLoadApps();
  const { toggleFavorite, isLoading: isFavoriteLoading } =
    useAddAppToFavorite();
  const { createApp } = useCreateApp();
  const { theme, intensity } = useTheme();
  const { settings } = useSettings();
  // search dialog state
  const [isSearchDialogOpen, setIsSearchDialogOpen] = useState(false);

  // delete app dialog state
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteAppId, setDeleteAppId] = useState<number | null>(null);
  const [deleteAppName, setDeleteAppName] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  // empty app dialog state
  const [isEmptyAppDialogOpen, setIsEmptyAppDialogOpen] = useState(false);
  const [emptyAppName, setEmptyAppName] = useState("");
  const [isCreatingEmptyApp, setIsCreatingEmptyApp] = useState(false);
  const { data: emptyAppNameCheck } = useCheckName(emptyAppName);

  const allApps = useMemo(
    () =>
      apps.map((a) => ({
        id: a.id,
        name: a.name,
        createdAt: a.createdAt,
        matchedChatTitle: null,
        matchedChatMessage: null,
      })),
    [apps],
  );

  const favoriteApps = useMemo(
    () => apps.filter((app) => app.isFavorite && app.localPathExists !== false),
    [apps],
  );

  const nonFavoriteApps = useMemo(
    () => apps.filter((app) => !app.isFavorite && app.localPathExists !== false),
    [apps],
  );

  const noLocalFilesApps = useMemo(
    () => apps.filter((app) => app.localPathExists === false),
    [apps],
  );

  if (!show) {
    return null;
  }

  const handleAppClick = (id: number) => {
    setSelectedAppId(id);
    setSelectedChatId(null);
    setIsSearchDialogOpen(false);
    navigate({
      to: "/",
      search: { appId: id },
    });
  };

  const handleNewApp = () => {
    navigate({ to: "/" });
    // We'll eventually need a create app workflow
  };

  const handleToggleFavorite = (appId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFavorite(appId);
  };

  const handleCreateEmptyApp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emptyAppName.trim() || emptyAppNameCheck?.exists) return;

    try {
      setIsCreatingEmptyApp(true);
      const result = await createApp({
        name: emptyAppName.trim(),
        useDefaultScaffold: true,
      });

      // Apply theme if one is selected
      if (settings?.selectedThemeId) {
        await ipc.template.setAppTheme({
          appId: result.app.id,
          themeId: settings.selectedThemeId,
        });
      }

      setSelectedAppId(result.app.id);
      setEmptyAppName("");
      setIsEmptyAppDialogOpen(false);
      await refreshApps();

      navigate({ to: "/app-details", search: { appId: result.app.id } });
    } catch (error) {
      showError(error);
    } finally {
      setIsCreatingEmptyApp(false);
    }
  };

  const handleDeleteAppClick = (appId: number, appName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteAppId(appId);
    setDeleteAppName(appName);
    setIsDeleteDialogOpen(true);
  };

  const handleOpenChat = (appId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    ipc.system.openChatWindow({ appId, theme, themeIntensity: intensity });
  };

  const handleConfirmDelete = async () => {
    if (deleteAppId === null) return;

    try {
      setIsDeleting(true);
      await ipc.app.deleteApp({ appId: deleteAppId });
      setIsDeleteDialogOpen(false);
      await refreshApps();
      if (selectedAppId === deleteAppId) {
        setSelectedAppId(null);
        navigate({ to: "/", search: {} });
      }
    } catch (error) {
      setIsDeleteDialogOpen(false);
      showError(error);
    } finally {
      setIsDeleting(false);
      setDeleteAppId(null);
      setDeleteAppName("");
    }
  };

  return (
    <>
      {/* ── Sidebar premium styles ── */}
      <style>{`
        .sidebar-action-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          padding: 7px 10px;
          border-radius: 10px;
          border: 1px solid var(--border);
          background: var(--sidebar);
          color: var(--sidebar-foreground);
          font-size: 12.5px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.18s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .sidebar-action-btn:hover {
          background: var(--sidebar-accent);
          border-color: var(--border);
          transform: translateY(-0.5px);
          box-shadow: 0 2px 8px -2px rgba(0, 0, 0, 0.08);
        }
        .sidebar-action-btn:active {
          transform: scale(0.98);
        }
        .sidebar-action-btn svg {
          opacity: 0.55;
          flex-shrink: 0;
          color: var(--primary);
        }
        .sidebar-action-btn:hover svg {
          opacity: 0.85;
        }

        .sidebar-section-label {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--muted-foreground);
          opacity: 0.5;
          padding: 10px 12px 4px;
        }
      `}</style>

      <SidebarGroup
        className="overflow-y-auto h-[calc(100vh-112px)]"
        data-testid="app-list-container"
      >
        <SidebarGroupLabel>Tus aplicaciones</SidebarGroupLabel>
        <SidebarGroupContent>
          <div className="flex flex-col gap-1.5 px-2">
            <button onClick={handleNewApp} className="sidebar-action-btn" type="button">
              <PlusCircle size={15} />
              <span>Nueva aplicación</span>
            </button>
            <button
              onClick={() => setIsEmptyAppDialogOpen(true)}
              className="sidebar-action-btn"
              data-testid="new-empty-app-button"
              type="button"
            >
              <FolderPlus size={15} />
              <span>Nueva aplicación vacía</span>
            </button>
            <ImportAppButton className="mx-0 px-0 pb-0" />
            <button
              onClick={() => setIsSearchDialogOpen(!isSearchDialogOpen)}
              className="sidebar-action-btn"
              data-testid="search-apps-button"
              type="button"
            >
              <Search size={15} />
              <span>Buscar aplicaciones</span>
            </button>

            {loading ? (
              <div className="py-3 px-2 text-xs text-muted-foreground/60 text-center">
                Cargando aplicaciones...
              </div>
            ) : error ? (
              <div className="py-3 px-2 text-xs text-red-400 text-center">
                Error al cargar las aplicaciones
              </div>
            ) : apps.length === 0 ? (
              <div className="py-3 px-2 text-xs text-muted-foreground/60 text-center">
                No se encontraron aplicaciones
              </div>
            ) : (
              <SidebarMenu className="mt-1" data-testid="app-list">
                {favoriteApps.length > 0 && (
                  <>
                    <div className="sidebar-section-label">Aplicaciones favoritas</div>
                    {favoriteApps.map((app) => (
                      <AppItem
                        key={app.id}
                        app={app}
                        handleAppClick={handleAppClick}
                        selectedAppId={selectedAppId}
                        handleToggleFavorite={handleToggleFavorite}
                        isFavoriteLoading={isFavoriteLoading}
                        handleOpenChat={handleOpenChat}
                        onRefresh={refreshApps}
                      />
                    ))}
                  </>
                )}
                {nonFavoriteApps.length > 0 && (
                  <>
                    <div className="sidebar-section-label">Otras aplicaciones</div>
                    {nonFavoriteApps.map((app) => (
                      <AppItem
                        key={app.id}
                        app={app}
                        handleAppClick={handleAppClick}
                        selectedAppId={selectedAppId}
                        handleToggleFavorite={handleToggleFavorite}
                        isFavoriteLoading={isFavoriteLoading}
                        handleOpenChat={handleOpenChat}
                        onRefresh={refreshApps}
                      />
                    ))}
                  </>
                )}
                {noLocalFilesApps.length > 0 && (
                  <>
                    <div className="sidebar-section-label" style={{ opacity: 0.35 }}>Sin archivos locales</div>
                    {noLocalFilesApps.map((app) => (
                      <AppItem
                        key={app.id}
                        app={app}
                        handleAppClick={handleAppClick}
                        selectedAppId={selectedAppId}
                        handleToggleFavorite={handleToggleFavorite}
                        isFavoriteLoading={isFavoriteLoading}
                        handleOpenChat={handleOpenChat}
                        onRefresh={refreshApps}
                      />
                    ))}
                  </>
                )}
              </SidebarMenu>
            )}
          </div>
        </SidebarGroupContent>
      </SidebarGroup>
      <AppSearchDialog
        open={isSearchDialogOpen}
        onOpenChange={setIsSearchDialogOpen}
        onSelectApp={handleAppClick}
        allApps={allApps}
      />

      {/* Delete App Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="max-w-sm p-4">
          <DialogHeader className="pb-2">
            <DialogTitle>¿Borrar "{deleteAppName}"?</DialogTitle>
            <DialogDescription className="text-xs">
              Esta acción es irreversible. Todos los archivos de la aplicación
              y el historial del chat se borrarán permanentemente.
            </DialogDescription>
          </DialogHeader>
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
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="flex items-center gap-1"
              size="sm"
            >
              {isDeleting ? (
                <>
                  <svg
                    className="animate-spin h-3 w-3 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Borrando...
                </>
              ) : (
                "Borrar aplicación"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Empty App Creation Dialog */}
      <Dialog open={isEmptyAppDialogOpen} onOpenChange={(open) => {
        setIsEmptyAppDialogOpen(open);
        if (!open) setEmptyAppName("");
      }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Crear aplicación vacía</DialogTitle>
            <DialogDescription>
              Se creará una aplicación con el scaffold por defecto, lista para editar.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateEmptyApp}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="emptyAppName">Nombre de la aplicación</Label>
                <Input
                  id="emptyAppName"
                  value={emptyAppName}
                  onChange={(e) => setEmptyAppName(e.target.value)}
                  placeholder="Introduce el nombre de la aplicación..."
                  className={emptyAppNameCheck?.exists ? "border-red-500" : ""}
                  disabled={isCreatingEmptyApp}
                  autoFocus
                />
                {emptyAppNameCheck?.exists && (
                  <p className="text-sm text-red-500">
                    Ya existe una aplicación con este nombre
                  </p>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsEmptyAppDialogOpen(false);
                  setEmptyAppName("");
                }}
                disabled={isCreatingEmptyApp}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={!emptyAppName.trim() || !!emptyAppNameCheck?.exists || isCreatingEmptyApp}
              >
                {isCreatingEmptyApp && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {isCreatingEmptyApp ? "Creando..." : "Crear aplicación"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

