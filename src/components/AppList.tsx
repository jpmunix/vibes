import { useNavigate } from "@tanstack/react-router";
import { PlusCircle, Search } from "lucide-react";
import { useAtom, useSetAtom } from "jotai";
import { selectedAppIdAtom } from "@/atoms/appAtoms";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
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

export function AppList({ show }: { show?: boolean }) {
  const navigate = useNavigate();
  const [selectedAppId, setSelectedAppId] = useAtom(selectedAppIdAtom);
  const setSelectedChatId = useSetAtom(selectedChatIdAtom);
  const { apps, loading, error, refreshApps } = useLoadApps();
  const { toggleFavorite, isLoading: isFavoriteLoading } =
    useAddAppToFavorite();
  // search dialog state
  const [isSearchDialogOpen, setIsSearchDialogOpen] = useState(false);

  // delete app dialog state
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteAppId, setDeleteAppId] = useState<number | null>(null);
  const [deleteAppName, setDeleteAppName] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

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
    () => apps.filter((app) => app.isFavorite),
    [apps],
  );

  const nonFavoriteApps = useMemo(
    () => apps.filter((app) => !app.isFavorite),
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

  const handleDeleteAppClick = (appId: number, appName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteAppId(appId);
    setDeleteAppName(appName);
    setIsDeleteDialogOpen(true);
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
      <SidebarGroup
        className="overflow-y-auto h-[calc(100vh-112px)]"
        data-testid="app-list-container"
      >
        <SidebarGroupLabel>Tus aplicaciones</SidebarGroupLabel>
        <SidebarGroupContent>
          <div className="flex flex-col space-y-2">
            <Button
              onClick={handleNewApp}
              variant="outline"
              className="flex items-center justify-start gap-2 mx-2 py-2"
            >
              <PlusCircle size={16} />
              <span>Nueva aplicación</span>
            </Button>
            <ImportAppButton className="mx-2 px-0 pb-0" />
            <Button
              onClick={() => setIsSearchDialogOpen(!isSearchDialogOpen)}
              variant="outline"
              className="flex items-center justify-start gap-2 mx-2 py-3"
              data-testid="search-apps-button"
            >
              <Search size={16} />
              <span>Buscar aplicaciones</span>
            </Button>

            {loading ? (
              <div className="py-2 px-4 text-sm text-muted-foreground">
                Cargando aplicaciones...
              </div>
            ) : error ? (
              <div className="py-2 px-4 text-sm text-red-500">
                Error al cargar las aplicaciones
              </div>
            ) : apps.length === 0 ? (
              <div className="py-2 px-4 text-sm text-muted-foreground">
                No se encontraron aplicaciones
              </div>
            ) : (
              <SidebarMenu className="space-y-1" data-testid="app-list">
                <SidebarGroupLabel>Aplicaciones favoritas</SidebarGroupLabel>
                {favoriteApps.map((app) => (
                  <AppItem
                    key={app.id}
                    app={app}
                    handleAppClick={handleAppClick}
                    selectedAppId={selectedAppId}
                    handleToggleFavorite={handleToggleFavorite}
                    isFavoriteLoading={isFavoriteLoading}
                    handleDeleteApp={handleDeleteAppClick}
                  />
                ))}
                <SidebarGroupLabel>Otras aplicaciones</SidebarGroupLabel>
                {nonFavoriteApps.map((app) => (
                  <AppItem
                    key={app.id}
                    app={app}
                    handleAppClick={handleAppClick}
                    selectedAppId={selectedAppId}
                    handleToggleFavorite={handleToggleFavorite}
                    isFavoriteLoading={isFavoriteLoading}
                    handleDeleteApp={handleDeleteAppClick}
                  />
                ))}
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
    </>
  );
}

