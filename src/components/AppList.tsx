import { useNavigate } from "@tanstack/react-router";
import { Loader2, X, FolderX, Archive, ArchiveRestore, ChevronDown, ChevronRight } from "@/components/ui/icons";
import { useAtom, useSetAtom, useAtomValue } from "jotai";
import { selectedAppIdAtom, appsListAtom } from "@/atoms/appAtoms";
import { sidebarActionAtom } from "@/atoms/uiAtoms";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectedChatIdAtom } from "@/atoms/chatAtoms";
import { useLoadApps } from "@/hooks/useLoadApps";
import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { AppSearchDialog } from "./AppSearchDialog";
import { useAddAppToFavorite } from "@/hooks/useAddAppToFavorite";
import { AppItem } from "./appItem";
import { ipc } from "@/ipc/types";
import { showError, showSuccess } from "@/lib/toast";
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
import { Checkbox } from "@/components/ui/checkbox";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

export function AppList({ show }: { show?: boolean }) {
  const navigate = useNavigate();
  const [selectedAppId, setSelectedAppId] = useAtom(selectedAppIdAtom);
  const setSelectedChatId = useSetAtom(selectedChatIdAtom);
  const setApps = useSetAtom(appsListAtom);
  const { apps, loading, error, refreshApps } = useLoadApps();
  const { toggleFavorite, isLoading: isFavoriteLoading } =
    useAddAppToFavorite();
  const { createApp } = useCreateApp();
  const { theme, intensity } = useTheme();
  // search dialog state
  const [isSearchDialogOpen, setIsSearchDialogOpen] = useState(false);

  // delete app dialog state
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteAppId, setDeleteAppId] = useState<number | null>(null);
  const [deleteAppName, setDeleteAppName] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteFiles, setDeleteFiles] = useState(false);

  // empty app dialog state
  const [isEmptyAppDialogOpen, setIsEmptyAppDialogOpen] = useState(false);
  const [emptyAppName, setEmptyAppName] = useState("");
  const [isCreatingEmptyApp, setIsCreatingEmptyApp] = useState(false);
  const { data: emptyAppNameCheck } = useCheckName(emptyAppName);
  const queryClient = useQueryClient();

  // ── Archived apps state ──
  const [archivedOpen, setArchivedOpen] = useState(false);
  const { data: archivedApps = [], refetch: refetchArchived } = useQuery({
    queryKey: ["archived-apps"],
    queryFn: () => ipc.app.getArchivedApps(),
    enabled: archivedOpen,
  });
  const [unarchivingId, setUnarchivingId] = useState<number | null>(null);

  // ── Bulk selection mode state ──
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false);
  const [bulkDeleteFiles, setBulkDeleteFiles] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);

  // Listen for sidebar action triggers from TopNavbar dropdown
  const sidebarAction = useAtomValue(sidebarActionAtom);
  const lastActionRef = useRef<number>(0);
  useEffect(() => {
    if (!sidebarAction || sidebarAction.ts === lastActionRef.current) return;
    lastActionRef.current = sidebarAction.ts;
    switch (sidebarAction.action) {
      case "apps:new":
        handleNewApp();
        break;
      case "apps:empty":
        setIsEmptyAppDialogOpen(true);
        break;
      case "apps:import":
        // Trigger the import button programmatically via a custom event
        window.dispatchEvent(new CustomEvent("trigger-import-app"));
        break;
      case "apps:search":
        setIsSearchDialogOpen(true);
        break;
      case "apps:bulk-close":
        enterSelectionMode();
        break;
    }
  }, [sidebarAction]);

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

  // ── Bulk selection helpers ──
  const enterSelectionMode = useCallback(() => {
    setSelectionMode(true);
    setSelectedIds(new Set());
  }, []);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const toggleSelect = useCallback((appId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(appId)) {
        next.delete(appId);
      } else {
        next.add(appId);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    const allIds = apps.map((a) => a.id);
    setSelectedIds(new Set(allIds));
  }, [apps]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleBulkClose = useCallback(() => {
    if (selectedIds.size === 0) return;
    setIsBulkDialogOpen(true);
  }, [selectedIds]);

  const handleConfirmBulkClose = async () => {
    if (selectedIds.size === 0) return;

    try {
      setIsBulkDeleting(true);
      setBulkProgress(0);
      const ids = Array.from(selectedIds);
      let completed = 0;

      for (const appId of ids) {
        await ipc.app.deleteApp({ appId, deleteFiles: bulkDeleteFiles });
        completed++;
        setBulkProgress(Math.round((completed / ids.length) * 100));
      }

      setIsBulkDialogOpen(false);
      setSelectionMode(false);
      setSelectedIds(new Set());
      await refreshApps();

      // If current app was among deleted, navigate away
      if (selectedAppId !== null && ids.includes(selectedAppId)) {
        setSelectedAppId(null);
        navigate({ to: "/", search: {} });
      }
    } catch (error) {
      showError(error);
    } finally {
      setIsBulkDeleting(false);
      setBulkDeleteFiles(false);
      setBulkProgress(0);
    }
  };

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
        empty: true,
      });

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
      await ipc.app.deleteApp({ appId: deleteAppId, deleteFiles });
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
      setDeleteFiles(false);
    }
  };

  const handleArchiveApp = async (appId: number, appName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // Optimistic: remove from atom immediately (no flash)
    setApps(prev => prev.filter(a => a.id !== appId));
    if (selectedAppId === appId) {
      setSelectedAppId(null);
      navigate({ to: "/", search: {} });
    }
    try {
      await ipc.app.archiveApp({ appId, archived: true });
      queryClient.invalidateQueries({ queryKey: ["archived-apps"] });
      showSuccess(`"${appName}" archivado`);
    } catch (error) {
      // Rollback on failure
      refreshApps();
      showError(error);
    }
  };

  const handleUnarchiveApp = async (appId: number) => {
    setUnarchivingId(appId);
    try {
      await ipc.app.archiveApp({ appId, archived: false });
      // Optimistic: move app from archived list back into main atom
      const restored = archivedApps.find(a => a.id === appId);
      if (restored) setApps(prev => [restored, ...prev]);
      queryClient.invalidateQueries({ queryKey: ["archived-apps"] });
    } catch (error) {
      showError(error);
    } finally {
      setUnarchivingId(null);
    }
  };

  // Selected app names for the bulk dialog
  const selectedAppNames = useMemo(
    () => apps.filter((a) => selectedIds.has(a.id)).map((a) => a.name),
    [apps, selectedIds],
  );

  const renderAppItem = (app: (typeof apps)[0]) => (
    <AppItem
      key={app.id}
      app={app}
      handleAppClick={handleAppClick}
      selectedAppId={selectedAppId}
      handleToggleFavorite={handleToggleFavorite}
      isFavoriteLoading={isFavoriteLoading}
      handleOpenChat={handleOpenChat}
      onRefresh={refreshApps}
      selectionMode={selectionMode}
      isSelected={selectedIds.has(app.id)}
      onToggleSelect={toggleSelect}
      onArchive={handleArchiveApp}
    />
  );

  return (
    <>
      {show && (
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
              font-size: 14.5px;
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
              font-size: 12px;
              font-weight: 500;
              letter-spacing: 0.03em;
              color: var(--muted-foreground);
              opacity: 0.6;
              padding: 10px 12px 4px;
            }

            /* ── Bulk selection toolbar ── */
            .bulk-toolbar {
              display: flex;
              align-items: center;
              gap: 6px;
              padding: 8px 14px;
              background: var(--sidebar);
              border-top: 1px solid var(--border);
              animation: bulk-toolbar-in 0.2s ease-out;
              overflow: hidden;
            }
            @keyframes bulk-toolbar-in {
              from { opacity: 0; transform: translateY(8px); }
              to { opacity: 1; transform: translateY(0); }
            }
            .bulk-toolbar-count {
              font-size: 12px;
              font-weight: 600;
              color: var(--primary);
              margin-right: auto;
              white-space: nowrap;
            }

            /* Bulk dialog app list */
            .bulk-app-list {
              max-height: 160px;
              overflow-y: auto;
              background: var(--muted);
              border-radius: 8px;
              padding: 8px 10px;
              margin: 8px 0;
            }
            .bulk-app-list-item {
              font-size: 13px;
              padding: 2px 0;
              color: var(--foreground);
              opacity: 0.85;
            }

            /* Bulk progress bar */
            .bulk-progress {
              height: 3px;
              background: var(--muted);
              border-radius: 2px;
              overflow: hidden;
              margin-top: 8px;
            }
            .bulk-progress-bar {
              height: 100%;
              background: var(--primary);
              transition: width 0.3s ease;
              border-radius: 2px;
            }
          `}</style>

          <SidebarGroup
            className={`overflow-y-auto overflow-x-hidden ${selectionMode ? "h-[calc(100vh-112px-52px)]" : "h-[calc(100vh-112px)]"}`}
            data-testid="app-list-container"
          >

        {/* ── Selection mode header bar ── */}
        {selectionMode && (
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border/60 animate-in fade-in slide-in-from-top-2 duration-200">
            <FolderX size={15} className="text-primary shrink-0" />
            <span className="typo-caption font-semibold text-primary">Seleccionar para cerrar</span>
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                className="typo-micro text-muted-foreground hover:text-primary cursor-pointer transition-colors px-1.5 py-0.5 rounded"
                onClick={selectedIds.size === apps.length ? deselectAll : selectAll}
              >
                {selectedIds.size === apps.length ? "Ninguna" : "Todas"}
              </button>
              <button
                type="button"
                className="flex items-center justify-center w-6 h-6 rounded-md hover:bg-sidebar-accent cursor-pointer transition-colors"
                onClick={exitSelectionMode}
                title="Cancelar"
              >
                <X size={14} className="text-muted-foreground" />
              </button>
            </div>
          </div>
        )}
        
        <SidebarGroupContent>
          <div className="flex flex-col gap-1.5 px-2">
            {loading ? (
              <div className="py-3 px-2 typo-caption opacity-60 text-center">
                Cargando aplicaciones...
              </div>
            ) : error ? (
              <div className="py-3 px-2 typo-caption text-destructive text-center">
                Error al cargar las aplicaciones
              </div>
            ) : apps.length === 0 ? (
              <div className="py-3 px-2 typo-caption opacity-60 text-center">
                No se encontraron aplicaciones
              </div>
            ) : (
              <SidebarMenu className="mt-1" data-testid="app-list">
                {favoriteApps.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground/60 tracking-wide">Aplicaciones fijadas</div>
                    {favoriteApps.map(renderAppItem)}
                  </>
                )}
                {nonFavoriteApps.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground/60 tracking-wide">Aplicaciones</div>
                    {nonFavoriteApps.map(renderAppItem)}
                  </>
                )}
                {noLocalFilesApps.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground/60 tracking-wide">Sin archivos locales</div>
                    {noLocalFilesApps.map(renderAppItem)}
                  </>
                )}
              </SidebarMenu>
            )}

            {/* ── Archived apps collapsible ── */}
            <div className="mt-3">
              <button
                type="button"
                className="flex items-center gap-1.5 px-3 py-1.5 w-full text-xs font-medium text-muted-foreground/60 tracking-wide hover:text-muted-foreground/80 transition-colors cursor-pointer"
                onClick={() => setArchivedOpen(v => !v)}
              >
                {archivedOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <Archive size={12} className="opacity-60" />
                Archivadas
                {archivedApps.length > 0 && (
                  <span className="ml-auto text-[10px] text-muted-foreground/40">
                    {archivedApps.length}
                  </span>
                )}
              </button>

              {archivedOpen && (
                <div className="mt-1 pl-2">
                  {archivedApps.length === 0 ? (
                    <div className="py-3 px-2 typo-caption opacity-40 text-center">
                      Sin apps archivadas
                    </div>
                  ) : (
                    archivedApps.map((app) => (
                      <div
                        key={app.id}
                        className="group/arc flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-sidebar-accent/40 transition-colors"
                      >
                        <div className="p-1 rounded-lg bg-muted/30 shrink-0">
                          <Archive size={11} className="text-muted-foreground/50" />
                        </div>
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="text-sm truncate font-medium text-muted-foreground">{app.name}</span>
                          <span className="text-xs text-muted-foreground/45 mt-0.5">
                            {formatDistanceToNow(new Date(app.createdAt), { addSuffix: true, locale: es })}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-medium transition-all cursor-pointer opacity-0 group-hover/arc:opacity-100"
                          onClick={() => handleUnarchiveApp(app.id)}
                          disabled={unarchivingId === app.id}
                        >
                          {unarchivingId === app.id
                            ? <Loader2 size={11} className="animate-spin" />
                            : <ArchiveRestore size={11} />
                          }
                          Restaurar
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </SidebarGroupContent>
      </SidebarGroup>

          {/* ── Bulk selection bottom toolbar ── */}
          {selectionMode && (
            <div className="bulk-toolbar">
              <span className="bulk-toolbar-count">
                {selectedIds.size} seleccionada{selectedIds.size !== 1 ? "s" : ""}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={exitSelectionMode}
                className="h-7 text-xs"
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleBulkClose}
                disabled={selectedIds.size === 0}
                className="h-7 text-xs flex items-center gap-1"
              >
                <FolderX size={13} />
                Cerrar ({selectedIds.size})
              </Button>
            </div>
          )}
        </>
      )}
      <AppSearchDialog
        open={isSearchDialogOpen}
        onOpenChange={setIsSearchDialogOpen}
        onSelectApp={handleAppClick}
        allApps={allApps}
      />

      {/* Close Folder Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={(open) => {
        setIsDeleteDialogOpen(open);
        if (!open) setDeleteFiles(false);
      }}>
        <DialogContent className="max-w-sm p-4">
          <DialogHeader className="pb-2">
            <DialogTitle>¿Cerrar workspace "{deleteAppName}"?</DialogTitle>
            <DialogDescription>
              El workspace se desvinculará de Vibes. Los archivos en disco se conservarán.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center space-x-2 py-2">
            <input
              type="checkbox"
              id="delete-files-check"
              checked={deleteFiles}
              onChange={(e) => setDeleteFiles(e.target.checked)}
              disabled={isDeleting}
              className="rounded border-border"
            />
            <label htmlFor="delete-files-check" className="typo-caption text-muted-foreground cursor-pointer">
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
              onClick={handleConfirmDelete}
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

      {/* ── Bulk Close Confirmation Dialog ── */}
      <Dialog open={isBulkDialogOpen} onOpenChange={(open) => {
        if (!isBulkDeleting) {
          setIsBulkDialogOpen(open);
          if (!open) setBulkDeleteFiles(false);
        }
      }}>
        <DialogContent className="max-w-sm p-4">
          <DialogHeader className="pb-2">
            <DialogTitle>
              ¿Cerrar {selectedIds.size} workspace{selectedIds.size !== 1 ? "s" : ""}?
            </DialogTitle>
            <DialogDescription>
              {selectedIds.size === 1
                ? "El workspace se desvinculará de Vibes."
                : `Los ${selectedIds.size} workspaces se desvincularán de Vibes.`}
              {" "}Los archivos en disco se conservarán.
            </DialogDescription>
          </DialogHeader>

          {/* List selected apps */}
          <div className="bulk-app-list">
            {selectedAppNames.map((name) => (
              <div key={name} className="bulk-app-list-item">
                • {name}
              </div>
            ))}
          </div>

          <div className="flex items-center space-x-2 py-1">
            <input
              type="checkbox"
              id="bulk-delete-files-check"
              checked={bulkDeleteFiles}
              onChange={(e) => setBulkDeleteFiles(e.target.checked)}
              disabled={isBulkDeleting}
              className="rounded border-border"
            />
            <label htmlFor="bulk-delete-files-check" className="typo-caption text-muted-foreground cursor-pointer">
              Eliminar también los archivos del disco
            </label>
          </div>

          {/* Progress bar during deletion */}
          {isBulkDeleting && (
            <div className="bulk-progress">
              <div
                className="bulk-progress-bar"
                style={{ width: `${bulkProgress}%` }}
              />
            </div>
          )}

          <DialogFooter className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setIsBulkDialogOpen(false)}
              disabled={isBulkDeleting}
              size="sm"
            >
              Cancelar
            </Button>
            <Button
              variant={bulkDeleteFiles ? "destructive" : "default"}
              onClick={handleConfirmBulkClose}
              disabled={isBulkDeleting}
              className="flex items-center gap-1"
              size="sm"
            >
              {isBulkDeleting ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Cerrando... {bulkProgress}%
                </>
              ) : bulkDeleteFiles ? (
                `Eliminar ${selectedIds.size} workspace${selectedIds.size !== 1 ? "s" : ""} y archivos`
              ) : (
                `Cerrar ${selectedIds.size} workspace${selectedIds.size !== 1 ? "s" : ""}`
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
            <DialogTitle>Crear workspace</DialogTitle>
            <DialogDescription>
              Se creará un workspace con el scaffold por defecto, listo para editar.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateEmptyApp}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="emptyAppName">Nombre del workspace</Label>
                <Input
                  id="emptyAppName"
                  value={emptyAppName}
                  onChange={(e) => setEmptyAppName(e.target.value)}
                  placeholder="Nombre del workspace..."
                  className={emptyAppNameCheck?.exists ? "border-red-500" : ""}
                  disabled={isCreatingEmptyApp}
                  autoFocus
                />
                {emptyAppNameCheck?.exists && (
                  <p className="typo-caption text-destructive">
                    Ya existe un workspace con este nombre
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
                {isCreatingEmptyApp ? "Creando..." : "Crear workspace"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ImportAppButton />
    </>
  );
}
