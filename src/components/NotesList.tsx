import { useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { PlusCircle, Trash2, Edit3 } from "lucide-react";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuAction,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useNotes } from "@/hooks/useNotes";
import { ipc } from "@/ipc/types";
import { showError, showSuccess } from "@/lib/toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export function NotesList({ show }: { show?: boolean }) {
  const navigate = useNavigate();
  const routerState = useRouterState();
  const { notes, loading, invalidateNotes } = useNotes();

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteNoteId, setDeleteNoteId] = useState<number | null>(null);
  const [deleteNoteTitle, setDeleteNoteTitle] = useState("");

  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [renameNoteId, setRenameNoteId] = useState<number | null>(null);
  const [renameNoteTitle, setRenameNoteTitle] = useState("");
  const [busyNoteIds, setBusyNoteIds] = useState<Set<number>>(new Set());

  // Get current note ID from route
  const currentNoteId =
    routerState.location.pathname.startsWith("/notes/") &&
      routerState.location.pathname !== "/notes"
      ? parseInt(routerState.location.pathname.split("/")[2])
      : null;

  if (!show) return null;

  const handleNewNote = async () => {
    try {
      const noteId = await ipc.note.createNote();
      await invalidateNotes();
      navigate({ to: "/notes/$noteId", params: { noteId: String(noteId) } });
    } catch (error) {
      showError(`Error al crear nota: ${(error as Error).message}`);
    }
  };

  const handleNoteClick = (noteId: number) => {
    navigate({ to: "/notes/$noteId", params: { noteId: String(noteId) } });
  };

  const handleDeleteClick = (noteId: number, noteTitle: string) => {
    if (busyNoteIds.has(noteId) || currentNoteId === noteId) return;
    setDeleteNoteId(noteId);
    setDeleteNoteTitle(noteTitle);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (deleteNoteId === null) return;

    try {
      setBusyNoteIds((prev) => new Set(prev).add(deleteNoteId));
      await ipc.note.deleteNote(deleteNoteId);
      showSuccess("Nota eliminada correctamente");

      // If the deleted note was selected, navigate to notes home
      if (currentNoteId === deleteNoteId) {
        navigate({ to: "/notes" });
      }

      await invalidateNotes();
    } catch (error) {
      showError(`Error al eliminar nota: ${(error as Error).message}`);
    } finally {
      setBusyNoteIds((prev) => {
        const next = new Set(prev);
        next.delete(deleteNoteId);
        return next;
      });
      setIsDeleteDialogOpen(false);
      setDeleteNoteId(null);
      setDeleteNoteTitle("");
    }
  };

  const handleRenameClick = (noteId: number, currentTitle: string) => {
    if (busyNoteIds.has(noteId) || currentNoteId === noteId) return;
    setRenameNoteId(noteId);
    setRenameNoteTitle(currentTitle);
    setIsRenameDialogOpen(true);
  };

  const handleConfirmRename = async () => {
    if (renameNoteId === null) return;

    try {
      setBusyNoteIds((prev) => new Set(prev).add(renameNoteId));
      await ipc.note.updateNote({
        noteId: renameNoteId,
        title: renameNoteTitle,
      });
      showSuccess("Nota renombrada correctamente");
      await invalidateNotes();
    } catch (error) {
      showError(`Error al renombrar nota: ${(error as Error).message}`);
    } finally {
      setBusyNoteIds((prev) => {
        const next = new Set(prev);
        next.delete(renameNoteId);
        return next;
      });
      setIsRenameDialogOpen(false);
      setRenameNoteId(null);
      setRenameNoteTitle("");
    }
  };

  return (
    <>
      <SidebarGroup
        className="overflow-y-auto h-[calc(100vh-112px)]"
        data-testid="notes-list-container"
      >
        <SidebarGroupLabel>Notas</SidebarGroupLabel>
        <SidebarGroupContent>
          <div className="flex flex-col space-y-4">
            <Button
              onClick={handleNewNote}
              variant="outline"
              className="flex items-center justify-start gap-2 ml-2 mr-6 py-3"
            >
              <PlusCircle size={16} />
              <span>Nueva nota</span>
            </Button>

            {loading ? (
              <div className="py-3 px-4 text-sm text-gray-500">
                Cargando notas...
              </div>
            ) : notes.length === 0 ? (
              <div className="py-3 px-4 text-sm text-gray-500">
                No hay notas aún
              </div>
            ) : (
              <SidebarMenu className="space-y-1">
                {notes.map((note) => (
                  <SidebarMenuItem key={note.id} className="mb-1">
                    <div className="flex ml-2 mr-6 items-center relative group/menu-item">
                      <Button
                        variant="ghost"
                        onClick={() => handleNoteClick(note.id)}
                        className={`justify-start h-11 w-full text-left pr-1 hover:bg-sidebar-accent/80 ${currentNoteId === note.id
                            ? "bg-blue-600/10 text-blue-600 dark:text-blue-400"
                            : ""
                          }`}
                      >
                        <div className="flex flex-col w-full relative overflow-hidden">
                          <span
                            className={`truncate mr-16 ${currentNoteId === note.id ? "font-semibold" : ""
                              }`}
                          >
                            {note.title}
                          </span>
                          <span
                            className={`text-xs ${currentNoteId === note.id
                                ? "text-blue-600/70 dark:text-blue-400/70"
                                : "text-gray-500"
                              }`}
                          >
                            {formatDistanceToNow(new Date(note.updatedAt), {
                              addSuffix: true,
                              locale: es,
                            })}
                          </span>
                        </div>
                      </Button>

                      {/* Hover gradient shadow */}
                      <div
                        className={`absolute right-0 top-0 bottom-0 w-24 pointer-events-none opacity-0 group-hover/menu-item:opacity-100 transition-opacity z-10
                        ${currentNoteId === note.id
                            ? "bg-gradient-to-l from-[#f0f4ff] dark:from-[#1e2433] via-[#f0f4ff]/90 dark:via-[#1e2433]/90 to-transparent"
                            : "bg-gradient-to-l from-[var(--sidebar-accent)] via-[var(--sidebar-accent)]/90 to-transparent"
                          }`}
                      />

                      {!busyNoteIds.has(note.id) &&
                        currentNoteId !== note.id && (
                          <>
                            <SidebarMenuAction
                              showOnHover
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRenameClick(note.id, note.title);
                              }}
                              className="right-8 z-20"
                            >
                              <Edit3 className="h-4 w-4" />
                            </SidebarMenuAction>
                            <SidebarMenuAction
                              showOnHover
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteClick(note.id, note.title);
                              }}
                              className="right-1 z-20 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                            >
                              <Trash2 className="h-4 w-4" />
                            </SidebarMenuAction>
                          </>
                        )}
                    </div>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            )}
          </div>
        </SidebarGroupContent>
      </SidebarGroup>

      {/* Delete Dialog */}
      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar nota?</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas eliminar la nota "{deleteNoteTitle}"?
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rename Dialog */}
      <Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renombrar nota</DialogTitle>
          </DialogHeader>
          <Input
            value={renameNoteTitle}
            onChange={(e) => setRenameNoteTitle(e.target.value)}
            placeholder="Título de la nota"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleConfirmRename();
              }
            }}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsRenameDialogOpen(false)}
            >
              Cancelar
            </Button>
            <Button onClick={handleConfirmRename}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
