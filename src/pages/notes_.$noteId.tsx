import { useParams } from "@tanstack/react-router";
import { useNote } from "@/hooks/useNote";
import { NoteEditor } from "@/components/notes/NoteEditor";
import { ipc } from "@/ipc/types";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { useState, useEffect } from "react";
import { showError } from "@/lib/toast";

export default function NoteDetailPage() {
  const { noteId } = useParams({ from: "/notes/$noteId" });
  const numericNoteId = parseInt(noteId);
  const { note, loading } = useNote(numericNoteId);
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  // Sync local state with fetched note
  useEffect(() => {
    if (note) {
      setTitle(note.title);
      setContent(note.content);
    }
  }, [note]);

  // Debounced save function
  useEffect(() => {
    if (!note) return;

    // Don't save if nothing changed
    if (title === note.title && content === note.content) {
      return;
    }

    const timeoutId = setTimeout(async () => {
      try {
        await ipc.note.updateNote({
          noteId: numericNoteId,
          title: title || "Nueva nota",
          content,
        });

        // Invalidate queries to update the list
        queryClient.invalidateQueries({ queryKey: queryKeys.notes.all });
        queryClient.invalidateQueries({
          queryKey: queryKeys.notes.detail({ noteId: numericNoteId }),
        });
      } catch (error) {
        showError(`Error al guardar nota: ${(error as Error).message}`);
      }
    }, 1000); // 1 second debounce

    return () => clearTimeout(timeoutId);
  }, [title, content, note, numericNoteId, queryClient]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-muted-foreground">Cargando nota...</p>
        </div>
      </div>
    );
  }

  if (!note) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Nota no encontrada</h1>
          <p className="text-muted-foreground">
            La nota que buscas no existe o ha sido eliminada
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-muted/30 text-foreground overflow-y-auto overflow-x-hidden">
      <div className="w-full mx-auto px-8 pt-12 pb-4">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Sin título"
          className="w-full text-4xl font-bold border-none focus:outline-none px-0 bg-transparent text-foreground placeholder:text-muted-foreground/40"
        />
      </div>
      <div className="flex-1 w-full flex flex-col items-center pb-12">
        <NoteEditor content={content} onUpdate={setContent} />
      </div>
    </div>
  );
}
