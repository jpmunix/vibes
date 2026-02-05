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
    <div className="flex flex-col h-screen p-6 max-w-[1400px] w-full mx-auto">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Título de la nota"
        className="text-3xl font-bold border-none focus:outline-none px-0 mb-4 bg-transparent"
      />
      <div className="flex-1 overflow-auto">
        <NoteEditor content={content} onUpdate={setContent} />
      </div>
    </div>
  );
}
