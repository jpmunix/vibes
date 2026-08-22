/**
 * #95 — Workspace multi-proyecto: página de gestión de folders.
 *
 * Lista los folders vinculados al app (primario + extras), permite añadir
 * nuevos via el directory picker (selectAppLocation), editar el label,
 * y desvincular extras (sin tocar archivos en disco).
 *
 * La page es read/write contra los contratos IPC de app_folders:
 *   - listAppFolders({ appId })
 *   - addAppFolder({ appId, path })
 *   - updateAppFolderLabel({ appId, folderId, label })
 *   - removeAppFolder({ appId, folderId })
 */
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  ArrowLeft,
  Folder,
  FolderOpen,
  FolderPlus,
  Loader2,
  Plus,
  X,
  Pencil,
  Check,
} from "@/components/ui/icons";
import { showError, showSuccess } from "@/lib/toast";
import { appClient } from "@/ipc/types/app";
import { appFolderClient, type AppFolder } from "@/ipc/types/app_folders";

export default function AppFoldersPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/app-folders" as const });
  const appId = search.appId;
  const queryClient = useQueryClient();

  // ── Query: list folders ──────────────────────────────────────────────────
  const {
    data,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["app-folders", appId],
    queryFn: () => appFolderClient.listAppFolders({ appId }),
    enabled: !!appId,
  });

  const folders: AppFolder[] = data?.folders ?? [];

  // ── Mutations ────────────────────────────────────────────────────────────
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["app-folders", appId] });

  const addMutation = useMutation({
    mutationFn: appFolderClient.addAppFolder,
    onSuccess: () => {
      showSuccess("Folder vinculado");
      invalidate();
    },
    onError: (e: unknown) => showError((e as Error).message ?? "Error al vincular"),
  });

  const removeMutation = useMutation({
    mutationFn: appFolderClient.removeAppFolder,
    onSuccess: () => {
      showSuccess("Folder desvinculado (archivos intactos)");
      invalidate();
    },
    onError: (e: unknown) => showError((e as Error).message ?? "Error al desvincular"),
  });

  const renameMutation = useMutation({
    mutationFn: appFolderClient.updateAppFolderLabel,
    onSuccess: () => {
      showSuccess("Label actualizado");
      invalidate();
      setEditingId(null);
    },
    onError: (e: unknown) => showError((e as Error).message ?? "Error al renombrar"),
  });

  // ── Add folder via picker ────────────────────────────────────────────────
  const handleAddFolder = async () => {
    try {
      const result = await appClient.selectAppLocation({});
      if (result.canceled || !result.path) return;
      addMutation.mutate({ appId, path: result.path });
    } catch (e) {
      showError((e as Error).message ?? "No se pudo elegir la carpeta");
    }
  };

  // ── Inline label editing ─────────────────────────────────────────────────
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");

  const startEdit = (f: AppFolder) => {
    setEditingId(f.id);
    setEditLabel(f.label);
  };
  const commitEdit = (folderId: number) => {
    if (!editLabel.trim()) return;
    renameMutation.mutate({ appId, folderId, label: editLabel.trim() });
  };

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate({ to: "/app-details", search: { appId } })}
        className="mb-4"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Volver
      </Button>

      <h1 className="typo-section-title mb-1">Folders del workspace</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Carpetas vinculadas a este workspace. El primario es el repo principal
        del app; los extras son solo código accesible desde el chat.
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5" />
              Carpetas vinculadas
            </span>
            <Button
              size="sm"
              onClick={handleAddFolder}
              disabled={addMutation.isPending}
            >
              {addMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Añadir carpeta
            </Button>
          </CardTitle>
          <CardDescription>
            {folders.length === 0
              ? "Sin carpetas (usa el botón para añadir la primera)"
              : `${folders.length} carpeta(s) vinculada(s)`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Cargando…
            </div>
          )}
          {error && (
            <div className="text-sm text-destructive py-4">
              Error al cargar: {(error as Error).message}
            </div>
          )}
          {!isLoading && !error && folders.length === 0 && (
            <div className="py-8 text-center text-muted-foreground">
              <Folder className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No hay carpetas vinculadas todavía.</p>
              <p className="text-xs mt-1">
                Pulsa “Añadir carpeta” para elegir un directorio del disco.
              </p>
            </div>
          )}
          {!isLoading && !error && folders.length > 0 && (
            <ul className="space-y-2">
              {folders.map((f) => (
                <li
                  key={f.id}
                  className="flex items-start justify-between gap-3 rounded-md border p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Folder className="h-4 w-4 shrink-0" />
                      {editingId === f.id ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={editLabel}
                            onChange={(e) => setEditLabel(e.target.value)}
                            className="h-7 w-40"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitEdit(f.id);
                              if (e.key === "Escape") setEditingId(null);
                            }}
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => commitEdit(f.id)}
                            disabled={renameMutation.isPending}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <span className="font-medium truncate">{f.label}</span>
                          {!f.isPrimary && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => startEdit(f)}
                              disabled={renameMutation.isPending}
                              className="h-6 px-2"
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                          )}
                        </>
                      )}
                      {f.isPrimary && (
                        <Badge variant="secondary" className="shrink-0">
                          Primary
                        </Badge>
                      )}
                      {f.language && (
                        <Badge variant="outline" className="shrink-0">
                          {f.language}
                        </Badge>
                      )}
                      {f.projectType && f.projectType !== "generic" && (
                        <Badge variant="outline" className="shrink-0">
                          {f.projectType}
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate pl-6">
                      {f.path}
                    </div>
                  </div>
                  {!f.isPrimary && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeMutation.mutate({ appId, folderId: f.id })}
                      disabled={removeMutation.isPending}
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      title="Desvincular (no borra archivos)"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {!isLoading && !error && folders.length > 1 && (
            <p className="mt-4 text-xs text-muted-foreground">
              💡 Con más de una carpeta, el agente pedirá aclarar a cuál te
              refieres cuando sea ambiguo.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
