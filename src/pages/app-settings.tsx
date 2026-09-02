/**
 * #234 — Workspace settings page.
 *
 * Rename of the original `app-folders` page (#95) with a new section that
 * lists every AGENTS.md file detected under each linked folder, so the user
 * can see exactly which directives are being sent to the model in this
 * workspace's sessions.
 *
 * Layout follows the canonical Settings shell (src/pages/settings.tsx):
 *  - Outer scroll container with `bg-muted/30`, sections in `space-y-12`.
 *  - Sections: rounded-2xl cards with `shadow-sm border p-8`, title
 *    `typo-section-title` + description `typo-caption`.
 *  - Rows follow the SettingItem pattern (no borders, hover bg).
 *  - Collapsables follow the AgentPermissionsSettings pattern (chevron
 *    rotate-90, content outside the header card).
 *  - Destructive unlink goes through ConfirmationDialog (never bare).
 */
import { useSearch } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Folder,
  FolderOpen,
  Loader2,
  Plus,
  X,
  Pencil,
  Check,
  ChevronRight,
  FileText,
} from "@/components/ui/icons";
import ConfirmationDialog from "@/components/ConfirmationDialog";
import { cn } from "@/lib/utils";
import { showError, showSuccess } from "@/lib/toast";
import { appClient } from "@/ipc/types/app";
import { appFolderClient, type AppFolder } from "@/ipc/types/app_folders";
import {
  agentsMdFileClient,
  type AgentsMdFolderScan,
} from "@/ipc/types/agents_md_files";
import { useI18n } from "@/lib/i18n";

export default function AppSettingsPage() {
  const search = useSearch({ from: "/app-settings" as const });
  const { t, tPlural } = useI18n();
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
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["app-folders", appId] });
    queryClient.invalidateQueries({ queryKey: ["agents-md-files", appId] });
  };

  const addMutation = useMutation({
    mutationFn: appFolderClient.addAppFolder,
    onSuccess: () => {
      showSuccess(t("appFolders.linked"));
      invalidate();
    },
    onError: (e: unknown) => showError((e as Error).message ?? "Error al vincular"),
  });

  const removeMutation = useMutation({
    mutationFn: appFolderClient.removeAppFolder,
    onSuccess: () => {
      showSuccess(t("appFolders.unlinked"));
      invalidate();
    },
    onError: (e: unknown) => showError((e as Error).message ?? "Error al desvincular"),
  });

  const renameMutation = useMutation({
    mutationFn: appFolderClient.updateAppFolderLabel,
    onSuccess: () => {
      showSuccess(t("appFolders.labelUpdated"));
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

  // ── Unlink confirmation (destructive → always dialog) ────────────────────
  const [pendingRemoval, setPendingRemoval] = useState<AppFolder | null>(null);

  return (
    <div className="flex flex-col h-full w-full bg-muted/30 text-foreground overflow-y-auto">
      <div className="w-full mx-auto px-8 pt-4 pb-12 flex-1">
        <div className="space-y-12 pb-24">
          {/* ── Page header (canonical settings: title + caption, no icons) ── */}
          <div>
            <h1 className="typo-section-title mb-2">{t("appSettings.title")}</h1>
            <p className="typo-caption mb-8">{" "}
              {t("appSettings.subtitle")}
            </p>
          </div>

          {/* ── Section: Linked folders ──────────────────────────────────── */}
          <section className="bg-card rounded-2xl shadow-sm border border-border p-8">
            <div className="flex justify-between items-center gap-4">
              <h2 className="typo-section-title mb-2">
                {t("appSettings.linkedFolders")}
              </h2>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddFolder}
                disabled={addMutation.isPending}
                className="gap-2"
              >
                {addMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                {t("appSettings.addFolder")}
              </Button>
            </div>
            <p className="typo-caption mb-8">{" "}
              {folders.length === 0
                ? t("appSettings.noLinked")
                : tPlural("appSettings.linkedCount", folders.length)}
            </p>

            {isLoading && (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
                {t("common.loading")}
              </div>
            )}
            {error && (
              <div className="text-sm text-destructive py-4">
                {t("common.loadError", { error: (error as Error).message })}
              </div>
            )}
            {!isLoading && !error && folders.length === 0 && (
              <div className="py-12 text-center text-muted-foreground rounded-xl bg-muted/30 border border-dashed border-border">
                <Folder className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="typo-label">{t("appFolders.noLinked")}</p>
                <p className="typo-caption mt-1">
                  {t("appSettings.addFolderHint")}
                </p>
              </div>
            )}
            {!isLoading && !error && folders.length > 0 && (
              <div className="space-y-0">
                {folders.map((f) => (
                  <FolderRow
                    key={f.id}
                    folder={f}
                    editingId={editingId}
                    editLabel={editLabel}
                    setEditLabel={setEditLabel}
                    startEdit={startEdit}
                    commitEdit={commitEdit}
                    cancelEdit={() => setEditingId(null)}
                    isRenaming={renameMutation.isPending}
                    onUnlink={() => setPendingRemoval(f)}
                  />
                ))}
              </div>
            )}
            {!isLoading && !error && folders.length > 1 && (
              <p className="typo-caption text-muted-foreground mt-4">
                {t("appSettings.multiFolderHint")}
              </p>
            )}
          </section>

          {/* ── Section: AGENTS.md discovery ─────────────────────────────── */}
          <AgentsMdSection appId={appId} hasFolders={folders.length > 0} />
        </div>
      </div>

      {/* Unlink confirmation */}
      <ConfirmationDialog
        isOpen={!!pendingRemoval}
        title={t("appSettings.removeFolderConfirmTitle")}
        message={t("appSettings.removeFolderConfirmMessage", {
          label: pendingRemoval?.label ?? "",
        })}
        confirmText={t("appFolders.unlink")}
        cancelText={t("common.cancel")}
        onConfirm={() => {
          if (pendingRemoval) {
            removeMutation.mutate({
              appId,
              folderId: pendingRemoval.id,
            });
          }
          setPendingRemoval(null);
        }}
        onCancel={() => setPendingRemoval(null)}
      />
    </div>
  );
}

/**
 * One row inside the linked-folders list. Follows the SettingItem pattern
 * (rounded-xl hover row, no borders), with hover-only inline actions.
 */
function FolderRow({
  folder,
  editingId,
  editLabel,
  setEditLabel,
  startEdit,
  commitEdit,
  cancelEdit,
  isRenaming,
  onUnlink,
}: {
  folder: AppFolder;
  editingId: number | null;
  editLabel: string;
  setEditLabel: (v: string) => void;
  startEdit: (f: AppFolder) => void;
  commitEdit: (folderId: number) => void;
  cancelEdit: () => void;
  isRenaming: boolean;
  onUnlink: () => void;
}) {
  const { t } = useI18n();
  const isEditing = editingId === folder.id;

  return (
    <div
      className="group flex justify-between gap-8 p-4 rounded-xl hover:bg-muted/50 transition-colors items-center"
      data-testid={`folder-row-${folder.id}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1">
          <Folder className="h-4 w-4 shrink-0 text-muted-foreground/70" />
          {isEditing ? (
            <div className="flex items-center gap-2">
              <Input
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                className="h-8 w-48 typo-input"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitEdit(folder.id);
                  if (e.key === "Escape") cancelEdit();
                }}
              />
              <Button
                size="icon"
                variant="ghost"
                onClick={() => commitEdit(folder.id)}
                disabled={isRenaming}
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                aria-label={t("common.confirm")}
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <>
              <span className="typo-label truncate">{folder.label}</span>
              {!folder.isPrimary && (
                <button
                  onClick={() => startEdit(folder)}
                  disabled={isRenaming}
                  className="flex-shrink-0 p-1 text-muted-foreground/40 hover:text-foreground transition-colors cursor-pointer rounded-md"
                  title={t("common.edit")}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </>
          )}
          {folder.isPrimary && (
            <Badge variant="secondary" className="shrink-0 typo-badge">
              Primary
            </Badge>
          )}
          {folder.language && (
            <Badge variant="outline" className="shrink-0 typo-badge">
              {folder.language}
            </Badge>
          )}
          {folder.projectType && folder.projectType !== "generic" && (
            <Badge variant="outline" className="shrink-0 typo-badge">
              {folder.projectType}
            </Badge>
          )}
        </div>
        <div className="typo-mono-xs text-muted-foreground truncate pl-6">
          {folder.path}
        </div>
      </div>
      <div onClick={(e) => e.stopPropagation()} className="flex items-center">
        {!folder.isPrimary && (
          <button
            onClick={onUnlink}
            className="flex-shrink-0 p-1 text-muted-foreground/40 hover:text-destructive transition-colors cursor-pointer rounded-md"
            title={t("appFolders.unlink")}
            aria-label={t("appFolders.unlink")}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * AGENTS.md discovery panel.
 *
 * One collapsible per linked folder, following the AgentPermissionsSettings
 * pattern: header card with chevron rotate-90, content below it (pl-4).
 * Folders with files start expanded; empty ones stay collapsed.
 */
function AgentsMdSection({
  appId,
  hasFolders,
}: {
  appId: number;
  hasFolders: boolean;
}) {
  const { t, tPlural } = useI18n();
  const {
    data,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["agents-md-files", appId],
    queryFn: () => agentsMdFileClient.listAgentsMdFiles({ appId }),
    enabled: !!appId && hasFolders,
  });

  const scans: AgentsMdFolderScan[] = data?.folders ?? [];
  const totalFiles = scans.reduce((acc, f) => acc + f.files.length, 0);

  // Track which folder cards are expanded. Open the ones with files by
  // default; empty folders stay collapsed.
  const [openSet, setOpenSet] = useState<Set<number>>(new Set());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!scans) return;
    setOpenSet((prev) => {
      const next = new Set(prev);
      let mutated = false;
      for (const s of scans) {
        if (s.files.length > 0 && !next.has(s.folderId)) {
          next.add(s.folderId);
          mutated = true;
        }
      }
      return mutated ? next : prev;
    });
  }, [scans]);

  const toggle = (folderId: number) => {
    setOpenSet((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  return (
    <section className="bg-card rounded-2xl shadow-sm border border-border p-8">
      <div className="flex justify-between items-center gap-4">
        <h2 className="typo-section-title mb-2">
          {t("appSettings.agentsMdTitle")}
        </h2>
        {!isLoading && !error && (
          <span className="typo-caption text-muted-foreground shrink-0">
            {tPlural("appSettings.agentsMdCount", totalFiles)}
          </span>
        )}
      </div>
      <p className="typo-caption mb-8">{" "}
        {t("appSettings.agentsMdDesc")}
      </p>

      {!hasFolders && (
        <div className="py-12 text-center text-muted-foreground rounded-xl bg-muted/30 border border-dashed border-border">
          <FileText className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="typo-label">{t("appSettings.agentsMdNoFolders")}</p>
        </div>
      )}
      {hasFolders && isLoading && (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          {t("common.loading")}
        </div>
      )}
      {hasFolders && error && (
        <div className="text-sm text-destructive py-4">
          {t("common.loadError", { error: (error as Error).message })}
        </div>
      )}
      {hasFolders && !isLoading && !error && scans.length === 0 && (
        <div className="py-12 text-center text-muted-foreground rounded-xl bg-muted/30 border border-dashed border-border">
          <FileText className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="typo-label">{t("appSettings.agentsMdEmpty")}</p>
        </div>
      )}
      {hasFolders && !isLoading && !error && scans.length > 0 && (
        <div className="space-y-4">
          {scans.map((scan) => {
            const isOpen = openSet.has(scan.folderId);
            return (
              <div key={scan.folderId} data-testid={`agents-md-folder-${scan.folderId}`}>
                {/* Collapsible header — AgentPermissionsSettings pattern */}
                <div
                  className="flex items-center justify-between cursor-pointer group p-4 rounded-xl border border-border hover:bg-muted/50 transition-colors gap-4"
                  onClick={() => toggle(scan.folderId)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground/70" />
                      <span className="typo-label truncate">{scan.folderLabel}</span>
                      {scan.isPrimary && (
                        <Badge variant="secondary" className="shrink-0 typo-badge">
                          Primary
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="typo-caption text-muted-foreground">
                      {tPlural("appSettings.agentsMdCount", scan.files.length)}
                    </span>
                    <ChevronRight
                      className={cn(
                        "size-5 text-muted-foreground/50 group-hover:text-foreground transition-transform duration-200 shrink-0",
                        isOpen && "rotate-90",
                      )}
                    />
                  </div>
                </div>

                {/* Expanded content — outside the header card, indented */}
                {isOpen && (
                  <div className="pl-4 space-y-0">
                    {scan.files.length === 0 ? (
                      <p className="typo-caption text-muted-foreground px-4 py-3">
                        {t("appSettings.agentsMdNoFiles")}
                      </p>
                    ) : (
                      <div className="pl-4 space-y-0 border-l-2 border-border/40">
                        {scan.files.map((f) => (
                          <div
                            key={f.absolutePath}
                            className="flex items-center justify-between gap-4 p-4 rounded-xl hover:bg-muted/50 transition-colors"
                            title={f.absolutePath}
                          >
                            <span className="typo-mono-xs font-medium truncate">
                              AGENTS.md
                            </span>
                            <span className="typo-mono-xs text-muted-foreground truncate">
                              {f.relativePath}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
