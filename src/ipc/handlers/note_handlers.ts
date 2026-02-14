import { db } from "../../db";
import { notes } from "../../db/schema";
import { desc, eq } from "drizzle-orm";
import type { NoteSummary } from "../../lib/schemas";

import log from "electron-log";
import { dialog } from "electron";
import fs from "fs/promises";
import HTMLToDOCX from "html-to-docx";
import { createTypedHandler } from "./base";
import { noteContracts } from "../types/note";

const logger = log.scope("note_handlers");

export function registerNoteHandlers() {
  createTypedHandler(noteContracts.createNote, async (_, params) => {
    // Create a new note with default values
    const [note] = await db
      .insert(notes)
      .values({
        title: params?.title || "Nueva nota",
        content: params?.content || "",
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
        content: true,
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

  createTypedHandler(noteContracts.exportNote, async (_, { noteId }) => {
    const note = await db.query.notes.findFirst({
      where: eq(notes.id, noteId),
    });

    if (!note) {
      throw new Error("Note not found");
    }

    const { filePath, canceled } = await dialog.showSaveDialog({
      title: "Exportar Nota",
      defaultPath: `${note.title || "Nota"}.docx`,
      filters: [{ name: "Documento Word", extensions: ["docx"] }],
    });

    if (canceled || !filePath) {
      return false;
    }

    try {
      // Basic HTML wrapper to ensure it's valid and has the title
      const fullHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
        </head>
        <body>
          <h1>${note.title}</h1>
          ${note.content}
        </body>
        </html>
      `;

      const fileBuffer = await (HTMLToDOCX as any)(fullHtml, null, {
        title: note.title,
        creator: "Minube Vibes",
        description: "Nota exportada desde Minube Vibes",
      });

      await fs.writeFile(filePath, Buffer.from(fileBuffer));
      logger.info("Exported note to:", filePath);
      return true;
    } catch (error) {
      logger.error("Failed to export note:", error);
      throw error;
    }
  });

  logger.debug("Registered note IPC handlers");
}
