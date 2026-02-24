import { getRemoteDb } from "../../db/remote";
import * as remoteSchema from "../../db/remote-schema";
import { desc, eq, and } from "drizzle-orm";
import type { NoteSummary } from "../../lib/schemas";

import log from "electron-log";
import { dialog } from "electron";
import fs from "fs/promises";
import HTMLToDOCX from "html-to-docx";
import { createTypedHandler } from "./base";
import { noteContracts } from "../types/note";

const logger = log.scope("note_handlers");

export function registerNoteHandlers() {
  createTypedHandler(noteContracts.createNote, async (_, params, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    // Create a new note with default values
    const [note] = await db
      .insert(remoteSchema.notes)
      .values({
        userId: context.userId,
        title: params?.title || "Nueva nota",
        content: params?.content || "",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    logger.info("Created note:", note.id);
    return note.id;
  });

  createTypedHandler(noteContracts.getNote, async (_, noteId, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    const note = await db.query.notes.findFirst({
      where: and(eq(remoteSchema.notes.id, noteId), eq(remoteSchema.notes.userId, context.userId)),
    });

    if (!note) {
      throw new Error("Note not found");
    }

    return note;
  });

  createTypedHandler(noteContracts.getNotes, async (_, __, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    const allNotes = await db.query.notes.findMany({
      where: eq(remoteSchema.notes.userId, context.userId),
      columns: {
        id: true,
        title: true,
        content: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [desc(remoteSchema.notes.updatedAt)],
    });

    return allNotes as NoteSummary[];
  });

  createTypedHandler(noteContracts.deleteNote, async (_, noteId, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    await db.delete(remoteSchema.notes).where(and(eq(remoteSchema.notes.id, noteId), eq(remoteSchema.notes.userId, context.userId)));
    logger.info("Deleted note:", noteId);
  });

  createTypedHandler(noteContracts.updateNote, async (_, params, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    const { noteId, title, content } = params;
    const updateData: Partial<{ title: string; content: string; updatedAt: Date }> = {
      updatedAt: new Date(),
    };

    if (title !== undefined) {
      updateData.title = title;
    }
    if (content !== undefined) {
      updateData.content = content;
    }

    if (Object.keys(updateData).length > 1) { // > 1 because updatedAt is always there
      await db.update(remoteSchema.notes).set(updateData).where(and(eq(remoteSchema.notes.id, noteId), eq(remoteSchema.notes.userId, context.userId)));
      logger.info("Updated note:", noteId);
    }
  });

  createTypedHandler(noteContracts.exportNote, async (_, { noteId }, context) => {
    if (!context.userId) throw new Error("Unauthorized");
    const db = getRemoteDb();
    const note = await db.query.notes.findFirst({
      where: and(eq(remoteSchema.notes.id, noteId), eq(remoteSchema.notes.userId, context.userId)),
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
