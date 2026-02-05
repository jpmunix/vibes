import { db } from "../../db";
import { notes } from "../../db/schema";
import { desc, eq } from "drizzle-orm";
import type { NoteSummary } from "../../lib/schemas";

import log from "electron-log";
import { createTypedHandler } from "./base";
import { noteContracts } from "../types/note";

const logger = log.scope("note_handlers");

export function registerNoteHandlers() {
  createTypedHandler(noteContracts.createNote, async () => {
    // Create a new note with default values
    const [note] = await db
      .insert(notes)
      .values({
        title: "Nueva nota",
        content: "",
      })
      .returning();
    logger.info("Created note:", note.id);
    return note.id;
  });

  createTypedHandler(noteContracts.getNote, async (_, noteId) => {
    const note = await db.query.notes.findFirst({
      where: eq(notes.id, noteId),
    });

    if (!note) {
      throw new Error("Note not found");
    }

    return note;
  });

  createTypedHandler(noteContracts.getNotes, async () => {
    const allNotes = await db.query.notes.findMany({
      columns: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [desc(notes.updatedAt)],
    });

    return allNotes as NoteSummary[];
  });

  createTypedHandler(noteContracts.deleteNote, async (_, noteId) => {
    await db.delete(notes).where(eq(notes.id, noteId));
    logger.info("Deleted note:", noteId);
  });

  createTypedHandler(noteContracts.updateNote, async (_, params) => {
    const { noteId, title, content } = params;
    const updateData: Partial<{ title: string; content: string }> = {};

    if (title !== undefined) {
      updateData.title = title;
    }
    if (content !== undefined) {
      updateData.content = content;
    }

    if (Object.keys(updateData).length > 0) {
      await db.update(notes).set(updateData).where(eq(notes.id, noteId));
      logger.info("Updated note:", noteId);
    }
  });

  logger.debug("Registered note IPC handlers");
}
